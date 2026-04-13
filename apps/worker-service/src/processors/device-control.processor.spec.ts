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
jest.mock('expo-server-sdk', () => ({
  __esModule: true,
  default: jest.fn(),
  Expo: jest.fn(),
}));
import { Test, TestingModule } from '@nestjs/testing';
import { DeviceControlProcessor } from './device-control.processor';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import {
  IntegrationManager,
  SceneTriggerType,
  DEVICE_JOBS,
  SceneTriggerIndexService,
  APP_BULLMQ_QUEUES,
} from '@app/common';
import { SocketEventPublisher } from '@app/common/events/socket-event.publisher';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';

describe('DeviceControlProcessor', () => {
  let processor: DeviceControlProcessor;
  let databaseService: any;
  let redisService: any;
  let sceneTriggerIndexService: any;
  let deviceQueue: any;

  beforeEach(async () => {
    const mockDatabase = {
      device: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      scene: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const mockRedis = {
      publish: jest.fn(),
      sadd: jest.fn(),
      expire: jest.fn(),
      get: jest.fn(),
      getClient: jest.fn().mockReturnValue({
        hgetall: jest.fn(),
      }),
    };

    const mockSceneTriggerIndexService = {
      getSceneIdsForDevice: jest.fn(),
    };

    const mockQueue = {
      add: jest.fn(),
    };

    const mockIntegrationManager = {
      getProvider: jest.fn(),
    };

    const mockSocketPublisher = {
      emitToDevice: jest.fn().mockResolvedValue(undefined),
      emitToRoom: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceControlProcessor,
        { provide: DatabaseService, useValue: mockDatabase },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: SceneTriggerIndexService,
          useValue: mockSceneTriggerIndexService,
        },
        { provide: IntegrationManager, useValue: mockIntegrationManager },
        { provide: SocketEventPublisher, useValue: mockSocketPublisher },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL),
          useValue: mockQueue,
        },
      ],
    }).compile();

    processor = module.get<DeviceControlProcessor>(DeviceControlProcessor);
    databaseService = module.get(DatabaseService);
    redisService = module.get(RedisService);
    sceneTriggerIndexService = module.get(SceneTriggerIndexService);
    deviceQueue = module.get(getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onFailed', () => {
    it('should log DLQ alert on job failure', () => {
      const mockJob = {
        name: 'test_job',
        id: '123',
        attemptsMade: 3,
        data: {},
      } as unknown as Job;
      const error = new Error('Test error');

      const loggerSpy = jest
        .spyOn((processor as any).logger, 'error')
        .mockImplementation(jest.fn());

      processor.onFailed(mockJob, error);

      expect(loggerSpy).toHaveBeenCalledWith(
        `[DLQ Alert] Job test_job failed after 3 attempts: Test error`,
        { jobId: '123', data: {} },
      );
    });
  });

  describe('handleRunScene', () => {
    it('should reject if chainDepth exceeds max depth', async () => {
      const job = {
        name: DEVICE_JOBS.RUN_SCENE,
        data: { sceneId: 'scene-1', chainDepth: 5 }, // MAX_SCENE_CHAIN_DEPTH = 5
      } as unknown as Job;

      const result = await processor.process(job) as any;
      expect(result.success).toBe(false);
      expect(result.error).toEqual('chain_depth_exceeded');
    });

    it('should reject if mutex lock cannot be acquired', async () => {
      redisService.setnxWithTtl = jest.fn().mockResolvedValue(false); // could not acquire
      const job = {
        name: DEVICE_JOBS.RUN_SCENE,
        data: { sceneId: 'scene-1', chainDepth: 2 },
      } as unknown as Job;

      const result = await processor.process(job) as any;
      expect(result.success).toBe(false);
      expect(result.error).toEqual('already_running');
    });
  });

  describe('handleCheckDeviceStateTriggers', () => {
    it('should return immediately if no scenes match the device index', async () => {
      sceneTriggerIndexService.getSceneIdsForDevice.mockResolvedValueOnce([]);

      const job = {
        name: DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        data: { deviceToken: 'device-1' },
      } as unknown as Job;

      const result = await processor.process(job);
      expect(result).toEqual({ ok: true });
      expect(databaseService.scene.findMany).not.toHaveBeenCalled();
    });

    it('should evaluate trigger logic and push to RUN_SCENE if matching', async () => {
      sceneTriggerIndexService.getSceneIdsForDevice.mockResolvedValueOnce([
        'scene-1',
      ]);

      const mockScene = {
        id: 'scene-1',
        name: 'Auto Lights',
        minIntervalSeconds: 60,
        lastFiredAt: null, // Never fired before
        triggers: [
          {
            type: SceneTriggerType.DEVICE_STATE,
            deviceStateConfig: {
              conditionLogic: 'and',
              conditions: [
                {
                  deviceToken: 'device-1',
                  entityCode: 'door_sensor',
                  value: true,
                  operator: 'eq',
                },
              ],
            },
          },
        ],
      };

      databaseService.scene.findMany.mockResolvedValueOnce([mockScene as any]);

      // Mock batch-resolve deviceToken → deviceId via findMany
      databaseService.device.findMany.mockResolvedValueOnce([
        { id: 'device-1', token: 'device-1' },
      ]);
      redisService.get.mockResolvedValueOnce(JSON.stringify({ state: true }));

      const job = {
        name: DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        data: { deviceToken: 'device-1' },
      } as unknown as Job;

      await processor.process(job);

      expect(deviceQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.RUN_SCENE,
        { sceneId: 'scene-1', chainDepth: 1 },
        expect.any(Object),
      );

      expect(databaseService.scene.update).toHaveBeenCalledWith({
        where: { id: 'scene-1' },
        data: { lastFiredAt: expect.any(Date) },
      });
    });

    it('should skip pushing RUN_SCENE if rate limited (minIntervalSeconds not met)', async () => {
      sceneTriggerIndexService.getSceneIdsForDevice.mockResolvedValueOnce([
        'scene-1',
      ]);

      const recentlyFired = new Date();
      recentlyFired.setSeconds(recentlyFired.getSeconds() - 10); // Fired 10 seconds ago

      const mockScene = {
        id: 'scene-1',
        name: 'Auto Lights',
        minIntervalSeconds: 60,
        lastFiredAt: recentlyFired,
        triggers: [
          {
            type: SceneTriggerType.DEVICE_STATE, // should match but be rate-limited
            deviceStateConfig: {
              conditionLogic: 'or',
              conditions: [
                {
                  deviceToken: 'device-1',
                  entityCode: 'door_sensor',
                  value: true,
                  operator: 'eq',
                },
              ],
            },
          },
        ],
      };

      databaseService.scene.findMany.mockResolvedValueOnce([mockScene as any]);

      databaseService.device.findMany.mockResolvedValueOnce([
        { id: 'device-1', token: 'device-1' },
      ]);
      redisService.get.mockResolvedValueOnce(JSON.stringify({ state: true }));

      const job = {
        name: DEVICE_JOBS.CHECK_DEVICE_STATE_TRIGGERS,
        data: { deviceToken: 'device-1' },
      } as unknown as Job;

      await processor.process(job);

      expect(deviceQueue.add).not.toHaveBeenCalled();
      expect(databaseService.scene.update).not.toHaveBeenCalled();
    });
  });
});
