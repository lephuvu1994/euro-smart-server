jest.mock('@faker-js/faker', () => ({ faker: { string: { alphanumeric: () => 'abc', uuid: () => 'uuid' }, internet: { email: () => 'test@test.com' }, person: { firstName: () => 'First', lastName: () => 'Last' }, number: { int: () => 1 }, phone: { number: () => '123' }, date: { past: () => new Date(), future: () => new Date() }, datatype: { boolean: () => true } } }));
jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));
import { Test, TestingModule } from '@nestjs/testing';
import { IndexRebuildService } from './index-rebuild.service';
import { DatabaseService } from '@app/database';
import { SceneTriggerIndexService } from '@app/common';
import { Logger } from '@nestjs/common';

describe('IndexRebuildService', () => {
  let service: IndexRebuildService;
  let indexService: jest.Mocked<SceneTriggerIndexService>;
  let prismaService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const mockPrisma = {
      scene: {
        findMany: jest.fn(),
      },
    };

    const mockIndexService = {
      rebuildAllIndexes: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndexRebuildService,
        { provide: DatabaseService, useValue: mockPrisma },
        { provide: SceneTriggerIndexService, useValue: mockIndexService },
      ],
    }).compile();

    service = module.get<IndexRebuildService>(IndexRebuildService);
    indexService = module.get(SceneTriggerIndexService);
    prismaService = module.get(DatabaseService);

    // Suppress regular logs during testing to keep output clean, but let us verify error paths
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should call rebuildAllIndexes with a callback that queries active scenes', async () => {
    const mockScenes = [{ id: 'scene-1', triggers: [] }];
    (prismaService.scene.findMany as jest.Mock).mockResolvedValueOnce(mockScenes);

    // Mock rebuildAllIndexes to immediately invoke the passed callback
    indexService.rebuildAllIndexes.mockImplementationOnce(async (cb) => {
      const result = await cb();
      expect(result).toEqual(mockScenes);
    });

    await service.onModuleInit();

    expect(indexService.rebuildAllIndexes).toHaveBeenCalled();
    expect(prismaService.scene.findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: { id: true, triggers: true },
    });
  });

  it('should catch and log errors if rebuildAllIndexes fails', async () => {
    indexService.rebuildAllIndexes.mockRejectedValueOnce(new Error('Redis connection lost'));

    // Should not throw, but just catch the error internally
    await expect(service.onModuleInit()).resolves.toBeUndefined();
    
    // Verify logger error was called
    expect(Logger.prototype.error).toHaveBeenCalledWith('Failed to rebuild Redis trigger index: Redis connection lost');
  });
});
