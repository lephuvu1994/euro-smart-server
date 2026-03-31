import { Test, TestingModule } from '@nestjs/testing';

jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));

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
    findUnique: jest.fn(),
    count: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  scene: {
    findMany: jest.fn(),
  },
  systemConfig: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  entityStateHistory: {
    findMany: jest.fn(),
  },
  deviceConnectionLog: {
    findMany: jest.fn(),
  },
  deviceEntity: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  user: {
    findMany: jest.fn().mockResolvedValue([]),
  },
});

const makeRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
  smembers: jest.fn().mockResolvedValue([]),
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

  // ═══════════════════════════════════════════════════
  // getDeviceTimeline
  // ═══════════════════════════════════════════════════
  describe('getDeviceTimeline', () => {
    const now = new Date('2026-03-29T10:00:00Z');
    const oneHourAgo = new Date('2026-03-29T09:00:00Z');
    const twoHoursAgo = new Date('2026-03-29T08:00:00Z');

    it('should throw NotFoundException if device not found or not accessible', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(
        service.getDeviceTimeline('invalid-id', 'user-1', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return empty timeline when no events exist', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
    });

    it('should return state change events with correct mapping', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([
        {
          id: 'sh-1',
          value: null,
          valueText: 'OPEN',
          source: 'app',
          createdAt: now,
          entity: { code: 'curtain_1', name: 'Rèm chính', domain: 'curtain' },
        },
      ]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toEqual(expect.objectContaining({
        type: 'state',
        event: 'OPEN',
        entityCode: 'curtain_1',
        entityName: 'Rèm chính',
        source: 'app',
      }));
    });

    it('should return connection events with correct mapping', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([
        { id: 'cl-1', event: 'online', createdAt: now },
        { id: 'cl-2', event: 'offline', createdAt: oneHourAgo },
      ]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toEqual(expect.objectContaining({
        type: 'connection',
        event: 'online',
        entityCode: null,
        source: null,
      }));
      expect(result.data[1].event).toBe('offline');
    });

    it('should merge and sort state + connection events by createdAt DESC', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([
        {
          id: 'sh-1', value: null, valueText: 'OPEN', source: 'app',
          createdAt: now,
          entity: { code: 'curtain_1', name: 'Rèm', domain: 'curtain' },
        },
        {
          id: 'sh-2', value: null, valueText: 'CLOSE', source: 'mqtt',
          createdAt: twoHoursAgo,
          entity: { code: 'curtain_1', name: 'Rèm', domain: 'curtain' },
        },
      ]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([
        { id: 'cl-1', event: 'online', createdAt: oneHourAgo },
      ]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data).toHaveLength(3);
      expect(result.data[0].event).toBe('OPEN');      // 10:00
      expect(result.data[1].event).toBe('online');     // 09:00
      expect(result.data[2].event).toBe('CLOSE');      // 08:00
    });

    it('should paginate correctly', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      const events = Array.from({ length: 10 }, (_, i) => ({
        id: `sh-${i}`, value: null, valueText: `EVENT_${i}`, source: 'mqtt',
        createdAt: new Date(now.getTime() - i * 60000),
        entity: { code: 'main', name: 'Main', domain: 'switch' },
      }));
      (db.entityStateHistory as any).findMany.mockResolvedValue(events);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      const page1 = await service.getDeviceTimeline('dev-1', 'user-1', { page: 1, limit: 3 });
      expect(page1.data).toHaveLength(3);
      expect(page1.meta.page).toBe(1);
      expect(page1.meta.lastPage).toBe(4); // ceil(10/3)

      const page2 = await service.getDeviceTimeline('dev-1', 'user-1', { page: 2, limit: 3 });
      expect(page2.data).toHaveLength(3);
      expect(page2.data[0].event).toBe('EVENT_3');
    });

    it('should handle numeric state value (value instead of valueText)', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([
        {
          id: 'sh-1', value: 1, valueText: null, source: 'mqtt',
          createdAt: now,
          entity: { code: 'switch_1', name: 'Switch', domain: 'switch' },
        },
      ]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data[0].event).toBe('1');
    });

    it('should apply date filters (from/to)', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      await service.getDeviceTimeline('dev-1', 'user-1', {
        from: '2026-03-01',
        to: '2026-03-29',
      });

      // Verify that the where clause includes createdAt filter
      expect((db.entityStateHistory as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        }),
      );
    });

    it('should filter by entityCode when provided', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      await service.getDeviceTimeline('dev-1', 'user-1', {
        entityCode: 'curtain_1',
      });

      expect((db.entityStateHistory as any).findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            entity: expect.objectContaining({
              code: 'curtain_1',
            }),
          }),
        }),
      );
    });

    it('should handle unknown state (null value and null valueText)', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([
        {
          id: 'sh-1', value: null, valueText: null, source: 'mqtt',
          createdAt: now,
          entity: { code: 'main', name: 'Main', domain: 'switch' },
        },
      ]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data[0].event).toBe('unknown');
    });

    it('should default source to mqtt when source is null', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      (db.entityStateHistory as any).findMany.mockResolvedValue([
        {
          id: 'sh-1', value: null, valueText: 'OPEN', source: null,
          createdAt: now,
          entity: { code: 'main', name: 'Main', domain: 'curtain' },
        },
      ]);
      (db.deviceConnectionLog as any).findMany.mockResolvedValue([]);

      const result = await service.getDeviceTimeline('dev-1', 'user-1', {});

      expect(result.data[0].source).toBe('mqtt');
    });
  });
  // ═══════════════════════════════════════════════════
  // updateEntityName
  // ═══════════════════════════════════════════════════
  describe('updateEntityName', () => {
    it('should throw NotFoundException if device not found or user does not have access', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEntityName('invalid-dev', 'user-1', 'main', 'New Name'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if entityCode not found in device', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      db.deviceEntity.findFirst.mockResolvedValue(null);

      await expect(
        service.updateEntityName('dev-1', 'user-1', 'invalid-code', 'New Name'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update entity name and return the updated entity', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      db.deviceEntity.findFirst.mockResolvedValue({ id: 'ent-1', code: 'main', name: 'Old' });
      db.deviceEntity.update.mockResolvedValue({ id: 'ent-1', code: 'main', name: 'New Name' });

      const result = await service.updateEntityName('dev-1', 'user-1', 'main', 'New Name');

      expect(db.deviceEntity.update).toHaveBeenCalledWith({
        where: { id: 'ent-1' },
        data: { name: 'New Name' },
      });
      expect(result.name).toBe('New Name');
    });
  });

  // ═══════════════════════════════════════════════════
  // updateDeviceName
  // ═══════════════════════════════════════════════════
  describe('updateDeviceName', () => {
    it('should throw NotFoundException if device not found or user does not have access', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(
        service.updateDeviceName('invalid-dev', 'user-1', 'New Device Name'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should update device name and return the updated device', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1' });
      db.device.update.mockResolvedValue({ id: 'dev-1', name: 'New Device Name' });

      const result = await service.updateDeviceName('dev-1', 'user-1', 'New Device Name');

      expect(db.device.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: { name: 'New Device Name' },
      });
      expect(result.name).toBe('New Device Name');
    });
  });

  // ═══════════════════════════════════════════════════
  // updateNotifyConfig
  // ═══════════════════════════════════════════════════
  describe('updateNotifyConfig', () => {
    it('should throw NotFoundException if device not found', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(
        service.updateNotifyConfig('invalid-dev', 'user-1', { offline: true }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should merge new notify config with existing customConfig', async () => {
      db.device.findFirst.mockResolvedValue({
        id: 'dev-1',
        customConfig: { otherSetting: 'value1', notify: { offline: false } },
      });
      db.device.update.mockResolvedValue({
        id: 'dev-1',
        customConfig: { otherSetting: 'value1', notify: { offline: true } },
      });

      const result = await service.updateNotifyConfig('dev-1', 'user-1', { offline: true });

      expect(db.device.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: {
          customConfig: {
            otherSetting: 'value1',
            notify: { offline: true },
          },
        },
      });
      expect((result as any).customConfig.notify.offline).toBe(true);
    });

    it('should handle null or undefined customConfig by creating a new object', async () => {
      db.device.findFirst.mockResolvedValue({
        id: 'dev-2',
        customConfig: null,
      });
      db.device.update.mockResolvedValue({
        id: 'dev-2',
        customConfig: { notify: { offline: true } },
      });

      const result = await service.updateNotifyConfig('dev-2', 'user-1', { offline: true });

      expect(db.device.update).toHaveBeenCalledWith({
        where: { id: 'dev-2' },
        data: {
          customConfig: {
            notify: { offline: true },
          },
        },
      });
      expect((result as any).customConfig.notify.offline).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════
  // getNotifyConfig
  // ═══════════════════════════════════════════════════
  describe('getNotifyConfig', () => {
    it('should throw NotFoundException if device not found', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(
        service.getNotifyConfig('invalid-dev', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return notify config if it exists', async () => {
      db.device.findFirst.mockResolvedValue({
        customConfig: { notify: { online: true } },
      });

      const result = await service.getNotifyConfig('dev-1', 'user-1');

      expect(result).toEqual({ online: true });
    });

    it('should return empty object if notify config does not exist in customConfig', async () => {
      db.device.findFirst.mockResolvedValue({
        customConfig: { otherConfig: true },
      });

      const result = await service.getNotifyConfig('dev-1', 'user-1');

      expect(result).toEqual({});
    });

    it('should return empty object if customConfig is null', async () => {
      db.device.findFirst.mockResolvedValue({
        customConfig: null,
      });

      const result = await service.getNotifyConfig('dev-1', 'user-1');

      expect(result).toEqual({});
    });
  });

  // ═══════════════════════════════════════════════════
  // deleteDevice
  // ═══════════════════════════════════════════════════
  describe('deleteDevice', () => {
    it('should throw NotFoundException if device not found or not owned by user', async () => {
      db.device.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteDevice('invalid-id', 'user-1'),
      ).rejects.toThrow(NotFoundException);

      expect(db.device.delete).not.toHaveBeenCalled();
    });

    it('should soft-delete device and cleanup Redis keys', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1', token: 'token-xyz' });
      db.device.update.mockResolvedValue({ id: 'dev-1', unboundAt: new Date() });
      redis.smembers.mockResolvedValue(['device:dev-1:entity:sw1', 'device:dev-1:entity:sw2']);

      await service.deleteDevice('dev-1', 'user-1');

      // Verify soft-delete (NOT hard delete)
      expect(db.device.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: { unboundAt: expect.any(Date) },
      });
      expect(db.device.delete).not.toHaveBeenCalled();

      // Verify Redis cleanup
      expect(redis.del).toHaveBeenCalledWith('status:token-xyz');
      expect(redis.del).toHaveBeenCalledWith('device:shadow:token-xyz');
      expect(redis.smembers).toHaveBeenCalledWith('device:dev-1:_ekeys');
      expect(redis.del).toHaveBeenCalledWith([
        'device:dev-1:entity:sw1',
        'device:dev-1:entity:sw2',
        'device:dev-1:_ekeys',
      ]);
    });

    it('should not throw if Redis cleanup fails (fire-and-forget)', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1', token: 'token-xyz' });
      db.device.update.mockResolvedValue({ id: 'dev-1', unboundAt: new Date() });
      redis.del.mockRejectedValue(new Error('Redis connection lost'));
      redis.smembers.mockRejectedValue(new Error('Redis connection lost'));

      // Should NOT throw despite Redis failures
      await expect(service.deleteDevice('dev-1', 'user-1')).resolves.toBeUndefined();

      // DB update should still have been called
      expect(db.device.update).toHaveBeenCalledWith({
        where: { id: 'dev-1' },
        data: { unboundAt: expect.any(Date) },
      });
    });

    it('should handle empty entity tracking keys gracefully', async () => {
      db.device.findFirst.mockResolvedValue({ id: 'dev-1', token: 'token-xyz' });
      db.device.update.mockResolvedValue({ id: 'dev-1', unboundAt: new Date() });
      redis.smembers.mockResolvedValue([]); // No entity keys

      await service.deleteDevice('dev-1', 'user-1');

      // Should still try to delete the tracking key itself
      expect(redis.del).toHaveBeenCalledWith('device:dev-1:_ekeys');
    });
  });
});
