import { Test, TestingModule } from '@nestjs/testing';
import { EmqxAuthService } from '../services/emqx-auth.service';
import { DatabaseService } from '@app/database';
import * as crypto from 'crypto';

// ─── Mocks ───────────────────────────────────
const MOCK_MQTT_USER = 'smarthome-server';
const MOCK_MQTT_PASS = 'server-mqtt-password';
const MOCK_APP_SECRET = 'test-hmac-secret-key';
const MOCK_USER_ID = 'user-abc-123';
const MOCK_DEVICE_TOKEN = 'device-token-xyz';
const MOCK_SHARED_DEVICE_TOKEN = 'shared-device-token';
const MOCK_OTHER_DEVICE_TOKEN = 'other-device-token';

const MOCK_TIMESTAMP = '1711411200000';

function generateHmac(userId: string, timestamp: string): string {
  return crypto
    .createHmac('sha256', MOCK_APP_SECRET)
    .update(`${userId}:${timestamp}`)
    .digest('hex');
}

const createMockDatabaseService = () => ({
  device: {
    findUnique: jest.fn(),
  },
  deviceShare: {
    findFirst: jest.fn(),
  },
});

describe('EmqxAuthService', () => {
  let service: EmqxAuthService;
  let db: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    db = createMockDatabaseService();

    // Set env vars for test
    process.env.MQTT_USER = MOCK_MQTT_USER;
    process.env.MQTT_PASS = MOCK_MQTT_PASS;
    process.env.APP_MQTT_SECRET = MOCK_APP_SECRET;
    process.env.MQTT_WSS_URL = 'wss://test.example.com:8084/mqtt';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmqxAuthService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get<EmqxAuthService>(EmqxAuthService);
  });

  afterEach(() => {
    delete process.env.MQTT_USER;
    delete process.env.MQTT_PASS;
    delete process.env.APP_MQTT_SECRET;
    delete process.env.MQTT_WSS_URL;
  });

  // ═══════════════════════════════════════════
  // AUTHENTICATE
  // ═══════════════════════════════════════════
  describe('authenticate', () => {
    it('should allow server credentials (iot-gateway, worker)', () => {
      const result = service.authenticate({
        username: MOCK_MQTT_USER,
        password: MOCK_MQTT_PASS,
        clientid: 'server-iot-gw',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny server credentials with wrong password', () => {
      const result = service.authenticate({
        username: MOCK_MQTT_USER,
        password: 'wrong-password',
        clientid: 'server-iot-gw',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should allow app user with valid HMAC', () => {
      const password = generateHmac(MOCK_USER_ID, MOCK_TIMESTAMP);
      const result = service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password,
        clientid: `app_${MOCK_USER_ID}_${MOCK_TIMESTAMP}`,
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny app user with invalid HMAC', () => {
      const result = service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password: 'invalid-hmac-value',
        clientid: `app_${MOCK_USER_ID}_${MOCK_TIMESTAMP}`,
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny unknown username format', () => {
      const result = service.authenticate({
        username: 'unknown_format',
        password: 'any',
        clientid: 'any',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny when clientid has no timestamp', () => {
      const result = service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password: 'any',
        clientid: 'malformed-clientid',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny when clientid has empty timestamp segment', () => {
      const result = service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password: 'any',
        clientid: 'app_user_', // trailing underscore → empty timestamp
      });
      expect(result).toEqual({ result: 'deny' });
    });
  });

  // ═══════════════════════════════════════════
  // AUTHORIZE (ACL)
  // ═══════════════════════════════════════════
  describe('authorize', () => {
    it('should allow server username for any action', async () => {
      const result = await service.authorize({
        username: MOCK_MQTT_USER,
        topic: '+/+/any-token/state',
        action: 'publish',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny app user from publishing', async () => {
      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: '+/+/any-token/state',
        action: 'publish',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should allow user to subscribe to owned device', async () => {
      db.device.findUnique.mockResolvedValue({
        id: 'dev-1',
        ownerId: MOCK_USER_ID,
      });

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `COMPANY/MODEL/${MOCK_DEVICE_TOKEN}/state`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'allow' });
      expect(db.device.findUnique).toHaveBeenCalledWith({
        where: { token: MOCK_DEVICE_TOKEN },
        select: { id: true, ownerId: true },
      });
    });

    it('should allow user to subscribe to shared device', async () => {
      db.device.findUnique.mockResolvedValue({
        id: 'dev-shared',
        ownerId: 'other-owner',
      });
      db.deviceShare.findFirst.mockResolvedValue({
        id: 'share-1',
        deviceId: 'dev-shared',
        userId: MOCK_USER_ID,
      });

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `COMPANY/MODEL/${MOCK_SHARED_DEVICE_TOKEN}/state`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny user subscribing to unowned/unshared device', async () => {
      db.device.findUnique.mockResolvedValue({
        id: 'dev-other',
        ownerId: 'another-user',
      });
      db.deviceShare.findFirst.mockResolvedValue(null);

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `COMPANY/MODEL/${MOCK_OTHER_DEVICE_TOKEN}/state`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny if device token not found', async () => {
      db.device.findUnique.mockResolvedValue(null);

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `COMPANY/MODEL/non-existent-token/state`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny if topic format is invalid (no token)', async () => {
      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: 'invalid-topic',
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny if topic has empty token segment', async () => {
      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: 'COMPANY/MODEL//state', // empty token
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny unknown username format', async () => {
      const result = await service.authorize({
        username: 'unknown_format',
        topic: '+/+/any/state',
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny and log when DB throws an error', async () => {
      db.device.findUnique.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `COMPANY/MODEL/${MOCK_DEVICE_TOKEN}/state`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });
  });

  // ═══════════════════════════════════════════
  // GENERATE CREDENTIALS
  // ═══════════════════════════════════════════
  describe('generateCredentials', () => {
    it('should return valid MQTT credentials', () => {
      const creds = service.generateCredentials(MOCK_USER_ID);

      expect(creds.url).toBe('wss://test.example.com:8084/mqtt');
      expect(creds.username).toBe(`user_${MOCK_USER_ID}`);
      expect(creds.clientId).toMatch(
        new RegExp(`^app_${MOCK_USER_ID}_\\d+$`),
      );
      expect(creds.password).toBeTruthy();
      expect(typeof creds.password).toBe('string');
      expect(creds.password.length).toBeGreaterThan(0);
    });

    it('should generate password that passes authenticate', () => {
      const creds = service.generateCredentials(MOCK_USER_ID);

      const result = service.authenticate({
        username: creds.username,
        password: creds.password,
        clientid: creds.clientId,
      });
      expect(result).toEqual({ result: 'allow' });
    });
  });
});
