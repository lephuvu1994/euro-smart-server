import { Test, TestingModule } from '@nestjs/testing';
import { AutomationController } from './automation.controller';
import { AutomationService } from '../services/automation.service';
import { AutomationTargetType } from '@prisma/client';
import { IRequest } from '@app/common';

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

const createMockAutomationService = () => ({
  createTimer: jest.fn(),
  getTimers: jest.fn(),
  createSchedule: jest.fn(),
  getSchedules: jest.fn(),
  deleteTimer: jest.fn(),
  deleteSchedule: jest.fn(),
  toggleSchedule: jest.fn(),
  getExecutionStats: jest.fn(),
  getQueueMetrics: jest.fn(),
});

describe('AutomationController', () => {
  let controller: AutomationController;
  let service: any;

  beforeEach(async () => {
    service = createMockAutomationService();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AutomationController],
      providers: [
        { provide: AutomationService, useValue: service },
      ],
    }).compile();

    controller = module.get<AutomationController>(AutomationController);
  });

  describe('createTimer', () => {
    it('should create a timer', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      const dto = {
        name: 'Test Timer',
        targetType: AutomationTargetType.DEVICE_ENTITY,
        targetId: 'device-1',
        service: 'light.turn_on',
        actions: [],
        executeAt: new Date().toISOString(),
      };

      await controller.createTimer(mockReq, dto);
      expect(service.createTimer).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getTimers', () => {
    it('should get timers for the authenticated user', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      await controller.getTimers(mockReq);
      expect(service.getTimers).toHaveBeenCalledWith('user-1');
    });
  });

  describe('createSchedule', () => {
    it('should create a schedule', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      const dto = {
        name: 'Morning Lights',
        targetType: AutomationTargetType.DEVICE_ENTITY,
        targetId: 'device-1',
        service: 'light.turn_on',
        actions: [],
        cronExpression: '0 8 * * *',
      };

      await controller.createSchedule(mockReq, dto);
      expect(service.createSchedule).toHaveBeenCalledWith('user-1', dto);
    });
  });

  describe('getSchedules', () => {
    it('should get schedules for the authenticated user', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      await controller.getSchedules(mockReq);
      expect(service.getSchedules).toHaveBeenCalledWith('user-1');
    });
  });

  describe('deleteTimer', () => {
    it('should delete a timer', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      await controller.deleteTimer(mockReq, 't1');
      expect(service.deleteTimer).toHaveBeenCalledWith('user-1', 't1');
    });
  });

  describe('deleteSchedule', () => {
    it('should delete a schedule', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      await controller.deleteSchedule(mockReq, 's1');
      expect(service.deleteSchedule).toHaveBeenCalledWith('user-1', 's1');
    });
  });

  describe('toggleSchedule', () => {
    it('should toggle a schedule', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      await controller.toggleSchedule(mockReq, 's1', { isActive: false });
      expect(service.toggleSchedule).toHaveBeenCalledWith('user-1', 's1', false);
    });
  });

  describe('getStats', () => {
    it('should call getExecutionStats', async () => {
      const mockReq = { user: { userId: 'user-1' } } as IRequest;
      await controller.getStats(mockReq);
      expect(service.getExecutionStats).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getQueueMetrics', () => {
    it('should call getQueueMetrics', async () => {
      await controller.getQueueMetrics();
      expect(service.getQueueMetrics).toHaveBeenCalled();
    });
  });
});
