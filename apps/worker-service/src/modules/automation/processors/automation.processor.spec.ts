import { Test, TestingModule } from '@nestjs/testing';
import { AutomationProcessor } from './automation.processor';
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

const createMockDatabaseService = () => ({
  deviceTimer: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  deviceSchedule: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  deviceEntity: {
    findUnique: jest.fn(),
  },
  scheduleExecutionLog: {
    create: jest.fn(),
  },
});

const createMockQueue = () => ({
  add: jest.fn(),
});

describe('AutomationProcessor', () => {
  let processor: AutomationProcessor;
  let db: any;
  let deviceControlQueue: any;

  beforeEach(async () => {
    db = createMockDatabaseService();
    deviceControlQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutomationProcessor,
        { provide: DatabaseService, useValue: db },
        {
          provide: getQueueToken(APP_BULLMQ_QUEUES.DEVICE_CONTROL),
          useValue: deviceControlQueue,
        },
      ],
    }).compile();

    processor = module.get<AutomationProcessor>(AutomationProcessor);
  });

  describe('handleTimerExecute', () => {
     it('should execute device action and log success', async () => {
        const timerId = 'timer-1';
        const mockTimer = { 
          id: timerId, 
          userId: 'user-1',
          targetType: AutomationTargetType.DEVICE_ENTITY,
          targetId: 'entity-1',
          service: 'switch.turn_on',
          actions: [{ value: 1 }]
        };
        const mockEntity = { id: 'entity-1', code: 'E1', device: { token: 'T1', ownerId: 'user-1' } };
        
        db.deviceTimer.findUnique.mockResolvedValue(mockTimer);
        db.deviceEntity.findUnique.mockResolvedValue(mockEntity);

        await (processor as any).handleTimerExecute({ timerId });

        expect(deviceControlQueue.add).toHaveBeenCalled();
        expect(db.scheduleExecutionLog.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ status: 'SUCCESS' })
        }));
        expect(db.deviceTimer.delete).toHaveBeenCalledWith({ where: { id: timerId } });
     });

     it('should execute scene action and log success', async () => {
        const timerId = 'timer-2';
        const mockTimer = { 
          id: timerId, 
          userId: 'user-1',
          targetType: AutomationTargetType.SCENE,
          targetId: 'scene-1',
          service: 'scene.activate',
          actions: [{}]
        };
        
        db.deviceTimer.findUnique.mockResolvedValue(mockTimer);

        await (processor as any).handleTimerExecute({ timerId });

        expect(deviceControlQueue.add).toHaveBeenCalledWith(
          DEVICE_JOBS.RUN_SCENE,
          expect.any(Object),
          expect.any(Object)
        );
        expect(db.scheduleExecutionLog.create).toHaveBeenCalled();
     });

     it('should handle action failure and log error', async () => {
        const timerId = 'timer-3';
        const mockTimer = { 
          id: timerId, 
          userId: 'user-1',
          targetType: AutomationTargetType.DEVICE_ENTITY,
          targetId: 'entity-nonexistent',
          service: 'switch.turn_off',
          actions: [{}]
        };
        
        db.deviceTimer.findUnique.mockResolvedValue(mockTimer);
        db.deviceEntity.findUnique.mockResolvedValue(null); // Force error

        await (processor as any).handleTimerExecute({ timerId });

        expect(db.scheduleExecutionLog.create).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ status: 'FAILED' })
        }));
        expect(db.deviceTimer.delete).toHaveBeenCalled();
     });
  });

  describe('handleScheduleExecute', () => {
     it('should execute schedule and update lastExecutedAt', async () => {
        const scheduleId = 'schedule-1';
        const mockSchedule = { 
          id: scheduleId, 
          isActive: true,
          userId: 'user-1',
          targetType: AutomationTargetType.SCENE,
          targetId: 'scene-1',
          service: 'scene.activate',
          actions: [{}]
        };
        
        db.deviceSchedule.findUnique.mockResolvedValue(mockSchedule);

        await (processor as any).handleScheduleExecute({ scheduleId });

        expect(db.scheduleExecutionLog.create).toHaveBeenCalled();
        expect(db.deviceSchedule.update).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: scheduleId },
          data: expect.objectContaining({ lastExecutedAt: expect.any(Date) })
        }));
     });
  });
});
