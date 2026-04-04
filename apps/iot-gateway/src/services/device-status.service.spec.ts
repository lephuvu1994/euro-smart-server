import { Test, TestingModule } from '@nestjs/testing';
import { DeviceStatusService } from './device-status.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { getQueueToken } from '@nestjs/bullmq';
import {
  APP_BULLMQ_QUEUES,
  EDeviceConnectionStatus,
} from '@app/common/enums/app.enum';
import { DEVICE_JOBS } from '@app/common/enums/device-job.enum';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { DeviceStateService } from './device-state.service';

const mockDeviceToken = 'token-123';

const mockDbService = {
  device: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  },
  session: {
    findFirst: jest.fn(),
  },
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  hmset: jest.fn(),
  setnxWithTtl: jest.fn(),
};

const mockMqttService = {
  publish: jest.fn(),
};

const mockDeviceStateService = {
  processState: jest.fn(),
};

const mockStatusQueue = { add: jest.fn() };
const mockControlQueue = { add: jest.fn() };
const mockNotificationQueue = { add: jest.fn() };

describe('DeviceStatusService', () => {
  let service: DeviceStatusService;
  let db: typeof mockDbService;
  let redis: typeof mockRedisService;
  let mqtt: typeof mockMqttService;
  let stateService: typeof mockDeviceStateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceStatusService,
        { provide: DatabaseService, useValue: mockDbService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MqttService, useValue: mockMqttService },
        { provide: DeviceStateService, useValue: mockDeviceStateService },
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

    service = module.get<DeviceStatusService>(DeviceStatusService);
    db = module.get(DatabaseService);
    redis = module.get(RedisService);
    mqtt = module.get(MqttService);
    stateService = module.get(DeviceStateService);

    jest.clearAllMocks();
  });

  describe('processStatus', () => {
    it('should handle unbind if device is soft-deleted', async () => {
      const payload = { online: true };
      const mockUnboundDevice = {
        id: 'dev-1',
        token: mockDeviceToken,
      };

      db.device.findFirst.mockResolvedValue(mockUnboundDevice);

      await service.processStatus(mockDeviceToken, payload);

      expect(mqtt.publish).toHaveBeenCalledWith(
        'device/token-123/set',
        JSON.stringify({ action: 'unbind' }),
        expect.any(Object),
      );
      expect(mockControlQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.HARD_DELETE_DEVICE,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should update status and connection logs', async () => {
      const payload = { online: true };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue(null); // was offline
      redis.setnxWithTtl.mockResolvedValue(true); // acquire lock
      db.device.findUnique.mockResolvedValue({
        id: 'dev-1',
        ownerId: 'user-1',
      });
      db.session.findFirst.mockResolvedValue({ id: 'sess-1' });

      await service.processStatus(mockDeviceToken, payload);

      expect(redis.set).toHaveBeenCalledWith(
        `status:${mockDeviceToken}`,
        'online',
      );
      expect(mockStatusQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.RECORD_CONNECTION_LOG,
        expect.objectContaining({
          event: EDeviceConnectionStatus.ONLINE,
        }),
        expect.any(Object),
      );
      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'push_online_alert',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should iterate through shared users and home members for token check', async () => {
      const payload = { online: true };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue(null);
      redis.setnxWithTtl.mockResolvedValue(true);
      db.device.findUnique.mockResolvedValue({
        id: 'dev-1',
        ownerId: 'user-1',
        sharedUsers: [{ userId: 'shared-1' }],
        home: { members: [{ userId: 'member-1' }] },
      });
      db.session.findFirst.mockResolvedValue({ id: 'sess-1' });

      await service.processStatus(mockDeviceToken, payload);

      expect(db.session.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: expect.objectContaining({
              in: expect.arrayContaining(['user-1', 'shared-1', 'member-1']),
            }),
          }),
        }),
      );
    });

    it('should handle offline status', async () => {
      const payload = { online: false };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue('online'); // was online
      redis.setnxWithTtl.mockResolvedValue(true); // acquire lock
      db.device.findUnique.mockResolvedValue({
        id: 'dev-1',
        ownerId: 'user-1',
      });
      db.session.findFirst.mockResolvedValue({ id: 'sess-1' });

      await service.processStatus(mockDeviceToken, payload);

      expect(redis.del).toHaveBeenCalledWith(`status:${mockDeviceToken}`);
      expect(mockStatusQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.RECORD_CONNECTION_LOG,
        expect.objectContaining({
          event: EDeviceConnectionStatus.OFFLINE,
        }),
        expect.any(Object),
      );
      expect(mockNotificationQueue.add).toHaveBeenCalledWith(
        'push_offline_alert',
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should handle nested objects in shadow data', async () => {
      const payload = { online: true, info: { v: 1 } };
      db.device.findFirst.mockResolvedValue(null);

      await service.processStatus(mockDeviceToken, payload);

      expect(redis.hmset).toHaveBeenCalledWith(
        `device:shadow:${mockDeviceToken}`,
        expect.objectContaining({ info: JSON.stringify({ v: 1 }) }),
      );
    });

    it('should skip notification logic if device lookup fails', async () => {
      const payload = { online: true };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue(null); // was offline
      redis.setnxWithTtl.mockResolvedValue(true);
      db.device.findUnique.mockResolvedValue(null); // device not found

      await service.processStatus(mockDeviceToken, payload);

      expect(mockNotificationQueue.add).not.toHaveBeenCalled();
    });

    it('should skip notification log if still offline', async () => {
      const payload = { online: false };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue(null); // was already offline (no key)

      await service.processStatus(mockDeviceToken, payload);

      expect(mockStatusQueue.add).not.toHaveBeenCalledWith(
        DEVICE_JOBS.RECORD_CONNECTION_LOG,
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should skip notification if no user has push token', async () => {
      const payload = { online: true };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue(null);
      redis.setnxWithTtl.mockResolvedValue(true);
      db.device.findUnique.mockResolvedValue({
        id: 'dev-1',
        ownerId: 'user-1',
      });
      db.session.findFirst.mockResolvedValue(null);

      await service.processStatus(mockDeviceToken, payload);

      expect(mockNotificationQueue.add).not.toHaveBeenCalled();
    });

    it('should log error if processing fails', async () => {
      db.device.findFirst.mockRejectedValue(new Error('DB Error'));
      const loggerSpy = jest.spyOn(service['logger'] as any, 'error');

      await service.processStatus(mockDeviceToken, { online: true });

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to handle status message'),
      );
    });

    it('should forward to deviceStateService', async () => {
      const payload = { online: true, state: 'OPEN' };
      db.device.findFirst.mockResolvedValue(null);
      redis.get.mockResolvedValue('online'); // no transition

      await service.processStatus(mockDeviceToken, payload);

      expect(stateService.processState).toHaveBeenCalledWith(
        mockDeviceToken,
        payload,
      );
    });
  });
});
