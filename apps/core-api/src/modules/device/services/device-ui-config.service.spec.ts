import { Test, TestingModule } from '@nestjs/testing';
import { DeviceService } from './device.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import {
  DEFAULT_DEVICE_UI_CONFIGS,
  DEVICE_UI_CONFIG_KEY,
  DEVICE_UI_CONFIG_REDIS_KEY,
} from '../constants/device-ui-config.constant';

// ============================================================
// MOCK SERVICES
// ============================================================
const createMockDatabaseService = () => ({
  systemConfig: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  // Stubs for other DeviceService dependencies (not under test)
  device: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
  home: { findFirst: jest.fn(), findMany: jest.fn() },
  scene: { findMany: jest.fn() },
});

const createMockRedisService = () => ({
  get: jest.fn(),
  set: jest.fn(),
  getClient: jest.fn().mockReturnValue({
    pipeline: jest.fn().mockReturnValue({
      get: jest.fn().mockReturnThis(),
      hgetall: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
  }),
});

const MOCK_CONFIGS = [
  {
    deviceType: 'light',
    hasToggle: true,
    accentColor: '#A3EC3E',
    modalSnapPoints: ['50%'],
  },
  {
    deviceType: 'camera',
    hasToggle: false,
    accentColor: '#60A5FA',
    modalSnapPoints: ['70%'],
  },
];
const MOCK_CONFIGS_JSON = JSON.stringify(MOCK_CONFIGS);

describe('DeviceService — Device UI Config', () => {
  let service: DeviceService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    redis = createMockRedisService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get<DeviceService>(DeviceService);
  });

  // ============================================================
  // getDeviceUiConfigs
  // ============================================================
  describe('getDeviceUiConfigs', () => {
    it('should return configs from Redis cache when available', async () => {
      redis.get.mockResolvedValue(MOCK_CONFIGS_JSON);

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(MOCK_CONFIGS);
      expect(redis.get).toHaveBeenCalledWith(DEVICE_UI_CONFIG_REDIS_KEY);
      expect(db.systemConfig.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to DB when Redis cache misses', async () => {
      redis.get.mockResolvedValue(null);
      db.systemConfig.findUnique.mockResolvedValue({
        key: DEVICE_UI_CONFIG_KEY,
        value: MOCK_CONFIGS_JSON,
      });

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(MOCK_CONFIGS);
      expect(db.systemConfig.findUnique).toHaveBeenCalledWith({
        where: { key: DEVICE_UI_CONFIG_KEY },
      });
      // Should write back to Redis
      expect(redis.set).toHaveBeenCalledWith(
        DEVICE_UI_CONFIG_REDIS_KEY,
        MOCK_CONFIGS_JSON,
      );
    });

    it('should seed defaults when DB has no config', async () => {
      redis.get.mockResolvedValue(null);
      db.systemConfig.findUnique.mockResolvedValue(null);
      db.systemConfig.upsert.mockResolvedValue({});

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
      expect(db.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: DEVICE_UI_CONFIG_KEY },
        update: { value: JSON.stringify(DEFAULT_DEVICE_UI_CONFIGS) },
        create: {
          key: DEVICE_UI_CONFIG_KEY,
          value: JSON.stringify(DEFAULT_DEVICE_UI_CONFIGS),
          description: 'Device UI config for app rendering (JSON array)',
        },
      });
      expect(redis.set).toHaveBeenCalledWith(
        DEVICE_UI_CONFIG_REDIS_KEY,
        JSON.stringify(DEFAULT_DEVICE_UI_CONFIGS),
      );
    });

    it('should seed defaults when Redis has invalid JSON', async () => {
      redis.get.mockResolvedValue('invalid-json{{{');
      db.systemConfig.findUnique.mockResolvedValue(null);
      db.systemConfig.upsert.mockResolvedValue({});

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });

    it('should seed defaults when DB has invalid JSON', async () => {
      redis.get.mockResolvedValue(null);
      db.systemConfig.findUnique.mockResolvedValue({
        key: DEVICE_UI_CONFIG_KEY,
        value: 'broken-json',
      });
      db.systemConfig.upsert.mockResolvedValue({});

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });
  });

  // ============================================================
  // refreshDeviceUiConfigCache
  // ============================================================
  describe('refreshDeviceUiConfigCache', () => {
    it('should refresh Redis from DB when config exists', async () => {
      db.systemConfig.findUnique.mockResolvedValue({
        key: DEVICE_UI_CONFIG_KEY,
        value: MOCK_CONFIGS_JSON,
      });

      const result = await service.refreshDeviceUiConfigCache();

      expect(result).toEqual({
        message: 'Device UI config cache refreshed successfully',
      });
      expect(redis.set).toHaveBeenCalledWith(
        DEVICE_UI_CONFIG_REDIS_KEY,
        MOCK_CONFIGS_JSON,
      );
    });

    it('should seed defaults when DB has no config', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);
      db.systemConfig.upsert.mockResolvedValue({});

      const result = await service.refreshDeviceUiConfigCache();

      expect(result).toEqual({
        message: 'Device UI config cache refreshed successfully',
      });
      expect(db.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: DEVICE_UI_CONFIG_KEY },
          create: expect.objectContaining({ key: DEVICE_UI_CONFIG_KEY }),
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(
        DEVICE_UI_CONFIG_REDIS_KEY,
        JSON.stringify(DEFAULT_DEVICE_UI_CONFIGS),
      );
    });
  });
});
