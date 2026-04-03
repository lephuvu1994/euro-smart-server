jest.mock('@faker-js/faker', () => ({ faker: { string: { alphanumeric: () => 'abc', uuid: () => 'uuid' }, internet: { email: () => 'test@test.com' } } }));
import { Test, TestingModule } from '@nestjs/testing';
import { SceneTriggerIndexService } from './scene-trigger-index.service';
import { RedisService } from '@app/redis-cache';

describe('SceneTriggerIndexService', () => {
  let service: SceneTriggerIndexService;
  let redisService: jest.Mocked<RedisService>;
  let mockRedisClient: any;

  beforeEach(async () => {
    mockRedisClient = {
      srem: jest.fn(),
      scan: jest.fn(),
    };

    const redisProvider = {
      provide: RedisService,
      useValue: {
        sadd: jest.fn(),
        smembers: jest.fn(),
        del: jest.fn(),
        getClient: jest.fn().mockReturnValue(mockRedisClient),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SceneTriggerIndexService, redisProvider],
    }).compile();

    service = module.get<SceneTriggerIndexService>(SceneTriggerIndexService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getSceneIdsForDevice', () => {
    it('should return scene IDs from Redis SMEMBERS', async () => {
      redisService.smembers.mockResolvedValueOnce(['scene-1', 'scene-2']);
      const result = await service.getSceneIdsForDevice('device-token-123');
      expect(result).toEqual(['scene-1', 'scene-2']);
      expect(redisService.smembers).toHaveBeenCalledWith('scene_trigger:device:device-token-123');
    });

    it('should fallback to empty array on error', async () => {
      redisService.smembers.mockRejectedValueOnce(new Error('Redis Error'));
      const result = await service.getSceneIdsForDevice('device-token-123');
      expect(result).toEqual([]);
    });
  });

  describe('removeIndex', () => {
    it('should clear tracking key and specific device indices from tracked devices', async () => {
      redisService.smembers.mockResolvedValueOnce(['device-1', 'device-2']);
      mockRedisClient.srem.mockResolvedValue(1);
      redisService.del.mockResolvedValueOnce(1);

      await service.removeIndex('scene-xyz');

      expect(redisService.smembers).toHaveBeenCalledWith('scene_trigger:tracked:scene-xyz');
      expect(mockRedisClient.srem).toHaveBeenCalledWith('scene_trigger:device:device-1', 'scene-xyz');
      expect(mockRedisClient.srem).toHaveBeenCalledWith('scene_trigger:device:device-2', 'scene-xyz');
      expect(redisService.del).toHaveBeenCalledWith('scene_trigger:tracked:scene-xyz');
    });

    it('should handle gracefully if smembers fails', async () => {
      redisService.smembers.mockRejectedValueOnce(new Error('Fail'));
      redisService.del.mockResolvedValueOnce(1);

      await service.removeIndex('scene-xyz');

      expect(redisService.del).toHaveBeenCalled();
      expect(mockRedisClient.srem).not.toHaveBeenCalled();
    });
  });

  describe('rebuildIndex', () => {
    it('should remove existing indices and set new ones for DEVICE_STATE triggers', async () => {
      // Mock removeIndex internal call
      jest.spyOn(service, 'removeIndex').mockResolvedValue(undefined);

      const triggers = [
        { type: 'LOCATION' }, // Should be ignored
        {
          type: 'DEVICE_STATE',
          deviceStateConfig: {
            conditions: [{ deviceToken: 'token-A' }, { deviceToken: 'token-B' }],
          },
        },
      ];

      await service.rebuildIndex('scene-1', triggers);

      expect(service.removeIndex).toHaveBeenCalledWith('scene-1');
      expect(redisService.sadd).toHaveBeenCalledWith('scene_trigger:device:token-A', 'scene-1');
      expect(redisService.sadd).toHaveBeenCalledWith('scene_trigger:device:token-B', 'scene-1');
    });
  });

  describe('rebuildAllIndexes', () => {
    it('should scan, delete existing trigger keys and rebuild from DB', async () => {
      // First scan call returns cursor '10' and 2 keys
      mockRedisClient.scan
        .mockResolvedValueOnce(['10', ['scene_trigger:device:token-1', 'scene_trigger:device:token-2']])
        .mockResolvedValueOnce(['0', []]); // Second scan returns cursor '0' to stop iteration

      const mockFindScenes = jest.fn().mockResolvedValue([
        {
          id: 'scene-999',
          triggers: [
            {
              type: 'DEVICE_STATE',
              deviceStateConfig: { conditions: [{ deviceToken: 'token-3' }] },
            },
          ],
        },
      ]);

      jest.spyOn(service, 'rebuildIndex').mockResolvedValue(undefined);

      await service.rebuildAllIndexes(mockFindScenes);

      expect(mockRedisClient.scan).toHaveBeenCalledTimes(2);
      expect(redisService.del).toHaveBeenCalledWith(['scene_trigger:device:token-1', 'scene_trigger:device:token-2']);
      expect(service.rebuildIndex).toHaveBeenCalledWith('scene-999', [
        {
          type: 'DEVICE_STATE',
          deviceStateConfig: { conditions: [{ deviceToken: 'token-3' }] },
        },
      ]);
    });
  });
});
