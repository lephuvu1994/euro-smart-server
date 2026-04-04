import { Test, TestingModule } from '@nestjs/testing';
import { AutomationService } from './automation.service';
import { DatabaseService } from '@app/database';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { AutomationTargetType } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';

jest.mock('expo-server-sdk', () => ({ __esModule: true, default: jest.fn(), Expo: jest.fn() }));
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

jest.mock('cron-parser', () => ({
  parseExpression: jest.fn().mockReturnValue({
    next: () => ({ toDate: () => new Date('2026-01-01T08:00:00Z') })
  })
}));

const createMockDatabaseService = () => ({
  user: {
    findUnique: jest.fn(),
  },
  deviceTimer: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  deviceSchedule: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  scheduleExecutionLog: {
    count: jest.fn(),
  }
});

const createMockQueue = () => ({
  add: jest.fn(),
  getJob: jest.fn(),
  getJobCounts: jest.fn(),
});

describe('AutomationService', () => {
  let service: AutomationService;
  let db: any;
  let queue: any;

  beforeEach(async () => {
    db = createMockDatabaseService();
    queue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationService,
        { provide: DatabaseService, useValue: db },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.AUTOMATION),
          useValue: queue,
        },
      ],
    }).compile();

    service = module.get<AutomationService>(AutomationService);

    db.user.findUnique.mockResolvedValue({ maxTimers: 50, maxSchedules: 50 });
    db.deviceTimer.count.mockResolvedValue(0);
    db.deviceSchedule.count.mockResolvedValue(0);
  });

  describe('createTimer', () => {
    it('should throw BadRequestException if quota exceeded', async () => {
      db.deviceTimer.count.mockResolvedValue(50);

      await expect(
        service.createTimer('user-1', {
          name: 'Timer',
          targetType: AutomationTargetType.DEVICE_ENTITY,
          targetId: 'dev-1',
          service: 't',
          executeAt: new Date(Date.now() + 10000).toISOString(),
        } as any)
      ).rejects.toThrow(new BadRequestException('automation.error.timerQuotaExceeded'));
    });

    it('should create a timer and add a job to the queue, storing jobId', async () => {
      const mockTimer = { id: 'timer-1' };
      db.deviceTimer.create.mockResolvedValue(mockTimer);
      queue.add.mockResolvedValue({ id: 'bullmq-job-1' });

      const dto = {
        name: 'Test Timer',
        targetType: AutomationTargetType.DEVICE_ENTITY,
        targetId: 'device-1',
        service: 'light.turn_on',
        actions: [{ state: 1 }],
        executeAt: new Date(Date.now() + 10000).toISOString(),
      };

      const result = await service.createTimer('user-1', dto as any);

      expect(db.deviceTimer.create).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
      expect(db.deviceTimer.update).toHaveBeenCalledWith({
        where: { id: 'timer-1' },
        data: { jobId: 'bullmq-job-1' },
      });
      expect(result).toEqual(mockTimer);
    });
  });

  describe('createSchedule', () => {
    it('should throw BadRequestException if quota exceeded', async () => {
      db.deviceSchedule.count.mockResolvedValue(50);

      await expect(
        service.createSchedule('user-1', {} as any)
      ).rejects.toThrow(new BadRequestException('automation.error.scheduleQuotaExceeded'));
    });

    it('should create a cron-based schedule', async () => {
      const mockSchedule = { id: 'schedule-1' };
      db.deviceSchedule.create.mockResolvedValue(mockSchedule);

      const dto = {
        name: 'Morning Lights',
        targetType: AutomationTargetType.DEVICE_ENTITY,
        targetId: 'device-1',
        service: 'light.turn_on',
        cronExpression: '0 8 * * *',
      };

      const result = await service.createSchedule('user-1', dto as any);

      expect(db.deviceSchedule.create).toHaveBeenCalled();
      expect(result).toEqual(mockSchedule);
    });
  });

  describe('deleteTimer', () => {
    it('should remove BullMQ job if jobId exists', async () => {
      const mockTimer = { id: 't1', jobId: 'job-1' };
      db.deviceTimer.findFirst.mockResolvedValue(mockTimer);
      
      const mockJob = { remove: jest.fn().mockResolvedValue(true) };
      queue.getJob.mockResolvedValue(mockJob);

      await service.deleteTimer('user-1', 't1');

      expect(queue.getJob).toHaveBeenCalledWith('job-1');
      expect(mockJob.remove).toHaveBeenCalled();
      expect(db.deviceTimer.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('should throw NotFoundException if timer does not exist', async () => {
      db.deviceTimer.findFirst.mockResolvedValue(null);
      await expect(service.deleteTimer('u1', 't1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('toggleSchedule', () => {
    it('should toggle schedule and calculate nextExecuteAt', async () => {
       db.deviceSchedule.findFirst.mockResolvedValue({ id: 's1', cronExpression: '0 8 * * *' });
       db.deviceSchedule.update.mockResolvedValue({ id: 's1', isActive: true });
       const result = await service.toggleSchedule('u1', 's1', true);
       expect(db.deviceSchedule.update).toHaveBeenCalled();
       expect(result.isActive).toBe(true);
    });
  });

  describe('Execution Stats and Metrics', () => {
    it('should return getExecutionStats', async () => {
      db.scheduleExecutionLog.count
        .mockResolvedValueOnce(10) // success
        .mockResolvedValueOnce(2); // fail

      const result = await service.getExecutionStats('user-1');
      expect(result).toEqual({ successCount: 10, failCount: 2, totalCount: 12 });
    });

    it('should getQueueMetrics', async () => {
      queue.getJobCounts.mockResolvedValue({ waiting: 5, active: 1 });
      const result = await service.getQueueMetrics();
      expect(result).toEqual({ waiting: 5, active: 1 });
    });
  });
});
