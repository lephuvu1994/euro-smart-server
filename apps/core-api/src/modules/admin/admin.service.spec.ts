import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { AdminService } from './admin.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import {
  DEFAULT_DEVICE_UI_CONFIGS,
  DEVICE_UI_CONFIG_KEY,
  DEVICE_UI_CONFIG_REDIS_KEY,
} from '../device/constants/device-ui-config.constant';

// ─── Helpers ─────────────────────────────────────────────────
const makeDb = () => ({
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
    updateMany: jest.fn(),
    upsert: jest.fn(),
  },
  systemConfig: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
  $transaction: jest.fn((fn) => fn(mockTx)),
});

const mockTx = {
  partner: {
    update: jest.fn(),
    findUnique: jest.fn(),
  },
  licenseQuota: {
    updateMany: jest.fn(),
    upsert: jest.fn(),
  },
  deviceModel: {
    findUnique: jest.fn(),
  },
};

const makeRedis = () => ({
  get: jest.fn(),
  set: jest.fn(),
});

// ─── Tests ───────────────────────────────────────────────────
describe('AdminService', () => {
  let service: AdminService;
  let db: ReturnType<typeof makeDb>;
  let redis: ReturnType<typeof makeRedis>;

  beforeEach(async () => {
    db = makeDb();
    redis = makeRedis();

    // Reset shared tx mocks
    jest.clearAllMocks();
    Object.values(mockTx).forEach((obj) =>
      Object.values(obj).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  // ═══════════════════════════════════════════════════
  // createPartner
  // ═══════════════════════════════════════════════════
  describe('createPartner', () => {
    it('should create a new partner', async () => {
      db.partner.findUnique.mockResolvedValue(null);
      db.partner.create.mockResolvedValue({ id: 'p1', code: 'ACME', name: 'ACME Corp' });

      const result = await service.createPartner({ code: 'ACME', name: 'ACME Corp' });

      expect(db.partner.create).toHaveBeenCalledWith({
        data: { code: 'ACME', name: 'ACME Corp', isActive: true },
      });
      expect(result.code).toBe('ACME');
    });

    it('should throw ConflictException if partner code already exists', async () => {
      db.partner.findUnique.mockResolvedValue({ id: 'p1' });

      await expect(service.createPartner({ code: 'ACME', name: 'ACME' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ═══════════════════════════════════════════════════
  // getPartnersForDropdown
  // ═══════════════════════════════════════════════════
  describe('getPartnersForDropdown', () => {
    it('should return list of partners for dropdown', async () => {
      const partners = [{ id: 'p1', code: 'ACME', name: 'Acme' }];
      db.partner.findMany.mockResolvedValue(partners);

      const result = await service.getPartnersForDropdown();

      expect(result).toEqual(partners);
    });
  });

  // ═══════════════════════════════════════════════════
  // getPartnersUsage
  // ═══════════════════════════════════════════════════
  describe('getPartnersUsage', () => {
    it('should map partners to usage response', async () => {
      db.partner.findMany.mockResolvedValue([
        {
          code: 'ACME',
          name: 'Acme Corp',
          quotas: [
            {
              activatedCount: 5,
              maxQuantity: 10,
              deviceModel: { code: 'M1', name: 'Model 1' },
            },
          ],
        },
      ]);

      const result = await service.getPartnersUsage();

      expect(result).toHaveLength(1);
      expect(result[0].companyCode).toBe('ACME');
      expect(result[0].quotas[0].used).toBe(5);
      expect(result[0].quotas[0].total).toBe(10);
    });
  });

  // ═══════════════════════════════════════════════════
  // updatePartner
  // ═══════════════════════════════════════════════════
  describe('updatePartner', () => {
    const existingPartner = { id: 'p1', code: 'ACME', name: 'Old Name' };

    it('should throw if partner not found', async () => {
      db.partner.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePartner('ACME', { name: 'New Name', quotas: [] }),
      ).rejects.toThrow(HttpException);
    });

    it('should update partner name', async () => {
      db.partner.findUnique.mockResolvedValue(existingPartner);
      mockTx.partner.update.mockResolvedValue({});
      mockTx.licenseQuota.updateMany.mockResolvedValue({});
      mockTx.partner.findUnique.mockResolvedValue({ ...existingPartner, quotas: [] });

      const result = await service.updatePartner('ACME', { name: 'New Name', quotas: [] });

      expect(mockTx.partner.update).toHaveBeenCalledWith({
        where: { code: 'ACME' },
        data: { name: 'New Name' },
      });
      expect(result).not.toBeNull();
    });

    it('should zero quotas when empty array passed', async () => {
      db.partner.findUnique.mockResolvedValue(existingPartner);
      mockTx.partner.update.mockResolvedValue({});
      mockTx.licenseQuota.updateMany.mockResolvedValue({});
      mockTx.partner.findUnique.mockResolvedValue({ ...existingPartner, quotas: [] });

      await service.updatePartner('ACME', { quotas: [] });

      expect(mockTx.licenseQuota.updateMany).toHaveBeenCalledWith({
        where: { partnerId: 'p1' },
        data: { maxQuantity: 0, isActive: false },
      });
    });

    it('should upsert quotas when quotas array has items', async () => {
      db.partner.findUnique.mockResolvedValue(existingPartner);
      mockTx.deviceModel.findUnique.mockResolvedValue({ id: 'm1' });
      mockTx.licenseQuota.upsert.mockResolvedValue({});
      mockTx.partner.findUnique.mockResolvedValue({ ...existingPartner, quotas: [] });

      await service.updatePartner('ACME', {
        quotas: [{ deviceModelCode: 'M1', quantity: 100 }],
      });

      expect(mockTx.licenseQuota.upsert).toHaveBeenCalledTimes(1);
    });

    it('should throw BAD_REQUEST if device model not found during quota update', async () => {
      db.partner.findUnique.mockResolvedValue(existingPartner);
      mockTx.deviceModel.findUnique.mockResolvedValue(null);

      await expect(
        service.updatePartner('ACME', {
          quotas: [{ deviceModelCode: 'UNKNOWN', quantity: 10 }],
        }),
      ).rejects.toThrow(HttpException);
    });
  });

  // ═══════════════════════════════════════════════════
  // Device Models
  // ═══════════════════════════════════════════════════
  describe('createDeviceModel', () => {
    it('should create a new device model', async () => {
      db.deviceModel.findUnique.mockResolvedValue(null);
      db.deviceModel.create.mockResolvedValue({ id: 'm1', code: 'M1', name: 'Model 1' });

      const result = await service.createDeviceModel({
        code: 'M1',
        name: 'Model 1',
        config: { entities: [] },
      });

      expect(db.deviceModel.create).toHaveBeenCalled();
      expect(result.code).toBe('M1');
    });

    it('should throw ConflictException if model code exists', async () => {
      db.deviceModel.findUnique.mockResolvedValue({ id: 'm1' });

      await expect(
        service.createDeviceModel({ code: 'M1', name: 'Model 1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getDeviceModelsForDropdown', () => {
    it('should return models list', async () => {
      db.deviceModel.findMany.mockResolvedValue([{ code: 'M1', name: 'Model 1' }]);

      const result = await service.getDeviceModelsForDropdown();

      expect(result).toHaveLength(1);
    });
  });

  describe('updateDeviceModel', () => {
    it('should throw NOT_FOUND if model does not exist', async () => {
      db.deviceModel.findUnique.mockResolvedValue(null);

      await expect(service.updateDeviceModel('UNKNOWN', { code: 'M1', name: 'X' })).rejects.toThrow(
        HttpException,
      );
    });

    it('should update a device model', async () => {
      db.deviceModel.findUnique.mockResolvedValue({ id: 'm1', code: 'M1' });
      db.deviceModel.update.mockResolvedValue({ id: 'm1', code: 'M1', name: 'Updated' });

      const result = await service.updateDeviceModel('M1', {
        code: 'M1',
        name: 'Updated',
        description: 'Desc',
        config: { entities: [] },
      });

      expect(db.deviceModel.update).toHaveBeenCalled();
      expect(result.name).toBe('Updated');
    });

    it('should update only name if only name changed', async () => {
      db.deviceModel.findUnique.mockResolvedValue({ id: 'm1', code: 'M1' });
      db.deviceModel.update.mockResolvedValue({ id: 'm1', code: 'M1', name: 'NewName' });

      await service.updateDeviceModel('M1', { code: 'M1', name: 'NewName' });

      const callArg = db.deviceModel.update.mock.calls[0][0];
      expect(callArg.data).toEqual({ name: 'NewName' });
    });
  });

  // ═══════════════════════════════════════════════════
  // getAllQuotas
  // ═══════════════════════════════════════════════════
  describe('getAllQuotas', () => {
    it('should return all quotas', async () => {
      db.licenseQuota.findMany.mockResolvedValue([{ id: 'q1' }]);

      const result = await service.getAllQuotas();

      expect(result).toHaveLength(1);
    });
  });

  // ═══════════════════════════════════════════════════
  // System Config
  // ═══════════════════════════════════════════════════
  describe('setMqttConfig', () => {
    it('should upsert all MQTT config entries', async () => {
      db.systemConfig.upsert.mockResolvedValue({});

      await service.setMqttConfig({ host: 'localhost', user: 'u', pass: 'p' });

      expect(db.systemConfig.upsert).toHaveBeenCalledTimes(3);
    });
  });

  describe('getSystemConfigs', () => {
    it('should return configs map from DB', async () => {
      db.systemConfig.findMany.mockResolvedValue([
        { key: 'MQTT_HOST', value: 'mqtt://localhost' },
        { key: 'MQTT_USER', value: 'user' },
        { key: 'MQTT_PASS', value: 'pass' },
        { key: 'OTP_EXPIRE', value: '5' },
      ]);

      const result = await service.getSystemConfigs();

      expect(result.mqttHost).toBe('mqtt://localhost');
      expect(result.otpExpire).toBe(5);
    });

    it('should return defaults for missing keys', async () => {
      db.systemConfig.findMany.mockResolvedValue([]);

      const result = await service.getSystemConfigs();

      expect(result.mqttHost).toBe('');
      expect(result.otpExpire).toBe(5);
    });
  });

  describe('updateSystemConfigs', () => {
    it('should upsert only provided fields', async () => {
      db.systemConfig.upsert.mockResolvedValue({});

      await service.updateSystemConfigs({ mqttHost: 'new-host', otpExpire: 10 });

      expect(db.systemConfig.upsert).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no fields provided', async () => {
      db.systemConfig.upsert.mockResolvedValue({});

      await service.updateSystemConfigs({});

      expect(db.systemConfig.upsert).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════
  // Device UI Config
  // ═══════════════════════════════════════════════════
  describe('getDeviceUiConfig', () => {
    it('should return parsed config from DB', async () => {
      const configs = [{ type: 'LIGHT' }];
      db.systemConfig.findUnique.mockResolvedValue({ value: JSON.stringify(configs) });

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(configs);
    });

    it('should return defaults if DB has no value', async () => {
      db.systemConfig.findUnique.mockResolvedValue(null);

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });

    it('should return defaults if DB value is invalid JSON', async () => {
      db.systemConfig.findUnique.mockResolvedValue({ value: 'not-json' });

      const result = await service.getDeviceUiConfig();

      expect(result).toEqual(DEFAULT_DEVICE_UI_CONFIGS);
    });
  });

  describe('updateDeviceUiConfig', () => {
    it('should write to DB and Redis', async () => {
      db.systemConfig.upsert.mockResolvedValue({});
      redis.set.mockResolvedValue('OK');

      const configs = [{ type: 'LIGHT', label: 'Light' }];
      await service.updateDeviceUiConfig({ configs: configs as any });

      expect(db.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: DEVICE_UI_CONFIG_KEY },
        update: { value: JSON.stringify(configs) },
        create: expect.objectContaining({ key: DEVICE_UI_CONFIG_KEY }),
      });
      expect(redis.set).toHaveBeenCalledWith(DEVICE_UI_CONFIG_REDIS_KEY, JSON.stringify(configs));
    });
  });
});
