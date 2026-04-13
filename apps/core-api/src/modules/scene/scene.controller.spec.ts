import { Test, TestingModule } from '@nestjs/testing';
import { SceneController } from './scene.controller';
import { SceneService } from './scene.service';
import { SceneTriggerLocationService } from './services/scene-trigger-location.service';

jest.mock('@faker-js/faker', () => ({ faker: { string: { alphanumeric: () => 'abc', uuid: () => 'uuid' }, internet: { email: () => 'test@test.com' }, person: { firstName: () => 'First', lastName: () => 'Last' }, number: { int: () => 1 }, phone: { number: () => '123' }, date: { past: () => new Date(), future: () => new Date() }, datatype: { boolean: () => true } } }));
jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));

describe('SceneController', () => {
  let controller: SceneController;
  let sceneService: jest.Mocked<SceneService>;
  let mockSceneTriggerLocationService: any;

  beforeEach(async () => {
    sceneService = {
      reorderScenes: jest.fn().mockResolvedValue(undefined),
      runScene: jest.fn().mockResolvedValue({ jobId: 'job-1', message: 'scene.success.runQueued' }),
    } as any;

    mockSceneTriggerLocationService = {
      onLocationReport: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SceneController],
      providers: [
        { provide: SceneService, useValue: sceneService },
        { provide: SceneTriggerLocationService, useValue: mockSceneTriggerLocationService },
      ],
    }).compile();

    controller = module.get<SceneController>(SceneController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('reorderScenes', () => {
    it('should call sceneService.reorderScenes with correct parameters', async () => {
      const mockUser = { userId: 'user-1' };
      const dto = { homeId: 'home-1', sceneIds: ['scene-1', 'scene-2'] };

      const result = await controller.reorderScenes(mockUser as any, dto);

      expect(sceneService.reorderScenes).toHaveBeenCalledWith('home-1', 'user-1', dto.sceneIds);
      expect(result).toBeUndefined();
    });
  });

  describe('runScene', () => {
    it('should call sceneService.runScene without delaySeconds', async () => {
      const mockUser = { userId: 'user-2' };
      const dto = {}; 

      const result = await controller.runScene(mockUser as any, 'scene-2', dto as any);

      expect(sceneService.runScene).toHaveBeenCalledWith('scene-2', 'user-2', undefined);
      expect(result).toEqual({ jobId: 'job-1', message: 'scene.success.runQueued' });
    });

    it('should call sceneService.runScene with provided delaySeconds', async () => {
      const mockUser = { userId: 'user-2' };
      const dto = { delaySeconds: 5 };

      const result = await controller.runScene(mockUser as any, 'scene-2', dto as any);

      expect(sceneService.runScene).toHaveBeenCalledWith('scene-2', 'user-2', 5);
      expect(result).toEqual({ jobId: 'job-1', message: 'scene.success.runQueued' });
    });
  });
});
