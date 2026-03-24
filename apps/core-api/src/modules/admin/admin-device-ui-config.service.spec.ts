import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import {
  DEFAULT_DEVICE_UI_CONFIGS,
  DEVICE_UI_CONFIG_KEY,
  DEVICE_UI_CONFIG_REDIS_KEY,
} from '../device/constants/device-ui-config.constant';

// ============================================================
// MOCK SERVICES
// ============================================================
const createMockDatabaseService = () => ({
  systemConfig: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
  },
  // Stubs for other AdminService dependencies
  partner: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  deviceModel: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  licenseQuota: {
    findMany: jest.fn(),
    upsert: jest.fn(),
    updateMany: jest.fn(),
  },
  $transaction: jest.fn(),
});

const createMockRedisService = () => ({
  get: jest.fn(),
  set: jest.fn(),
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

describe('AdminService — Device UI Config', () => {
  let service: AdminService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    redis = createMockRedisService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();
    service = module.get<AdminService>(AdminService);
  });

  // ============================================================
  // getDeviceUiConfig
  // ============================================================
  describe('getDeviceUiConfig', () => {
    it('should return config from DB when available', async () => {
      db.systemConfig.findUnique.mockResolvedValue({
        key: DEVICE_UI_CONFIG_KEY,
        value: MOCK_CONFIGS_JSON,
      });

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(MOCK_CONFIGS);
      expect(db.systemConfig.findUnique).toHaveBeenCalledWith({
        where: { key: DEVICE_UI_CONFIG_KEY },
      });
    });

    it('should return defaults when DB has no config', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });

    it('should return defaults when DB has invalid JSON', async () => {
      db.systemConfig.findUnique.mockResolvedValue({
        key: DEVICE_UI_CONFIG_KEY,
        value: '{{invalid}}',
      });

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });

    it('should return defaults when DB config value is empty string', async () => {
      db.systemConfig.findUnique.mockResolvedValue({
        key: DEVICE_UI_CONFIG_KEY,
        value: '',
      });

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });
  });

  // ============================================================
  // updateDeviceUiConfig
  // ============================================================
  describe('updateDeviceUiConfig', () => {
    it('should write config to DB and refresh Redis cache', async () => {
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const result = await service.updateDeviceUiConfig({
        configs: MOCK_CONFIGS,
      });

      expect(result).toEqual({
        message: 'Device UI config updated and cache refreshed',
      });

      // Verify DB upsert
      expect(db.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: DEVICE_UI_CONFIG_KEY },
        update: { value: MOCK_CONFIGS_JSON },
        create: {
          key: DEVICE_UI_CONFIG_KEY,
          value: MOCK_CONFIGS_JSON,
          description: 'Device UI config for app rendering (JSON array)',
        },
      });

      // Verify Redis cache refresh
      expect(redis.set).toHaveBeenCalledWith(
        DEVICE_UI_CONFIG_REDIS_KEY,
        MOCK_CONFIGS_JSON,
      );
    });

    it('should handle empty configs array', async () => {
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const result = await service.updateDeviceUiConfig({ configs: [] });

      expect(result).toEqual({
        message: 'Device UI config updated and cache refreshed',
      });
      expect(db.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { value: '[]' },
        }),
      );
      expect(redis.set).toHaveBeenCalledWith(DEVICE_UI_CONFIG_REDIS_KEY, '[]');
    });

    it('should write single config item correctly', async () => {
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const singleConfig = [
        {
          deviceType: 'light',
          hasToggle: true,
          accentColor: '#FFF',
          modalSnapPoints: ['40%'],
        },
      ];
      await service.updateDeviceUiConfig({ configs: singleConfig });

      expect(db.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { value: JSON.stringify(singleConfig) },
        }),
      );
    });
  });
});
