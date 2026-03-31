import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

jest.mock('expo-server-sdk', () => ({
  __esModule: true,
  default: jest.fn(),
  Expo: jest.fn(),
}));

import { NotificationProcessor, PushNotificationJobData } from './notification.processor';
import { NotificationService } from '@app/common/notification/services/notification.service';
import { MessageService } from '@app/common/message/services/message.service';

describe('NotificationProcessor', () => {
  let processor: NotificationProcessor;
  let mockNotificationService: Partial<NotificationService>;
  let mockMessageService: Partial<MessageService>;

  beforeEach(async () => {
    mockNotificationService = {
      sendToUser: jest.fn().mockResolvedValue(undefined),
      sendToHome: jest.fn().mockResolvedValue(undefined),
      sendDeviceAlert: jest.fn().mockResolvedValue(undefined),
    };

    mockMessageService = {
      translate: jest.fn().mockImplementation((key: string) => key),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationProcessor,
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: MessageService, useValue: mockMessageService },
      ],
    }).compile();

    processor = module.get<NotificationProcessor>(NotificationProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should correctly process user notifications with translations', async () => {
      const job = {
        id: 'user-job-1',
        data: {
          type: 'user',
          payload: { 
            userId: 'u1', 
            titleKey: 'device.alert.online.title', 
            bodyKey: 'device.alert.online.body', 
            data: { deviceName: 'Switch' } 
          },
        },
      } as unknown as Job<PushNotificationJobData>;

      await processor.process(job);

      expect(mockMessageService.translate).toHaveBeenCalledWith(
        'device.alert.online.title',
        expect.objectContaining({ args: { deviceName: 'Switch' } })
      );
      expect(mockNotificationService.sendToUser).toHaveBeenCalledWith(
        'u1', 'device.alert.online.title', 'device.alert.online.body', { deviceName: 'Switch' }
      );
    });

    it('should throw error if userId missing for user type', async () => {
      const job = {
        data: { type: 'user', payload: { titleKey: 't', bodyKey: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('UserId is missing');
    });

    it('should correctly process home notifications', async () => {
      const job = {
        id: 'home-job-1',
        data: {
          type: 'home',
          payload: { homeId: 'h1', titleKey: 't', bodyKey: 'b' },
        },
      } as unknown as Job<PushNotificationJobData>;

      await processor.process(job);

      expect(mockNotificationService.sendToHome).toHaveBeenCalledWith(
        'h1', 't', 'b', {}
      );
    });

    it('should throw error if homeId missing for home type', async () => {
      const job = {
        data: { type: 'home', payload: { titleKey: 't', bodyKey: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('HomeId is missing');
    });

    it('should correctly process deviceAlert notifications', async () => {
      const job = {
        id: 'device-job-1',
        data: {
          type: 'deviceAlert',
          payload: { deviceId: 'd1', eventType: 'offline', titleKey: 't', bodyKey: 'b' },
        },
      } as unknown as Job<PushNotificationJobData>;

      await processor.process(job);

      expect(mockNotificationService.sendDeviceAlert).toHaveBeenCalledWith(
        'd1', 'offline', 't', 'b', {}
      );
    });

    it('should throw error if deviceId or eventType missing for deviceAlert type', async () => {
      const job = {
        data: { type: 'deviceAlert', payload: { eventType: 'offline', titleKey: 't', bodyKey: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('DeviceId or eventType is missing');
    });

    it('should gracefully handle unknown types by logging and returning (not throwing)', async () => {
      const job = {
        data: { type: 'unknown_type', payload: { titleKey: 't' } },
      } as unknown as Job<PushNotificationJobData>;

      // Expected to not throw, just log warning
      await processor.process(job);
      expect(mockNotificationService.sendDeviceAlert).not.toHaveBeenCalled();
    });

    it('should propagate errors from NotificationService so BullMQ can retry', async () => {
      mockNotificationService.sendToUser = jest.fn().mockRejectedValue(new Error('API failure'));
      
      const job = {
        data: { type: 'user', payload: { userId: 'u1', titleKey: 't', bodyKey: 'b' } },
      } as unknown as Job<PushNotificationJobData>;

      await expect(processor.process(job)).rejects.toThrow('API failure');
    });
  });
});
