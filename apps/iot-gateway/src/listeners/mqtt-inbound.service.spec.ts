import { Test, TestingModule } from '@nestjs/testing';

jest.mock('expo-server-sdk', () => ({
  __esModule: true,
  default: jest.fn(),
  Expo: jest.fn(),
}));

import { MqttInboundService } from './mqtt-inbound.service';
import { DatabaseService } from '@app/database';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { RedisService } from '@app/redis-cache';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common/enums/app.enum';
import { DEVICE_JOBS } from '@app/common/enums/device-job.enum';

jest.mock('@faker-js/faker', () => ({
  faker: {
    string: { alphanumeric: () => 'abc', uuid: () => 'uuid' },
    internet: { email: () => 'test@test.com' },
    person: { firstName: () => 'First', lastName: () => 'Last' },
    number: { int: () => 1 },
    phone: { number: () => '123' },
    date: { past: () => new Date(), future: () => new Date() },
    datatype: { boolean: () => true },
  },
}));

const mockDeviceToken = 'token-123';
const mockTopic = `company/model/${mockDeviceToken}/state`;

const mockDevice = {
  id: 'dev-1',
  token: mockDeviceToken,
  entities: [
    {
      id: 'entity-1',
      code: 'light_1',
      commandKey: 'state',
      attributes: [
        { key: 'brightness', config: {} },
        { key: 'color_temp', config: { commandKey: 'ct' } },
      ],
    },
  ],
};

const mockDbService = {
  device: { findUnique: jest.fn(), findFirst: jest.fn() },
};

const mockMqttService = {
  subscribe: jest.fn(),
};

const mockRedisService = {
  hmset: jest.fn(),
  hgetall: jest.fn(),
  hset: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  sadd: jest.fn(),
  publish: jest.fn(),
};

const mockStatusQueue = { add: jest.fn() };
const mockControlQueue = { add: jest.fn() };
const mockNotificationQueue = { add: jest.fn() };

describe('MqttInboundService', () => {
  let service: MqttInboundService;
  let db: typeof mockDbService;
  let redis: typeof mockRedisService;
  let controlQueue: typeof mockControlQueue;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttInboundService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: MqttService, useValue: mockMqttService },
        { provide: RedisService, useValue: mockRedisService },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.DEVICE_STATUS),
          useValue: mockStatusQueue,
        },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL),
          useValue: mockControlQueue,
        },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.PUSH_NOTIFICATION),
          useValue: mockNotificationQueue,
        },
      ],
    }).compile();

    service = module.get<MqttInboundService>(MqttInboundService);
    db = module.get(DatabaseService);
    redis = module.get(RedisService);
    controlQueue = module.get(getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL));

    jest.clearAllMocks();
  });

  describe('handleStatusMessage', () => {
    it('should dispatch push notification job when device goes offline', async () => {
      const payload = Buffer.from(JSON.stringify({ online: false }));
      const topic = `company/model/${mockDeviceToken}/status`;

      // Mock unbound check
      db.device.findFirst = jest.fn().mockResolvedValue(null);
      // Mock device lookup for notification
      db.device.findUnique = jest.fn().mockResolvedValue({ id: 'dev-1', name: 'Smart Switch' });
      redis.get.mockResolvedValue('online'); // previous status

      // Setup spy for handleStateMessage since it is called at the end
      jest.spyOn(service, 'handleStateMessage').mockResolvedValue(undefined);

      await (service as any).handleStatusMessage(topic, payload);

      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'push_offline_alert',
        {
          type: 'deviceAlert',
          payload: {
            deviceId: 'dev-1',
            eventType: 'offline',
            title: 'Cảnh báo ngoại tuyến',
            body: 'Thiết bị "Smart Switch" vừa bị ngắt kết nối khỏi hệ thống.',
          },
        },
        expect.any(Object),
      );
    });

    it('should NOT dispatch push notification job when device comes online', async () => {
      const payload = Buffer.from(JSON.stringify({ online: true }));
      const topic = `company/model/${mockDeviceToken}/status`;

      db.device.findFirst = jest.fn().mockResolvedValue(null);
      db.device.findUnique = jest.fn().mockResolvedValue({ id: 'dev-1', name: 'Smart Switch' });
      redis.get.mockResolvedValue('offline'); // previous status

      jest.spyOn(service, 'handleStateMessage').mockResolvedValue(undefined);

      await (service as any).handleStatusMessage(topic, payload);

      expect(mockNotificationQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('handleStateMessage', () => {
    it('should map flat MQTT payload to entity state and attributes', async () => {
      // Setup payload: state (1), brightness (80), ct (4000)
      const payloadObj = { state: 1, brightness: 80, ct: 4000, unknown: 123 };
      const payload = Buffer.from(JSON.stringify(payloadObj));

      db.device.findUnique.mockResolvedValue(mockDevice as any);
      redis.get.mockResolvedValue(null); // No old state

      await service.handleStateMessage(mockTopic, payload);

      // Verify Redis interactions
      expect(redis.hmset).toHaveBeenCalledWith(
        `device:shadow:${mockDeviceToken}`,
        payloadObj,
      );

      const entityRedisKey = `device:dev-1:entity:light_1`;
      expect(redis.sadd).toHaveBeenCalledWith(
        `device:dev-1:_ekeys`,
        entityRedisKey,
      );

      // The saved state should combine state and attributes
      const expectedNewState = { state: 1, brightness: 80, color_temp: 4000 };
      expect(redis.set).toHaveBeenCalledWith(
        entityRedisKey,
        JSON.stringify(expectedNewState),
      );

      // Verify BullMQ job
      expect(controlQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        {
          deviceToken: mockDeviceToken,
          updates: [
            {
              entityCode: 'light_1',
              state: 1,
              attributes: [
                { key: 'brightness', value: 80 },
                { key: 'color_temp', value: 4000 },
              ],
            },
          ],
        },
        expect.any(Object),
      );
    });

    it('should update state partially combining with old state', async () => {
      const payloadObj = { brightness: 50 }; // Only brightness changes
      const payload = Buffer.from(JSON.stringify(payloadObj));

      db.device.findUnique.mockResolvedValue(mockDevice as any);

      // Mock old state
      redis.get.mockResolvedValue(
        JSON.stringify({ state: 1, brightness: 80, color_temp: 4000 }),
      );

      await service.handleStateMessage(mockTopic, payload);

      const entityRedisKey = `device:dev-1:entity:light_1`;
      const expectedNewState = { state: 1, brightness: 50, color_temp: 4000 }; // Brightness updated, others kept

      expect(redis.set).toHaveBeenCalledWith(
        entityRedisKey,
        JSON.stringify(expectedNewState),
      );
    });
  });
});
