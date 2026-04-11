import { Test, TestingModule } from '@nestjs/testing';
import { DeviceStateService } from './device-state.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common/enums/app.enum';
import { DEVICE_JOBS } from '@app/common/enums/device-job.enum';

jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));
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

const mockDevice = {
  id: 'dev-1',
  token: mockDeviceToken,
  ownerId: 'owner-1',
  name: 'Smart Switch',
  sharedUsers: [{ userId: 'shared-1' }],
  home: {
    members: [{ userId: 'member-1' }],
  },
  entities: [
    {
      id: 'entity-1',
      code: 'light_1',
      name: 'Light 1',
      commandKey: 'state',
      attributes: [
        { key: 'brightness', config: {} },
        { key: 'color_temp', config: { commandKey: 'ct' } },
      ],
    },
  ],
};

const mockDbService = {
  device: {
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  session: {
    findFirst: jest.fn(),
  },
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  hmset: jest.fn(),
  sadd: jest.fn(),
  smembers: jest.fn(),
  del: jest.fn(),
  setnxWithTtl: jest.fn(),
};

const mockStatusQueue = { add: jest.fn() };
const mockControlQueue = { add: jest.fn() };
const mockNotificationQueue = { add: jest.fn() };

describe('DeviceStateService', () => {
  let service: DeviceStateService;
  let db: typeof mockDbService;
  let redis: typeof mockRedisService;
  let statusQueue: typeof mockStatusQueue;
  let controlQueue: typeof mockControlQueue;
  let notificationQueue: typeof mockNotificationQueue;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceStateService,
        { provide: DatabaseService, useValue: mockDbService },
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

    service = module.get<DeviceStateService>(DeviceStateService);
    db = module.get(DatabaseService);
    redis = module.get(RedisService);
    statusQueue = module.get(getQueueToken(APP_BULLMQ_QUEUES.DEVICE_STATUS));
    controlQueue = module.get(getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL));
    notificationQueue = module.get(
      getQueueToken(APP_BULLMQ_QUEUES.PUSH_NOTIFICATION),
    );

    jest.clearAllMocks();
  });

  describe('processState', () => {
    it('should map MQTT payload to entity state and attributes', async () => {
      const payloadObj = { state: 1, brightness: 80, ct: 4000 };

      db.device.findUnique.mockResolvedValue(mockDevice);
      redis.get.mockImplementation(async (key: string) => {
        if (key.startsWith('device:meta:')) return null;
        return null;
      });
      redis.setnxWithTtl.mockResolvedValue(1);
      redis.smembers.mockResolvedValue([]);

      await service.processState(mockDeviceToken, payloadObj);

      expect(redis.hmset).toHaveBeenCalledWith(
        `device:shadow:${mockDeviceToken}`,
        expect.any(Object),
      );

      const entityRedisKey = `device:dev-1:entity:light_1`;
      expect(redis.set).toHaveBeenCalledWith(
        entityRedisKey,
        JSON.stringify({ state: 1, brightness: 80, color_temp: 4000 }),
      );

      expect(controlQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        expect.objectContaining({
          deviceToken: mockDeviceToken,
          chainDepth: 0,
          updates: expect.arrayContaining([
            expect.objectContaining({ entityCode: 'light_1', state: 1 }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should pass chainDepth from scene:chain Redis marker to trigger job', async () => {
      const payloadObj = { state: 1 };

      db.device.findUnique.mockResolvedValue(mockDevice);
      redis.get.mockImplementation(async (key: string) => {
        if (key.startsWith('device:meta:')) return null;
        // scene:chain marker set by handleRunScene with depth=3
        if (key === `scene:chain:${mockDeviceToken}`) return '3';
        return null; // oldState = {} → state transition from undefined→1
      });
      redis.setnxWithTtl.mockResolvedValue(1);
      redis.smembers.mockResolvedValue([]);

      await service.processState(mockDeviceToken, payloadObj);

      expect(controlQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        expect.objectContaining({
          deviceToken: mockDeviceToken,
          chainDepth: 3,
        }),
        expect.any(Object),
      );
    });

    it('should NOT queue CHECK_DEVICE_STATE_TRIGGERS when state has not changed (HA pattern)', async () => {
      const payloadObj = { state: 1 };

      db.device.findUnique.mockResolvedValue(mockDevice);
      redis.get.mockImplementation(async (key: string) => {
        if (key.startsWith('device:meta:')) return null;
        // oldState already has state=1 → same value → no transition
        if (key === `device:dev-1:entity:light_1`)
          return JSON.stringify({ state: 1 });
        return null;
      });

      await service.processState(mockDeviceToken, payloadObj);

      expect(controlQueue.add).not.toHaveBeenCalledWith(
        DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should deduplicate notifications using Redis lock', async () => {
      const payloadObj = { state: 1 };

      db.device.findUnique.mockResolvedValue(mockDevice);
      redis.get.mockImplementation(async (key: string) => {
        if (key.startsWith('device:meta:')) return null;
        return JSON.stringify({ state: 0 });
      });
      redis.setnxWithTtl.mockResolvedValue(0); // Lock already held

      await service.processState(mockDeviceToken, payloadObj);

      expect(statusQueue.add).not.toHaveBeenCalledWith(
        DEVICE_JOBS.RECORD_STATE_HISTORY,
        expect.any(Object),
        expect.any(Object),
      );
      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('should handle app-initiated state change with excludeUserIds', async () => {
      const payloadObj = { state: 1 };

      db.device.findUnique.mockResolvedValue(mockDevice);
      redis.get.mockImplementation(async (key: string) => {
        if (key.startsWith('device:meta:')) return null;
        return JSON.stringify({ state: 0 });
      });
      redis.setnxWithTtl.mockResolvedValue(1);
      redis.smembers.mockResolvedValue(['user-123']);
      db.user.findUnique.mockResolvedValue({
        firstName: 'Hai',
        lastName: 'Ham',
      });
      db.session.findFirst.mockResolvedValue({ id: 'sess-1' });

      await service.processState(mockDeviceToken, payloadObj);

      expect(statusQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.RECORD_STATE_HISTORY,
        expect.objectContaining({
          actionUserId: 'user-123',
          source: 'app',
        }),
        expect.any(Object),
      );

      expect(notificationQueue.add).toHaveBeenCalledWith(
        'push_state_change',
        expect.objectContaining({
          payload: expect.objectContaining({
            data: expect.objectContaining({
              excludeUserIds: ['user-123'],
              actionUserName: 'Ham Hai',
            }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should skip notifications if no target user has pushToken', async () => {
      const payloadObj = { state: 1 };

      db.device.findUnique.mockResolvedValue(mockDevice);
      redis.get.mockImplementation(async (key: string) => {
        if (key.startsWith('device:meta:')) return null;
        return JSON.stringify({ state: 0 });
      });
      redis.setnxWithTtl.mockResolvedValue(1);
      redis.smembers.mockResolvedValue([]);
      db.session.findFirst.mockResolvedValue(null); // No one has a token

      await service.processState(mockDeviceToken, payloadObj);

      expect(notificationQueue.add).not.toHaveBeenCalled();
    });

    it('should handle nested objects in shadow data', async () => {
      const payloadObj = { state: 1, info: { version: '1.0' } };
      db.device.findUnique.mockResolvedValue(mockDevice);

      await service.processState(mockDeviceToken, payloadObj);

      expect(redis.hmset).toHaveBeenCalledWith(
        `device:shadow:${mockDeviceToken}`,
        expect.objectContaining({ info: JSON.stringify({ version: '1.0' }) }),
      );
    });

    it('should log error if processing fails', async () => {
      db.device.findUnique.mockRejectedValue(new Error('DB Error'));
      const loggerSpy = jest.spyOn(service['logger'] as unknown as { error: jest.Mock }, 'error');

      await service.processState(mockDeviceToken, { state: 1 });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error processing state message'),
      );
    });
  });
});
