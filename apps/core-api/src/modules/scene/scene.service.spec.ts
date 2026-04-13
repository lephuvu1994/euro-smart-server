import { Test, TestingModule } from '@nestjs/testing';
import { SceneService } from './scene.service';
import { DatabaseService } from '@app/database';
import { SceneTriggerIndexService, APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpException, HttpStatus } from '@nestjs/common';

jest.mock('@faker-js/faker', () => ({ faker: { string: { alphanumeric: () => 'abc', uuid: () => 'uuid' }, internet: { email: () => 'test@test.com' }, person: { firstName: () => 'First', lastName: () => 'Last' }, number: { int: () => 1 }, phone: { number: () => '123' }, date: { past: () => new Date(), future: () => new Date() }, datatype: { boolean: () => true } } }));
jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));

describe('SceneService', () => {
  let service: SceneService;
  let databaseService: any;
  let indexService: any;
  let mockQueue: any;

  beforeEach(async () => {
    const mockDb = {
      home: { findFirst: jest.fn() },
      scene: { create: jest.fn(), count: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };

    const mockIndexService = {
      rebuildIndex: jest.fn().mockResolvedValue(undefined),
    };

    mockQueue = {
      add: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SceneService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: SceneTriggerIndexService, useValue: mockIndexService },
        { provide: getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL), useValue: mockQueue },
      ],
    }).compile();

    service = module.get<SceneService>(SceneService);
    databaseService = module.get(DatabaseService);
    indexService = module.get(SceneTriggerIndexService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createScene', () => {
    it('should throw HttpException if user exceeds maxScenes quota', async () => {
      databaseService.home.findFirst.mockResolvedValueOnce({ id: 'home-1' } as any);
      
      // User has a limit of 100 maxScenes
      databaseService.user.findUnique.mockResolvedValueOnce({ maxScenes: 100 } as any);
      // Currently has 100 scenes in the targeted home
      databaseService.scene.count.mockResolvedValueOnce(100);

      await expect(
        service.createScene('home-1', 'user-1', { name: 'Test Scene', triggers: [], actions: [], homeId: 'home-1' } as any)
      ).rejects.toThrow(new HttpException('scene.error.sceneQuotaExceeded', HttpStatus.BAD_REQUEST));
    });

    it('should create scene, rebuild index and return scene id', async () => {
      databaseService.home.findFirst.mockResolvedValueOnce({ id: 'home-1' } as any);
      databaseService.user.findUnique.mockResolvedValueOnce({ maxScenes: 100 } as any);
      databaseService.scene.count.mockResolvedValueOnce(50);
      
      const createdScene = { id: 'scene-99' };
      databaseService.scene.create.mockResolvedValueOnce(createdScene as any);

      const result = await service.createScene('home-1', 'user-1', { 
        name: 'Test Scene', 
        triggers: [{ type: 'DEVICE_STATE', deviceStateConfig: {} }] as any, 
        actions: [],
        homeId: 'home-1' 
      });

      expect(databaseService.scene.create).toHaveBeenCalled();
      expect(indexService.rebuildIndex).toHaveBeenCalledWith('scene-99', [
        { type: 'DEVICE_STATE', deviceStateConfig: {} }
      ]);
      expect(result.id).toEqual('scene-99');
    });
  });

  describe('runScene', () => {
    it('should throw forbidden if user cannot access scene', async () => {
      databaseService.scene.findFirst.mockResolvedValueOnce(null);
      await expect(service.runScene('scene-1', 'user-1')).rejects.toThrow(
        new HttpException('scene.error.sceneNotFoundOrNoAccess', HttpStatus.FORBIDDEN)
      );
    });

    it('should queue a RUN_SCENE job with sceneId and optional delayMs', async () => {
      databaseService.scene.findFirst.mockResolvedValueOnce({ id: 'scene-1' } as any);
      databaseService.scene.findUnique.mockResolvedValueOnce({ id: 'scene-1', name: 'Test', active: true } as any);
      mockQueue.add.mockResolvedValueOnce({ id: 'job-1' });

      const result = await service.runScene('scene-1', 'user-1', 5);

      expect(mockQueue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.RUN_SCENE,
        { sceneId: 'scene-1' },
        { priority: 1, attempts: 1, removeOnComplete: true, delay: 5000 }
      );
      expect(result.jobId).toEqual('job-1');
      expect(result.message).toEqual('scene.success.runQueued');
    });
  });

  describe('reorderScenes', () => {
    it('should throw forbidden if user cannot access home', async () => {
      databaseService.home.findFirst.mockResolvedValueOnce(null);
      await expect(service.reorderScenes('home-1', 'user-1', [])).rejects.toThrow(
        new HttpException('scene.error.homeNotFoundOrNoAccess', HttpStatus.FORBIDDEN)
      );
    });

    it('should execute a transaction to update sortOrder for multiple scenes', async () => {
      databaseService.home.findFirst.mockResolvedValueOnce({ id: 'home-1' } as any);
      
      const sceneIds = ['scene-1', 'scene-2'];

      databaseService.scene.update.mockReturnValue('update_promise');
      databaseService.$transaction.mockResolvedValue([1, 1]);

      await service.reorderScenes('home-1', 'user-1', sceneIds);

      expect(databaseService.scene.update).toHaveBeenCalledTimes(2);
      expect(databaseService.$transaction).toHaveBeenCalled();
    });
  });
});
