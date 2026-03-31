import { Test, TestingModule } from '@nestjs/testing';

jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));

import { DeviceStatusProcessor } from './device-status.processor';
import { DatabaseService } from '@app/database';
import { DEVICE_JOBS } from '@app/common';

jest.mock('@faker-js/faker', () => ({
  faker: {
    string: { uuid: () => 'test-uuid', numeric: () => '123', alphanumeric: () => 'abc' },
    number: { int: () => 123 },
    date: { past: () => new Date() },
    internet: { email: () => 'test@example.com', password: () => 'password123' },
    person: { firstName: () => 'John', lastName: () => 'Doe' },
    phone: { number: () => '0912345678' },
  },
}));

const makeDb = () => ({
  entityStateHistory: { create: jest.fn() },
  deviceConnectionLog: { create: jest.fn() },
  device: { findUnique: jest.fn() },
});

describe('DeviceStatusProcessor', () => {
  let processor: DeviceStatusProcessor;
  let db: ReturnType<typeof makeDb>;

  beforeEach(async () => {
    db = makeDb();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceStatusProcessor,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    processor = module.get<DeviceStatusProcessor>(DeviceStatusProcessor);
  });

  // ═══════════════════════════════════════════════════
  // RECORD_STATE_HISTORY
  // ═══════════════════════════════════════════════════
  describe('RECORD_STATE_HISTORY', () => {
    it('should insert state history record', async () => {
      db.entityStateHistory.create.mockResolvedValue({ id: 'sh-1' });

      await processor.process({
        name: DEVICE_JOBS.RECORD_STATE_HISTORY,
        data: {
          entityId: 'entity-1',
          value: null,
          valueText: 'OPEN',
          source: 'app',
        },
      } as any);

      expect(db.entityStateHistory.create).toHaveBeenCalledWith({
        data: {
          entityId: 'entity-1',
          value: null,
          valueText: 'OPEN',
          source: 'app',
          actionByUserId: null,
        },
      });
    });

    it('should handle numeric value correctly', async () => {
      db.entityStateHistory.create.mockResolvedValue({ id: 'sh-2' });

      await processor.process({
        name: DEVICE_JOBS.RECORD_STATE_HISTORY,
        data: {
          entityId: 'entity-2',
          value: 1,
          valueText: null,
          source: 'mqtt',
        },
      } as any);

      expect(db.entityStateHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          value: 1,
          valueText: null,
        }),
      });
    });

    it('should skip if entityId is missing', async () => {
      await processor.process({
        name: DEVICE_JOBS.RECORD_STATE_HISTORY,
        data: { entityId: null, value: 1, valueText: null, source: 'mqtt' },
      } as any);

      expect(db.entityStateHistory.create).not.toHaveBeenCalled();
    });

    it('should not throw if DB insert fails (graceful error handling)', async () => {
      db.entityStateHistory.create.mockRejectedValue(new Error('DB error'));

      await expect(
        processor.process({
          name: DEVICE_JOBS.RECORD_STATE_HISTORY,
          data: {
            entityId: 'entity-1',
            value: null,
            valueText: 'OPEN',
            source: 'app',
          },
        } as any),
      ).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════
  // RECORD_CONNECTION_LOG
  // ═══════════════════════════════════════════════════
  describe('RECORD_CONNECTION_LOG', () => {
    it('should insert connection log for known device', async () => {
      db.device.findUnique.mockResolvedValue({ id: 'dev-uuid' });
      db.deviceConnectionLog.create.mockResolvedValue({ id: 'cl-1' });

      await processor.process({
        name: DEVICE_JOBS.RECORD_CONNECTION_LOG,
        data: { token: 'device-token-123', event: 'online' },
      } as any);

      expect(db.device.findUnique).toHaveBeenCalledWith({
        where: { token: 'device-token-123' },
        select: { id: true },
      });
      expect(db.deviceConnectionLog.create).toHaveBeenCalledWith({
        data: { deviceId: 'dev-uuid', event: 'online' },
      });
    });

    it('should insert offline event correctly', async () => {
      db.device.findUnique.mockResolvedValue({ id: 'dev-uuid' });
      db.deviceConnectionLog.create.mockResolvedValue({ id: 'cl-2' });

      await processor.process({
        name: DEVICE_JOBS.RECORD_CONNECTION_LOG,
        data: { token: 'device-token-123', event: 'offline' },
      } as any);

      expect(db.deviceConnectionLog.create).toHaveBeenCalledWith({
        data: { deviceId: 'dev-uuid', event: 'offline' },
      });
    });

    it('should skip if device not found', async () => {
      db.device.findUnique.mockResolvedValue(null);

      await processor.process({
        name: DEVICE_JOBS.RECORD_CONNECTION_LOG,
        data: { token: 'unknown-token', event: 'online' },
      } as any);

      expect(db.deviceConnectionLog.create).not.toHaveBeenCalled();
    });

    it('should skip if token is missing', async () => {
      await processor.process({
        name: DEVICE_JOBS.RECORD_CONNECTION_LOG,
        data: { token: null, event: 'online' },
      } as any);

      expect(db.device.findUnique).not.toHaveBeenCalled();
      expect(db.deviceConnectionLog.create).not.toHaveBeenCalled();
    });

    it('should skip if event is missing', async () => {
      await processor.process({
        name: DEVICE_JOBS.RECORD_CONNECTION_LOG,
        data: { token: 'device-token', event: null },
      } as any);

      expect(db.device.findUnique).not.toHaveBeenCalled();
    });

    it('should not throw if DB insert fails (graceful error handling)', async () => {
      db.device.findUnique.mockResolvedValue({ id: 'dev-uuid' });
      db.deviceConnectionLog.create.mockRejectedValue(new Error('DB error'));

      await expect(
        processor.process({
          name: DEVICE_JOBS.RECORD_CONNECTION_LOG,
          data: { token: 'device-token', event: 'online' },
        } as any),
      ).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════
  // UPDATE_LAST_SEEN
  // ═══════════════════════════════════════════════════
  describe('UPDATE_LAST_SEEN', () => {
    it('should handle heartbeat without error', async () => {
      await expect(
        processor.process({
          name: DEVICE_JOBS.UPDATE_LAST_SEEN,
          data: { token: 'device-token' },
        } as any),
      ).resolves.not.toThrow();
    });

    it('should skip gracefully if token is empty', async () => {
      await expect(
        processor.process({
          name: DEVICE_JOBS.UPDATE_LAST_SEEN,
          data: { token: '' },
        } as any),
      ).resolves.not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════
  // Unknown job
  // ═══════════════════════════════════════════════════
  describe('unknown job', () => {
    it('should log warning for unknown job names', async () => {
      await expect(
        processor.process({
          name: 'totally_unknown_job',
          data: {},
        } as any),
      ).resolves.not.toThrow();
    });
  });
});
