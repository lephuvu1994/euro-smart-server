import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleCronService } from './schedule-cron.service';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { getQueueToken } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';

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

// Mock cron-parser for require()
jest.mock('cron-parser', () => ({
  parseExpression: jest.fn().mockReturnValue({
    next: () => ({ toDate: () => new Date(Date.now() + 86400000) })
  })
}));

describe('ScheduleCronService', () => {
  let service: ScheduleCronService;
  let db: any;
  let redisClient: any;
  let queue: any;

  beforeEach(async () => {
    db = {
      deviceSchedule: {
        findMany: jest.fn(),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue({}),
    };
    
    redisClient = {
      set: jest.fn(),
    };

    const redisService = {
      getClient: () => redisClient,
    };

    queue = {
      addBulk: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleCronService,
        { provide: DatabaseService, useValue: db },
        { provide: RedisService, useValue: redisService },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.AUTOMATION),
          useValue: queue,
        },
      ],
    }).compile();

    service = module.get<ScheduleCronService>(ScheduleCronService);
  });

  describe('scanSchedules', () => {
    it('should skip if cannot acquire lock', async () => {
       redisClient.set.mockResolvedValue(null);
       await service.scanSchedules();
       expect(db.deviceSchedule.findMany).not.toHaveBeenCalled();
    });

    it('should process cron schedules and update nextExecuteAt', async () => {
       redisClient.set.mockResolvedValue('OK');
       const now = new Date();
       const mockSchedule = { 
         id: 's1', 
         cronExpression: '0 8 * * *', 
         timezone: 'Asia/Ho_Chi_Minh',
         jitterSeconds: 10,
         nextExecuteAt: new Date(now.getTime() - 1000), 
       };
       db.deviceSchedule.findMany.mockResolvedValue([mockSchedule]);

       await service.scanSchedules();

       expect(queue.addBulk).toHaveBeenCalled();
       expect(db.$executeRawUnsafe).toHaveBeenCalled();
    });

    it('should handle day-of-week based schedules', async () => {
       redisClient.set.mockResolvedValue('OK');
       const now = new Date();
       const mockSchedule = { 
         id: 's3',
         daysOfWeek: [0, 1, 2, 3, 4, 5, 6], 
         timeOfDay: '00:01', 
         jitterSeconds: 0,
         nextExecuteAt: new Date(now.getTime() - 1000),
       };
       db.deviceSchedule.findMany.mockResolvedValue([mockSchedule]);

       await service.scanSchedules();

       expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE t_device_schedule')
       );
    });

    it('should deactivate schedule if no next date can be calculated', async () => {
       redisClient.set.mockResolvedValue('OK');
       const now = new Date();
       const mockSchedule = { 
         id: 's2', 
         cronExpression: 'INVALID_CRON', 
         timezone: 'Asia/Ho_Chi_Minh',
         nextExecuteAt: new Date(now.getTime() - 1000)
       };
       db.deviceSchedule.findMany.mockResolvedValue([mockSchedule]);

       const cronParser = require('cron-parser');
       cronParser.parseExpression.mockImplementationOnce(() => { throw new Error('Invalid'); });

       await service.scanSchedules();

       expect(db.$executeRawUnsafe).toHaveBeenCalledWith(
         expect.stringContaining('false') // isActive is false in the raw sql string
       );
    });

    it('should handle errors gracefully', async () => {
       redisClient.set.mockResolvedValue('OK');
       db.deviceSchedule.findMany.mockRejectedValue(new Error('DB Fail'));
       
       await expect(service.scanSchedules()).resolves.toBeUndefined();
    });
  });
});
