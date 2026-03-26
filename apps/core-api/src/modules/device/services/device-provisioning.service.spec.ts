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
    mockTx.licenseQuota.findUnique.mockResolvedValue({ licenseDays: 365 });

    const result = await service.registerAndClaim(mockUserId, mockDto as any);

    expect(result.device.id).toBe('dev-1');
    expect(result.license_days).toBe(365);

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
});
