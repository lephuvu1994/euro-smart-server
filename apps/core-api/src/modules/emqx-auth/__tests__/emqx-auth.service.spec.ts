import { Test, TestingModule } from '@nestjs/testing';
import { EmqxAuthService } from '../services/emqx-auth.service';
import { DatabaseService } from '@app/database';
import * as crypto from 'crypto';

// ─── Test Constants ───────────────────────────
const MOCK_MQTT_USER = 'smarthome-server';
const MOCK_MQTT_PASS = 'server-mqtt-password';
const MOCK_APP_SECRET = 'test-hmac-secret-key';
const MOCK_USER_ID = 'user-abc-123';
const MOCK_DEVICE_TOKEN = 'device-token-xyz';
const MOCK_SHARED_DEVICE_TOKEN = 'shared-device-token';
const MOCK_OTHER_DEVICE_TOKEN = 'other-device-token';
const MOCK_WSS_URL = 'wss://test.example.com:8084/mqtt';
const MOCK_TIMESTAMP = '1711411200000';

function generateHmac(userId: string, timestamp: string): string {
  return crypto
    .createHmac('sha256', MOCK_APP_SECRET)
    .update(`${userId}:${timestamp}`)
    .digest('hex');
}

// ─── DB Mock Factory ──────────────────────────
const createMockDatabaseService = () => ({
  systemConfig: {
    findUnique: jest.fn(),
  },
  device: {
    findUnique: jest.fn(),
  },
  deviceShare: {
    findFirst: jest.fn(),
  },
});

// Helper: set systemConfig mock to return MQTT creds from DB
function mockSystemConfig(
  db: ReturnType<typeof createMockDatabaseService>,
  overrides: Record<string, string | null> = {},
) {
  db.systemConfig.findUnique.mockImplementation(
    ({ where }: { where: { key: string } }) => {
      const defaults: Record<string, string> = {
        MQTT_USER: MOCK_MQTT_USER,
        MQTT_PASS: MOCK_MQTT_PASS,
        MQTT_WSS_URL: MOCK_WSS_URL,
      };
      const val =
        overrides[where.key] !== undefined
          ? overrides[where.key]
          : defaults[where.key];
      return Promise.resolve(
        val !== null && val !== undefined
          ? { key: where.key, value: val }
          : null,
      );
    },
  );
}

describe('EmqxAuthService', () => {
  let service: EmqxAuthService;
  let db: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    db = createMockDatabaseService();

    process.env.MQTT_USER = MOCK_MQTT_USER;
    process.env.MQTT_PASS = MOCK_MQTT_PASS;
    process.env.APP_MQTT_SECRET = MOCK_APP_SECRET;
    process.env.MQTT_WSS_URL = MOCK_WSS_URL;

    const module: TestingModule = await Test.createTestingModule({
      providers: [EmqxAuthService, { provide: DatabaseService, useValue: db }],
    }).compile();

    service = module.get<EmqxAuthService>(EmqxAuthService);
  });

  afterEach(() => {
    delete process.env.MQTT_USER;
    delete process.env.MQTT_PASS;
    delete process.env.APP_MQTT_SECRET;
    delete process.env.MQTT_WSS_URL;
    jest.clearAllMocks();
  });

  // ═══════════════════════════════════════════
  // AUTHENTICATE
  // ═══════════════════════════════════════════
  describe('authenticate', () => {
    // --- Case 1: Server superuser ---
    it('should allow server credentials from DB config', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: MOCK_MQTT_USER,
        password: MOCK_MQTT_PASS,
        clientid: 'server-iot-gw',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should allow server credentials from ENV fallback when DB empty', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);
      const result = await service.authenticate({
        username: MOCK_MQTT_USER,
        password: MOCK_MQTT_PASS,
        clientid: 'server-iot-gw',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny server credentials with wrong password', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: MOCK_MQTT_USER,
        password: 'wrong-password',
        clientid: 'server-iot-gw',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    // --- Case 2: App user (HMAC) ---
    it('should allow app user with valid HMAC', async () => {
      mockSystemConfig(db);
      const password = generateHmac(MOCK_USER_ID, MOCK_TIMESTAMP);
      const result = await service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password,
        clientid: `app_${MOCK_USER_ID}_${MOCK_TIMESTAMP}`,
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny app user with invalid HMAC', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password: 'invalid-hmac-value',
        clientid: `app_${MOCK_USER_ID}_${MOCK_TIMESTAMP}`,
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny when clientid has no timestamp', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password: 'any',
        clientid: 'malformed-clientid',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny when clientid has empty timestamp segment', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: `user_${MOCK_USER_ID}`,
        password: 'any',
        clientid: 'app_user_', // trailing underscore → empty timestamp
      });
      expect(result).toEqual({ result: 'deny' });
    });

    // --- Case 3: Embedded device (device_{token}) ---
    it('should allow embedded device with valid token (password === token)', async () => {
      mockSystemConfig(db);
      db.device.findUnique.mockResolvedValue({ id: 'dev-1' });

      const result = await service.authenticate({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        password: MOCK_DEVICE_TOKEN,
        clientid: MOCK_DEVICE_TOKEN,
      });
      expect(result).toEqual({ result: 'allow' });
      expect(db.device.findUnique).toHaveBeenCalledWith({
        where: { token: MOCK_DEVICE_TOKEN },
        select: { id: true },
      });
    });

    it('should deny embedded device with wrong password', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        password: 'wrong-password',
        clientid: MOCK_DEVICE_TOKEN,
      });
      expect(result).toEqual({ result: 'deny' });
      expect(db.device.findUnique).not.toHaveBeenCalled();
    });

    it('should deny embedded device when token not found in DB', async () => {
      mockSystemConfig(db);
      db.device.findUnique.mockResolvedValue(null);

      const result = await service.authenticate({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        password: MOCK_DEVICE_TOKEN,
        clientid: MOCK_DEVICE_TOKEN,
      });
      expect(result).toEqual({ result: 'deny' });
    });

    // --- Unknown format ---
    it('should deny unknown username format', async () => {
      mockSystemConfig(db);
      const result = await service.authenticate({
        username: 'unknown_format',
        password: 'any',
        clientid: 'any',
      });
      expect(result).toEqual({ result: 'deny' });
    });
  });

  // ═══════════════════════════════════════════
  // AUTHORIZE (ACL)
  // ═══════════════════════════════════════════
  describe('authorize', () => {
    it('should allow server username for any action (from DB config)', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: MOCK_MQTT_USER,
        topic: '+/+/any-token/state',
        action: 'publish',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should allow server username from ENV fallback when DB empty', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);
      const result = await service.authorize({
        username: MOCK_MQTT_USER,
        topic: 'any/topic',
        action: 'publish',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    // --- Embedded device ACL ---
    it('should allow device to subscribe to its own topic', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        topic: `device/${MOCK_DEVICE_TOKEN}/set`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should allow device to publish to its own topic', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        topic: `device/${MOCK_DEVICE_TOKEN}/status`,
        action: 'publish',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny device from publishing to another device topic', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        topic: `device/${MOCK_OTHER_DEVICE_TOKEN}/status`,
        action: 'publish',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny device trying to subscribe to another device topic', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `device_${MOCK_DEVICE_TOKEN}`,
        topic: `device/${MOCK_OTHER_DEVICE_TOKEN}/set`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    // --- App user ACL ---
    it('should deny app user from publishing', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `device/any-token/state`,
        action: 'publish',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should allow user to subscribe to owned device', async () => {
      mockSystemConfig(db);
      db.device.findUnique.mockResolvedValue({
        id: 'dev-1',
        ownerId: MOCK_USER_ID,
      });

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `device/${MOCK_DEVICE_TOKEN}/status`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'allow' });
      expect(db.device.findUnique).toHaveBeenCalledWith({
        where: { token: MOCK_DEVICE_TOKEN },
        select: { id: true, ownerId: true },
      });
    });

    it('should allow user to subscribe to shared device', async () => {
      mockSystemConfig(db);
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
        topic: `device/${MOCK_SHARED_DEVICE_TOKEN}/status`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'allow' });
    });

    it('should deny user subscribing to unowned/unshared device', async () => {
      mockSystemConfig(db);
      db.device.findUnique.mockResolvedValue({
        id: 'dev-other',
        ownerId: 'another-user',
      });
      db.deviceShare.findFirst.mockResolvedValue(null);

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `device/${MOCK_OTHER_DEVICE_TOKEN}/status`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny if device token not found in DB', async () => {
      mockSystemConfig(db);
      db.device.findUnique.mockResolvedValue(null);

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `device/non-existent-token/state`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny if topic format is invalid (no token)', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: 'invalid-topic',
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny if topic has empty token segment', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: 'COMPANY/MODEL//state', // empty token
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny unknown username format', async () => {
      mockSystemConfig(db);
      const result = await service.authorize({
        username: 'unknown_format',
        topic: '+/+/any/state',
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });

    it('should deny and log when DB throws an error', async () => {
      mockSystemConfig(db);
      db.device.findUnique.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.authorize({
        username: `user_${MOCK_USER_ID}`,
        topic: `device/${MOCK_DEVICE_TOKEN}/status`,
        action: 'subscribe',
      });
      expect(result).toEqual({ result: 'deny' });
    });
  });

  // ═══════════════════════════════════════════
  // GENERATE CREDENTIALS
  // ═══════════════════════════════════════════
  describe('generateCredentials', () => {
    it('should return valid MQTT credentials with WSS URL from DB', async () => {
      mockSystemConfig(db);
      const creds = await service.generateCredentials(MOCK_USER_ID);

      expect(creds.url).toBe(MOCK_WSS_URL);
      expect(creds.username).toBe(`user_${MOCK_USER_ID}`);
      expect(creds.clientId).toMatch(new RegExp(`^app_${MOCK_USER_ID}_\\d+$`));
      expect(creds.password).toBeTruthy();
      expect(typeof creds.password).toBe('string');
    });

    it('should fall back to ENV MQTT_WSS_URL when DB returns null', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);
      const creds = await service.generateCredentials(MOCK_USER_ID);

      expect(creds.url).toBe(MOCK_WSS_URL); // from ENV
      expect(creds.username).toBe(`user_${MOCK_USER_ID}`);
    });

    it('should generate password that passes authenticate', async () => {
      mockSystemConfig(db);
      const creds = await service.generateCredentials(MOCK_USER_ID);

      const result = await service.authenticate({
        username: creds.username,
        password: creds.password,
        clientid: creds.clientId,
      });
      expect(result).toEqual({ result: 'allow' });
    });
  });
});
