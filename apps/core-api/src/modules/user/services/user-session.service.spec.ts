import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserSessionService } from './user-session.service';
import { DatabaseService } from '@app/database';

const createMockDatabaseService = () => ({
  session: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
});

describe('UserSessionService', () => {
  let service: UserSessionService;
  let db: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    db = createMockDatabaseService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSessionService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get<UserSessionService>(UserSessionService);
  });

  // ============================================================
  // getSessions
  // ============================================================
  describe('getSessions', () => {
    it('should return all sessions for a user', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          deviceName: 'iPhone 15',
          ipAddress: null,
          userAgent: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(),
        },
        {
          id: 'session-2',
          deviceName: 'MacBook Pro',
          ipAddress: null,
          userAgent: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          expiresAt: new Date(),
        },
      ];
      db.session.findMany.mockResolvedValue(mockSessions);

      const result = await service.getSessions('user-1');

      expect(result).toEqual(mockSessions);
      expect(db.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        select: {
          id: true,
          deviceName: true,
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          updatedAt: true,
          expiresAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      });
    });

    it('should return empty array if no sessions exist', async () => {
      db.session.findMany.mockResolvedValue([]);

      const result = await service.getSessions('user-1');

      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // revokeSession
  // ============================================================
  describe('revokeSession', () => {
    it('should delete session if it exists and belongs to user', async () => {
      db.session.findFirst.mockResolvedValue({
        id: 'session-1',
        userId: 'user-1',
      });

      await service.revokeSession('user-1', 'session-1');

      expect(db.session.findFirst).toHaveBeenCalledWith({
        where: { id: 'session-1', userId: 'user-1' },
      });
      expect(db.session.delete).toHaveBeenCalledWith({
        where: { id: 'session-1' },
      });
    });

    it('should throw NotFoundException if session does not exist', async () => {
      db.session.findFirst.mockResolvedValue(null);

      await expect(
        service.revokeSession('user-1', 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if session belongs to another user', async () => {
      db.session.findFirst.mockResolvedValue(null); // findFirst with userId filter returns null

      await expect(
        service.revokeSession('user-1', 'session-of-user-2'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
