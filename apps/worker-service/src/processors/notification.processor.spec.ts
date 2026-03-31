import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

jest.mock('expo-server-sdk', () => ({
  __esModule: true,
  default: jest.fn(),
  Expo: jest.fn(),
}));

import { NotificationProcessor, PushNotificationJobData } from './notification.processor';
import { NotificationService } from '@app/common/notification/services/notification.service';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let mockNotificationService: Partial<NotificationService>;

  beforeEach(async () => {
    mockNotificationService = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
      sendToHome: jest.fn().mockResolvedValue(undefined),
      sendDeviceAlert: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: NotificationService, useValue: mockNotificationService },
      ],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should correctly process user notifications', async () => {
      const job = {
        id: 'user-job-1',
        data: {
          type: 'user',
          payload: { userId: 'u1', title: 'test', body: 'body', data: { extra: 1 } },
        },
      } as unknown as Job<PushNotificationJobData>;

      await processor.process(job);

      expect(mockNotificationService.sendToUser).toHaveBeenCalledWith(
        'u1', 'test', 'body', { extra: 1 }
      );
    });

    it('should throw error if userId missing for user type', async () => {
      const job = {
        data: { type: 'user', payload: { title: 't', body: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('UserId is missing');
    });

    it('should correctly process home notifications', async () => {
      const job = {
        id: 'home-job-1',
        data: {
          type: 'home',
          payload: { homeId: 'h1', title: 't', body: 'b' },
        },
      } as unknown as Job<PushNotificationJobData>;

      await processor.process(job);

      expect(mockNotificationService.sendToHome).toHaveBeenCalledWith(
        'h1', 't', 'b', undefined
      );
    });

    it('should throw error if homeId missing for home type', async () => {
      const job = {
        data: { type: 'home', payload: { title: 't', body: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('HomeId is missing');
    });

    it('should correctly process deviceAlert notifications', async () => {
      const job = {
        id: 'device-job-1',
        data: {
          type: 'deviceAlert',
          payload: { deviceId: 'd1', eventType: 'offline', title: 't', body: 'b' },
        },
      } as unknown as Job<PushNotificationJobData>;

      await processor.process(job);

      expect(mockNotificationService.sendDeviceAlert).toHaveBeenCalledWith(
        'd1', 'offline', 't', 'b', undefined
      );
    });

    it('should throw error if deviceId or eventType missing for deviceAlert type', async () => {
      const job = {
        data: { type: 'deviceAlert', payload: { eventType: 'offline' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('DeviceId or eventType is missing');
    });

    it('should gracefully handle unknown types by logging and returning (not throwing)', async () => {
      const job = {
        data: { type: 'unknown_type', payload: {} },
      } as unknown as Job<PushNotificationJobData>;

      // Expected to not throw, just log warning
      await processor.process(job);
      expect(mockNotificationService.sendDeviceAlert).not.toHaveBeenCalled();
    });

    it('should propagate errors from NotificationService so BullMQ can retry', async () => {
      mockNotificationService.sendToUser = jest.fn().mockRejectedValue(new Error('API failure'));
      
      const job = {
        data: { type: 'user', payload: { userId: 'u1', title: 't', body: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('API failure');
    });
  });
});
