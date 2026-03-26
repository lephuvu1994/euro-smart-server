import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, NotFoundException } from '@nestjs/common';
import { DeviceService } from './device.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import {
  DEFAULT_DEVICE_UI_CONFIGS,
  DEVICE_UI_CONFIG_KEY,
  DEVICE_UI_CONFIG_REDIS_KEY,
} from '../constants/device-ui-config.constant';

// ─── Mocks ───────────────────────────────────────────────────
const mockPipeline = {
  get: jest.fn().mockReturnThis(),
  hgetall: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

const makeDb = () => ({
  home: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
  },
  device: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    count: jest.fn(),
  },
  scene: {
    findMany: jest.fn(),
  },
  systemConfig: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
});

const makeRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  getClient: jest.fn().mockReturnValue({
    pipeline: jest.fn().mockReturnValue(mockPipeline),
  }),
});

const makeDevice = (overrides: object = {}) => ({
  id: 'dev-1',
  name: 'Test Device',
  identifier: 'MAC-ABCD',
  token: 'token-xyz',
  protocol: 'MQTT',
  sortOrder: 0,
  createdAt: new Date(),
  deviceModel: { code: 'MODEL1', name: 'Model 1' },
  room: { id: 'room-1', name: 'Living Room' },
  entities: [
    {
      id: 'e1',
      code: 'switch_1',
      name: 'Switch 1',
      commandKey: 'sw',
      domain: 'switch_',
      state: 0,
      attributes: [
        {
          id: 'a1',
          key: 'brightness',
          numValue: 80,
          strValue: null,
          config: { commandKey: 'brightness' },
        },
      ],
    },
  ],
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────
describe('DeviceService', () => {
  let service: DeviceService;
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(async () => {
    db = makeDb();
    redis = makeRedis();

    jest.clearAllMocks();
    mockPipeline.exec.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<DeviceService>(DeviceService);
  });

  // ═══════════════════════════════════════════════════
  // getUserDevices
  // ═══════════════════════════════════════════════════
  describe('getUserDevices', () => {
    it('should return empty data if no devices found', async () => {
      db.device.findMany.mockResolvedValue([]);
      db.device.count.mockResolvedValue(0);

      const result = await service.getUserDevices('user-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('should return enriched devices with redis status and shadow', async () => {
      const device = makeDevice();
      db.device.findMany.mockResolvedValue([device]);
      db.device.count.mockResolvedValue(1);

      // [status, shadow]
      mockPipeline.exec.mockResolvedValue([
        [null, 'online'],
        [null, { sw: '1', brightness: '80' }],
      ]);

      const result = await service.getUserDevices('user-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].status).toBe('online');
      expect(result.data[0].entities[0].currentState).toBe(1);
    });

    it('should handle devices with no shadow data (fallback offline)', async () => {
      const device = makeDevice();
      db.device.findMany.mockResolvedValue([device]);
      db.device.count.mockResolvedValue(1);

      mockPipeline.exec.mockResolvedValue([
        [null, null], // status = null → offline
        [null, {}],   // shadow = empty
      ]);

      const result = await service.getUserDevices('user-1', { page: 1, limit: 10 });

      expect(result.data[0].status).toBe('offline');
    });

    it('should filter by homeId if homeId provided and home found', async () => {
      db.home.findFirst.mockResolvedValue({ id: 'home-1' });
      db.device.findMany.mockResolvedValue([]);
      db.device.count.mockResolvedValue(0);

      const result = await service.getUserDevices('user-1', { homeId: 'home-1', page: 1, limit: 10 });

      expect(db.home.findFirst).toHaveBeenCalled();
      expect(result.data).toHaveLength(0);
    });

    it('should throw FORBIDDEN if homeId provided but home not accessible', async () => {
      db.home.findFirst.mockResolvedValue(null);

      await expect(
        service.getUserDevices('user-1', { homeId: 'home-1', page: 1, limit: 10 }),
      ).rejects.toThrow(HttpException);
    });

    it('should parse JSON values from shadow correctly', async () => {
      const device = makeDevice();
      db.device.findMany.mockResolvedValue([device]);
      db.device.count.mockResolvedValue(1);

      // shadow has JSON string for brightness
      mockPipeline.exec.mockResolvedValue([
        [null, 'online'],
        [null, { brightness: JSON.stringify({ level: 50 }) }],
      ]);

      const result = await service.getUserDevices('user-1', { page: 1, limit: 10 });
      const attr = result.data[0].entities[0].attributes[0];
      expect(attr.currentValue).toEqual({ level: 50 });
    });

    it('should handle malformed shadow JSON gracefully (fall back to raw string)', async () => {
      const device = makeDevice();
      db.device.findMany.mockResolvedValue([device]);
      db.device.count.mockResolvedValue(1);

      mockPipeline.exec.mockResolvedValue([
        [null, 'online'],
        [null, { brightness: 'not-json-object' }],
      ]);

      const result = await service.getUserDevices('user-1', { page: 1, limit: 10 });
      const attr = result.data[0].entities[0].attributes[0];
      expect(attr.currentValue).toBe('not-json-object');
    });

    it('should compute lastPage correctly', async () => {
      const devices = Array.from({ length: 5 }, (_, i) => makeDevice({ id: `dev-${i}`, token: `tok-${i}` }));
      db.device.findMany.mockResolvedValue(devices);
      db.device.count.mockResolvedValue(25);
      mockPipeline.exec.mockResolvedValue(
        devices.flatMap(() => [[null, 'offline'], [null, {}]]),
      );

      const result = await service.getUserDevices('user-1', { page: 1, limit: 5 });

      expect(result.meta.lastPage).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════
  // getDeviceDetail
  // ═══════════════════════════════════════════════════
  describe('getDeviceDetail', () => {
    it('should return device with enriched entities from shadow', async () => {
      const device = makeDevice();
      db.device.findFirst.mockResolvedValue(device);

      mockPipeline.exec.mockResolvedValue([
        [null, 'online'],
        [null, { sw: '1' }],
      ]);

      const result = await service.getDeviceDetail('dev-1', 'user-1');

      expect(result.status).toBe('online');
      expect(result.entities[0].currentState).toBe(1);
    });

    it('should throw NotFoundException if device not found', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(service.getDeviceDetail('invalid', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should fall back to offline if no redis status', async () => {
      const device = makeDevice();
      db.device.findFirst.mockResolvedValue(device);

      mockPipeline.exec.mockResolvedValue([
        [null, null],
        [null, {}],
      ]);

      const result = await service.getDeviceDetail('dev-1', 'user-1');

      expect(result.status).toBe('offline');
    });

    it('should handle entity with no commandKey (no shadow hydration)', async () => {
      const device = makeDevice({
        entities: [
          {
            id: 'e2',
            code: 'sensor',
            commandKey: null,
            state: 42,
            attributes: [],
          },
        ],
      });
      db.device.findFirst.mockResolvedValue(device);

      mockPipeline.exec.mockResolvedValue([
        [null, 'online'],
        [null, { sw: '1' }],
      ]);

      const result = await service.getDeviceDetail('dev-1', 'user-1');

      expect(result.entities[0].currentState).toBe(42);
    });
  });

  // ═══════════════════════════════════════════════════
  // getSiriSyncData
  // ═══════════════════════════════════════════════════
  describe('getSiriSyncData', () => {
    it('should return devices and scenes', async () => {
      const device = makeDevice();
      db.device.findMany.mockResolvedValue([device]);
      db.home.findMany.mockResolvedValue([{ id: 'home-1' }]);
      db.scene.findMany.mockResolvedValue([
        { id: 'scene-1', name: 'Good Morning', homeId: 'home-1' },
      ]);

      mockPipeline.exec.mockResolvedValue([[null, 'online']]);

      const result = await service.getSiriSyncData('user-1');

      expect(result.devices).toHaveLength(1);
      expect(result.scenes).toHaveLength(1);
      expect(result.devices[0].status).toBe('online');
    });

    it('should fallback device status to offline if redis returns null', async () => {
      db.device.findMany.mockResolvedValue([makeDevice()]);
      db.home.findMany.mockResolvedValue([]);
      db.scene.findMany.mockResolvedValue([]);

      mockPipeline.exec.mockResolvedValue([[null, null]]);

      const result = await service.getSiriSyncData('user-1');

      expect(result.devices[0].status).toBe('offline');
    });
  });

  // ═══════════════════════════════════════════════════
  // getDeviceUiConfigs
  // ═══════════════════════════════════════════════════
  describe('getDeviceUiConfigs', () => {
    it('should return cached config from Redis', async () => {
      const configs = [{ type: 'LIGHT' }];
      redis.get.mockResolvedValue(JSON.stringify(configs));

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(configs);
      expect(db.systemConfig.findUnique).not.toHaveBeenCalled();
    });

    it('should fallback to DB if Redis cache missing', async () => {
      redis.get.mockResolvedValue(null);
      const configs = [{ type: 'SWITCH' }];
      db.systemConfig.findUnique.mockResolvedValue({ value: JSON.stringify(configs) });
      redis.set.mockResolvedValue('OK');

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(configs);
      expect(redis.set).toHaveBeenCalledWith(DEVICE_UI_CONFIG_REDIS_KEY, JSON.stringify(configs));
    });

    it('should use defaults if Redis cache is invalid JSON', async () => {
      redis.get.mockResolvedValue('not-valid-json');
      db.systemConfig.findUnique.mockResolvedValue(null);
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });

    it('should seed defaults if DB has no config', async () => {
      redis.get.mockResolvedValue(null);
      db.systemConfig.findUnique.mockResolvedValue(null);
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const result = await service.getDeviceUiConfigs();

      expect(db.systemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { key: DEVICE_UI_CONFIG_KEY } }),
      );
      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });

    it('should seed defaults if DB config is invalid JSON', async () => {
      redis.get.mockResolvedValue(null);
      db.systemConfig.findUnique.mockResolvedValue({ value: 'bad-json' });
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const result = await service.getDeviceUiConfigs();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });
  });

  // ═══════════════════════════════════════════════════
  // refreshDeviceUiConfigCache
  // ═══════════════════════════════════════════════════
  describe('refreshDeviceUiConfigCache', () => {
    it('should update Redis from DB when config exists', async () => {
      const configJson = JSON.stringify([{ type: 'LIGHT' }]);
      db.systemConfig.findUnique.mockResolvedValue({ value: configJson });
      redis.set.mockResolvedValue('OK');

      const result = await service.refreshDeviceUiConfigCache();

      expect(redis.set).toHaveBeenCalledWith(DEVICE_UI_CONFIG_REDIS_KEY, configJson);
      expect(result.message).toContain('refreshed');
    });

    it('should seed DB + cache if no config exists', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const result = await service.refreshDeviceUiConfigCache();

      expect(db.systemConfig.upsert).toHaveBeenCalled();
      expect(redis.set).toHaveBeenCalled();
      expect(result.message).toBeTruthy();
    });
  });
});
