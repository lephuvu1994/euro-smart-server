import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DeviceProvisioningService } from './device-provisioning.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';

const mockUserId = 'user-1';
const mockDto = {
  deviceCode: 'model-1',
  partnerCode: 'partner-1',
  name: 'My Device',
  identifier: 'MAC-1234',
  protocol: 'WIFI',
  homeId: 'home-1',
  roomId: 'room-1',
};

const mockBlueprint = {
  entities: [
    {
      code: 'channel_1',
      name: 'Channel 1',
      domain: 'light',
      commandKey: 'state',
      commandSuffix: 'set',
      readOnly: false,
      attributes: [
        {
          key: 'brightness',
          name: 'Brightness',
          valueType: 'NUMBER',
          min: 0,
          max: 100,
          unit: '%',
        },
      ],
    },
  ],
};

const createMockDatabaseService = () => ({
  systemConfig: {
    findUnique: jest.fn().mockResolvedValue(null), // default: no DB config, use ENV fallback
  },
  deviceModel: { findUnique: jest.fn() },
  partner: { findUnique: jest.fn() },
  $transaction: jest.fn((callback) => callback(mockTx)),
});

const mockTx = {
  hardwareRegistry: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  device: {
    findUnique: jest.fn(),
    delete: jest.fn(),
    create: jest.fn(),
  },
  licenseQuota: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

const createMockRedisService = () => ({
  del: jest.fn().mockResolvedValue('OK'),
  smembers: jest.fn().mockResolvedValue(['some-key']),
});

describe('DeviceProvisioningService', () => {
  let service: DeviceProvisioningService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let redis: ReturnType<typeof createMockRedisService>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    redis = createMockRedisService();

    // Reset tx mocks
    mockTx.hardwareRegistry.findUnique.mockReset();
    mockTx.hardwareRegistry.create.mockReset();
    mockTx.hardwareRegistry.update.mockReset();
    mockTx.device.findUnique.mockReset();
    mockTx.device.delete.mockReset();
    mockTx.device.create.mockReset();
    mockTx.licenseQuota.findUnique.mockReset();
    mockTx.licenseQuota.update.mockReset();

    mockTx.licenseQuota.findUnique.mockResolvedValue({
      id: 'quota-id',
      licenseDays: 365,
      isActive: true,
      activatedCount: 0,
      maxQuantity: 100,
    });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceProvisioningService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<DeviceProvisioningService>(DeviceProvisioningService);
  });

  it('should parse blueprint v2 and create device with entities and attributes', async () => {
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: mockBlueprint,
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue(null);
    mockTx.hardwareRegistry.create.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-1',
      name: 'My Device',
      entities: [],
    });
    // using default quota from beforeEach

    const result = await service.registerAndClaim(mockUserId, mockDto as any);

    expect(result.device.id).toBe('dev-1');
    expect(result.license_days).toBe(365);
    // Should return unique per-device credentials
    expect(result.mqtt_username).toMatch(/^device_/);
    expect(result.mqtt_pass).toBe(result.mqtt_token_device);
    expect(result.mqtt_broker).toBeDefined();

    // Verify entity mapping
    expect(mockTx.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entities: {
            create: [
              {
                code: 'channel_1',
                name: 'Channel 1',
                domain: 'light',
                commandKey: 'state',
                commandSuffix: 'set',
                readOnly: false,
                sortOrder: 0,
                attributes: {
                  create: [
                    {
                      key: 'brightness',
                      name: 'Brightness',
                      valueType: 'NUMBER',
                      min: 0,
                      max: 100,
                      unit: '%',
                      readOnly: false,
                      enumValues: [],
                      config: {},
                    },
                  ],
                },
              },
            ],
          },
        }),
      }),
    );
  });

  it('should cleanup old redis _ekeys if old device existed', async () => {
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: mockBlueprint,
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.findUnique.mockResolvedValue({
      id: 'old-dev',
      token: 'old-token',
    });
    mockTx.hardwareRegistry.update.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-2',
      name: 'My Device',
      entities: [],
    });

    await service.registerAndClaim(mockUserId, mockDto as any);

    expect(mockTx.device.delete).toHaveBeenCalledWith({
      where: { id: 'old-dev' },
    });
    expect(redis.del).toHaveBeenCalledWith('status:old-token');
    expect(redis.smembers).toHaveBeenCalledWith('device:old-dev:_ekeys');
  });

  it('should throw BadRequestException if model or partner not found', async () => {
    db.deviceModel.findUnique.mockResolvedValue(null);
    db.partner.findUnique.mockResolvedValue(null);

    await expect(
      service.registerAndClaim(mockUserId, mockDto as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should pass homeId to device.create when provided', async () => {
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: { entities: [] },
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue(null);
    mockTx.hardwareRegistry.create.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-3',
      name: 'Device',
      entities: [],
    });
    // using default quota from beforeEach

    const dtoWithHome = { ...mockDto, homeId: 'home-abc' };
    await service.registerAndClaim(mockUserId, dtoWithHome as any);

    expect(mockTx.device.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          home: { connect: { id: 'home-abc' } },
        }),
      }),
    );
  });

  it('should not include home connect when homeId is not provided', async () => {
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: { entities: [] },
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue(null);
    mockTx.hardwareRegistry.create.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-4',
      name: 'Device',
      entities: [],
    });
    // using default quota from beforeEach

    // Explicitly omit homeId and roomId
    const { homeId: _h, roomId: _r, ...dtoNoHome } = mockDto;
    await service.registerAndClaim(mockUserId, dtoNoHome as any);

    const callArg = mockTx.device.create.mock.calls[0][0];
    expect(callArg.data.home).toBeUndefined();
  });

  it('should handle redis del failure gracefully (status/shadow cleanup)', async () => {
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: { entities: [] },
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.findUnique.mockResolvedValue({
      id: 'old-dev',
      token: 'old-token',
    });
    mockTx.hardwareRegistry.update.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-5',
      name: 'Device',
      entities: [],
    });
    // Redis del fails — should not throw
    redis.del.mockRejectedValue(new Error('Redis unavailable'));
    redis.smembers.mockResolvedValue([]);

    await expect(
      service.registerAndClaim(mockUserId, mockDto as any),
    ).resolves.not.toThrow();
  });

  it('should handle empty smembers list for _ekeys cleanup (no entity keys)', async () => {
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: { entities: [] },
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.findUnique.mockResolvedValue({
      id: 'old-dev',
      token: 'old-token',
    });
    mockTx.hardwareRegistry.update.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-6',
      name: 'Device',
      entities: [],
    });
    // No tracking keys
    redis.smembers.mockResolvedValue([]);

    await service.registerAndClaim(mockUserId, mockDto as any);
    // Should call smembers but del only for the tracking key itself (empty list case)
    expect(redis.smembers).toHaveBeenCalled();
  });

  it('should use MQTT_HOST from DB config when available', async () => {
    db.systemConfig.findUnique.mockResolvedValue({
      key: 'MQTT_HOST',
      value: 'mqtts://admin-db-host:8883',
    });
    db.deviceModel.findUnique.mockResolvedValue({
      id: 'model-id',
      code: 'model-1',
      config: { entities: [] },
    });
    db.partner.findUnique.mockResolvedValue({
      id: 'partner-id',
      code: 'partner-1',
    });

    mockTx.hardwareRegistry.findUnique.mockResolvedValue(null);
    mockTx.hardwareRegistry.create.mockResolvedValue({ id: 'hw-id' });
    mockTx.device.create.mockResolvedValue({
      id: 'dev-7',
      name: 'Device',
      entities: [],
    });
    // using default quota from beforeEach

    const result = await service.registerAndClaim(mockUserId, mockDto as any);
    expect(result.mqtt_broker).toBe('mqtts://admin-db-host:8883');
    expect(result.license_days).toBe(365); // uses default quota
  });
});
