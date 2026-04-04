jest.mock('@faker-js/faker', () => ({ faker: { string: { alphanumeric: () => 'abc', uuid: () => 'uuid' }, internet: { email: () => 'test@test.com' }, person: { firstName: () => 'First', lastName: () => 'Last' }, number: { int: () => 1 }, phone: { number: () => '123' }, date: { past: () => new Date(), future: () => new Date() }, datatype: { boolean: () => true } } }));
jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));
import { Test, TestingModule } from '@nestjs/testing';
import { SceneService } from './scene.service';
import { DatabaseService } from '@app/database';
import { SceneTriggerIndexService, APP_BULLMQ_QUEUES } from '@app/common';
import { getQueueToken } from '@nestjs/bullmq';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('SceneService', () => {
  let service: SceneService;
  let databaseService: any;
  let indexService: any;

  beforeEach(async () => {
    const mockDb = {
      home: { findFirst: jest.fn() },
      scene: { create: jest.fn(), count: jest.fn() },
      user: { findUnique: jest.fn() },
    };

    const mockIndexService = {
      rebuildIndex: jest.fn().mockResolvedValue(undefined),
    };

    const mockQueue = {
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

    it('should create scene successfully and call rebuildIndex if under quota', async () => {
      databaseService.home.findFirst.mockResolvedValueOnce({ id: 'home-1' } as any);
      
      databaseService.user.findUnique.mockResolvedValueOnce({ maxScenes: 100 } as any);
      // Only 5 scenes, well under limit
      databaseService.scene.count.mockResolvedValueOnce(5);

      const createdScene = {
        id: 'scene-99',
        name: 'Test Scene',
        active: true,
        triggers: [{ type: 'DEVICE_STATE', deviceStateConfig: {} }],
        actions: [],
        homeId: 'home-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
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
});
