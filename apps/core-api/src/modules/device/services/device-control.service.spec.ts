import { Test, TestingModule } from '@nestjs/testing';
import { DeviceControlService } from './device-control.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import {
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  HttpException,
} from '@nestjs/common';

jest.mock('@faker-js/faker', () => ({
  faker: {
    string: { alphanumeric: () => 'abc', uuid: () => 'uuid' },
    internet: { email: () => 'test@test.com' },
    person: { firstName: () => 'First', lastName: () => 'Last' },
    number: { int: () => 1 },
    phone: { number: () => '123' },
    date: { past: () => new Date(), future: () => new Date() },
    datatype: { boolean: () => true },
  },
}));

const mockUserId = 'user-1';
const mockDeviceToken = 'token-123';

const mockDevice = {
  id: 'dev-1',
  token: mockDeviceToken,
  ownerId: mockUserId,
  partner: { code: 'partner-1' },
  entities: [
    { code: 'switch_1', domain: 'switch_', readOnly: false },
    { code: 'light_1', domain: 'light', readOnly: false },
    { code: 'sensor_1', domain: 'sensor', readOnly: true },
    { code: 'curtain_1', domain: 'curtain', readOnly: false },
  ],
};

const createMockDatabaseService = () => ({
  device: {
    findFirst: jest.fn(),
  },
});

const createMockRedisService = () => ({
  hget: jest.fn(),
  hgetall: jest.fn(),
});

const createMockQueue = () => ({
  add: jest.fn(),
});

describe('DeviceControlService', () => {
  let service: DeviceControlService;
  let db: ReturnType<typeof createMockDatabaseService>;
  let redis: ReturnType<typeof createMockRedisService>;
  let queue: ReturnType<typeof createMockQueue>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    redis = createMockRedisService();
    queue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceControlService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redis },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL),
          useValue: queue,
        },
      ],
    }).compile();

    service = module.get<DeviceControlService>(DeviceControlService);
  });

  describe('sendControlCommand', () => {
    it('should throw UnauthorizedException if device not found', async () => {
      db.device.findFirst.mockResolvedValue(null);
      await expect(
        service.sendControlCommand(mockDeviceToken, mockUserId, 'switch_1', 1),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException if entity not found', async () => {
      db.device.findFirst.mockResolvedValue(mockDevice);
      await expect(
        service.sendControlCommand(
          mockDeviceToken,
          mockUserId,
          'non_existent',
          1,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if entity is readOnly', async () => {
      db.device.findFirst.mockResolvedValue(mockDevice);
      await expect(
        service.sendControlCommand(mockDeviceToken, mockUserId, 'sensor_1', 1),
      ).rejects.toThrow(BadRequestException);
    });

    describe('domain validation', () => {
      beforeEach(() => {
        db.device.findFirst.mockResolvedValue(mockDevice);
        redis.hget.mockResolvedValue('1'); // isOnline
      });

      it('should validate switch_ domain', async () => {
        await expect(
          service.sendControlCommand(
            mockDeviceToken,
            mockUserId,
            'switch_1',
            2,
          ),
        ).rejects.toThrow(BadRequestException);

        await service.sendControlCommand(
          mockDeviceToken,
          mockUserId,
          'switch_1',
          1,
        );
        expect(queue.add).toHaveBeenCalled();
      });

      it('should validate light domain', async () => {
        await expect(
          service.sendControlCommand(
            mockDeviceToken,
            mockUserId,
            'light_1',
            105,
          ),
        ).rejects.toThrow(BadRequestException);

        await service.sendControlCommand(
          mockDeviceToken,
          mockUserId,
          'light_1',
          80,
        );
        expect(queue.add).toHaveBeenCalled();
      });

      it('should validate curtain domain', async () => {
        await expect(
          service.sendControlCommand(
            mockDeviceToken,
            mockUserId,
            'curtain_1',
            'INVALID',
          ),
        ).rejects.toThrow(BadRequestException);

        await service.sendControlCommand(
          mockDeviceToken,
          mockUserId,
          'curtain_1',
          'OPEN',
        );
        expect(queue.add).toHaveBeenCalledWith(
          DEVICE_JOBS.CONTROL_CMD,
          { token: mockDeviceToken, entityCode: 'curtain_1', value: 'OPEN' },
          expect.any(Object),
        );
      });
    });

    it('should throw HttpException if device is offline', async () => {
      db.device.findFirst.mockResolvedValue(mockDevice);
      redis.hget.mockResolvedValue(null);
      await expect(
        service.sendControlCommand(mockDeviceToken, mockUserId, 'switch_1', 1),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('sendDeviceValueCommand', () => {
    it('should validate multiple entities and add bulk job to queue', async () => {
      db.device.findFirst.mockResolvedValue(mockDevice);
      redis.hget.mockResolvedValue('1'); // isOnline

      const values = [
        { entityCode: 'switch_1', value: 1 },
        { entityCode: 'light_1', value: 50 },
      ];

      await service.sendDeviceValueCommand(mockDeviceToken, mockUserId, values);

      expect(queue.add).toHaveBeenCalledWith(
        DEVICE_JOBS.CONTROL_DEVICE_VALUE_CMD,
        {
          token: mockDeviceToken,
          entityPayloads: values,
        },
        expect.any(Object),
      );
    });
  });
});
