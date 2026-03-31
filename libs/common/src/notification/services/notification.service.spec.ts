import { Test, TestingModule } from '@nestjs/testing';
import { NotificationService } from './notification.service';
import { DatabaseService } from '@app/database';

// Mock Expo SDK constructor and methods
jest.mock('expo-server-sdk', () => {
  return {
    __esModule: true,
    default: Object.assign(
      jest.fn().mockImplementation(() => ({
        chunkPushNotifications: jest.fn().mockReturnValue([[{ to: 'ExpoPushToken[valid]' }]]),
        sendPushNotificationsAsync: jest.fn().mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]),
      })),
      {
        isExpoPushToken: jest.fn((token) => token === 'ExpoPushToken[valid]'),
      }
    ),
  };
});

describe('NotificationService', () => {
  let service: NotificationService;
  let db: DatabaseService;
  let mockExpoInstance: any;

  beforeEach(async () => {
    // Basic mocks for DatabaseService
    const mockDbService = {
      session: {
        findMany: jest.fn(),
      },
      homeMember: {
        findMany: jest.fn(),
      },
      device: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    db = module.get<DatabaseService>(DatabaseService);
    
    // We can extract the mocked expo instance from the service if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockExpoInstance = (service as any).expo;
    
    // Clear mocks between tests
    jest.clearAllMocks();
  });

  describe('sendPushMessages', () => {
    it('should filter out invalid tokens and not call chunk/send if no valid tokens exist', async () => {
      await service.sendPushMessages([
        { to: 'invalid-token', title: 'test', body: 'body' }
      ]);
      expect(mockExpoInstance.chunkPushNotifications).not.toHaveBeenCalled();
      expect(mockExpoInstance.sendPushNotificationsAsync).not.toHaveBeenCalled();
    });

    it('should send valid tokens in chunks', async () => {
      await service.sendPushMessages([
        { to: 'ExpoPushToken[valid]', title: 'test', body: 'body' },
        { to: 'invalid-token', title: 'test2', body: 'body2' } // This one should be filtered out
      ]);
      
      expect(mockExpoInstance.chunkPushNotifications).toHaveBeenCalledWith([
        { to: 'ExpoPushToken[valid]', title: 'test', body: 'body' }
      ]);
      expect(mockExpoInstance.sendPushNotificationsAsync).toHaveBeenCalledTimes(1);
    });
    
    it('should catch errors from sendPushNotificationsAsync', async () => {
      mockExpoInstance.sendPushNotificationsAsync.mockRejectedValueOnce(new Error('Network error'));
      await service.sendPushMessages([
        { to: 'ExpoPushToken[valid]', title: 'test', body: 'body' },
      ]);
      // Should handle the rejection gracefully and just log it (which is standard behavior)
      expect(mockExpoInstance.sendPushNotificationsAsync).toHaveBeenCalled();
    });
  });

  describe('sendToUser', () => {
    it('should query sessions and send to valid ones', async () => {
      jest.spyOn(db.session, 'findMany').mockResolvedValue([
        { pushToken: 'ExpoPushToken[valid]' } as any
      ]);
      
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages').mockResolvedValue();

      await service.sendToUser('user1', 'Title', 'Body', { key: 'val' });
      
      expect(db.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user1', pushToken: { not: null } },
        select: { pushToken: true },
      });
      expect(sendMessagesSpy).toHaveBeenCalledWith([
        { to: 'ExpoPushToken[valid]', title: 'Title', body: 'Body', data: { key: 'val' } },
      ]);
    });

    it('should do nothing if no sessions found', async () => {
      jest.spyOn(db.session, 'findMany').mockResolvedValue([]);
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages');
      
      await service.sendToUser('user1', 'Title', 'Body');
      expect(sendMessagesSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendToHome', () => {
    it('should aggregate tokens globally from all home members', async () => {
      jest.spyOn(db.homeMember, 'findMany').mockResolvedValue([
        { user: { sessions: [{ pushToken: 'ExpoPushToken[valid]' }] } } as any,
        { user: { sessions: [{ pushToken: 'ExpoPushToken[valid]' }, { pushToken: 'another-token' }] } } as any,
      ]);
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages').mockResolvedValue();

      await service.sendToHome('home1', 'Title', 'Body');

      expect(db.homeMember.findMany).toHaveBeenCalled();
      // Should deduplicate "ExpoPushToken[valid]"
      expect(sendMessagesSpy).toHaveBeenCalledWith([
        { to: 'ExpoPushToken[valid]', title: 'Title', body: 'Body', data: undefined },
        { to: 'another-token', title: 'Title', body: 'Body', data: undefined },
      ]);
    });

    it('should do nothing if no tokens found in home', async () => {
      jest.spyOn(db.homeMember, 'findMany').mockResolvedValue([
        { user: { sessions: [] } } as any
      ]);
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages');
      await service.sendToHome('home1', 'Title', 'Body');
      expect(sendMessagesSpy).not.toHaveBeenCalled();
    });
  });

  describe('sendDeviceAlert', () => {
    it('should block sending if device does not exist', async () => {
      jest.spyOn(db.device, 'findUnique').mockResolvedValue(null);
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages');

      await service.sendDeviceAlert('dev1', 'offline', 'title', 'body');
      
      expect(sendMessagesSpy).not.toHaveBeenCalled();
    });

    it('should block sending if customConfig.notify for event is false or undefined', async () => {
      jest.spyOn(db.device, 'findUnique').mockResolvedValue({
        id: 'dev1',
        ownerId: 'owner1',
        sharedUsers: [],
        home: { members: [] },
        customConfig: { notify: { offline: false } }
      } as any);
      
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages');

      await service.sendDeviceAlert('dev1', 'offline', 'title', 'body');
      expect(sendMessagesSpy).not.toHaveBeenCalled();
    });

    it('should send alert to owner and relevant members if customConfig.notify for event is true', async () => {
      jest.spyOn(db.device, 'findUnique').mockResolvedValue({
        id: 'dev1',
        ownerId: 'owner1',
        sharedUsers: [],
        home: { members: [] },
        customConfig: { notify: { offline: true } }
      } as any);
      
      jest.spyOn(db.session, 'findMany').mockResolvedValue([
        { pushToken: 'ExpoPushToken[owner]' } as any
      ]);
      const sendMessagesSpy = jest.spyOn(service, 'sendPushMessages').mockResolvedValue();

      await service.sendDeviceAlert('dev1', 'offline', 'title', 'body', { customFlag: true });
      
      expect(db.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          userId: { in: ['owner1'] },
          pushToken: { not: null }
        })
      }));

      expect(sendMessagesSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            to: 'ExpoPushToken[owner]',
            title: 'title',
            body: 'body',
            data: expect.objectContaining({ customFlag: true, deviceId: 'dev1' })
          })
        ])
      );
    });
  });
});
