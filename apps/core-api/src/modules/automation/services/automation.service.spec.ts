import { Test, TestingModule } from '@nestjs/testing';
import { AutomationService } from './automation.service';
import { DatabaseService } from '@app/database';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { AutomationTargetType } from '@prisma/client';

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

// Mock cron-parser as it's used with require() in the service
jest.mock('cron-parser', () => ({
  parseExpression: jest.fn().mockReturnValue({
    next: () => ({ toDate: () => new Date('2026-01-01T08:00:00Z') })
  })
}));

const createMockDatabaseService = () => ({
  deviceTimer: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  deviceSchedule: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
});

const createMockQueue = () => ({
  add: jest.fn(),
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
  });

  describe('createTimer', () => {
    it('should create a timer and add a job to the queue', async () => {
      const mockTimer = { id: 'timer-1' };
      db.deviceTimer.create.mockResolvedValue(mockTimer);

      const dto = {
        name: 'Test Timer',
        targetType: AutomationTargetType.DEVICE_ENTITY,
        targetId: 'device-1',
        service: 'light.turn_on',
        actions: [{ state: 1 }],
        executeAt: new Date(Date.now() + 10000).toISOString(),
      };

      const result = await service.createTimer('user-1', dto);

      expect(db.deviceTimer.create).toHaveBeenCalled();
      expect(queue.add).toHaveBeenCalled();
      expect(result).toEqual(mockTimer);
    });
  });

  describe('createSchedule', () => {
    it('should create a cron-based schedule', async () => {
      const mockSchedule = { id: 'schedule-1' };
      db.deviceSchedule.create.mockResolvedValue(mockSchedule);

      const dto = {
        name: 'Morning Lights',
        targetType: AutomationTargetType.DEVICE_ENTITY,
        targetId: 'device-1',
        service: 'light.turn_on',
        actions: [{ state: 1 }],
        cronExpression: '0 8 * * *',
        timezone: 'Asia/Ho_Chi_Minh',
      };

      const result = await service.createSchedule('user-1', dto);

      expect(db.deviceSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cronExpression: '0 8 * * *',
            nextExecuteAt: expect.any(Date),
          }),
        }),
      );
      expect(result).toEqual(mockSchedule);
    });

    it('should handle cron calculation error', async () => {
       const cronParser = require('cron-parser');
       cronParser.parseExpression.mockImplementationOnce(() => { throw new Error('Invalid'); });
       
       const mockSchedule = { id: 'schedule-failed' };
       db.deviceSchedule.create.mockResolvedValue(mockSchedule);

       const dto = {
         cronExpression: 'INVALID',
       };

       await service.createSchedule('user-1', dto as any);
       expect(db.deviceSchedule.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({ nextExecuteAt: null })
          })
       );
    });

    it('should create a day-of-week based schedule', async () => {
       const mockSchedule = { id: 'schedule-2' };
       db.deviceSchedule.create.mockResolvedValue(mockSchedule);

       const dto = {
         name: 'Weekend Lights',
         targetType: AutomationTargetType.DEVICE_ENTITY,
         targetId: 'device-2',
         service: 'light.turn_on',
         actions: [{ state: 1 }],
         daysOfWeek: [0, 1, 2, 3, 4, 5, 6], // All days to ensure we find "next"
         timeOfDay: '23:59', // Late night to be in future if we run during day
       };

       const result = await service.createSchedule('user-1', dto);

       expect(db.deviceSchedule.create).toHaveBeenCalledWith(
         expect.objectContaining({
           data: expect.objectContaining({
             nextExecuteAt: expect.any(Date),
           }),
         }),
       );
       expect(result).toEqual(mockSchedule);
    });
  });

  describe('getTimers and getSchedules', () => {
    it('should list timers for a user', async () => {
      db.deviceTimer.findMany.mockResolvedValue([{ id: 't1' }]);
      const result = await service.getTimers('user-1');
      expect(result).toHaveLength(1);
    });

    it('should list schedules for a user', async () => {
      db.deviceSchedule.findMany.mockResolvedValue([{ id: 's1' }]);
      const result = await service.getSchedules('user-1');
      expect(result).toHaveLength(1);
    });
  });
});
