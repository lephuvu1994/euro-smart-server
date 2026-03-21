// Mock @app/common trước imports để tránh transitive ESM (@faker-js/faker)
jest.mock('@app/common', () => ({
  EHomeRole: { OWNER: 'OWNER', MEMBER: 'MEMBER' },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HomeService } from './home.service';
import { DatabaseService } from '@app/database';
import { EHomeRole } from '@app/common';

// ============================================================
// MOCK DATA
// ============================================================
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_OTHER_USER_ID = '00000000-0000-0000-0000-000000000002';
const MOCK_HOME_ID = '00000000-0000-0000-0000-000000000010';
const MOCK_FLOOR_ID_1 = '00000000-0000-0000-0000-000000000020';
const MOCK_FLOOR_ID_2 = '00000000-0000-0000-0000-000000000021';
const MOCK_ROOM_ID_1 = '00000000-0000-0000-0000-000000000030';
const MOCK_ROOM_ID_2 = '00000000-0000-0000-0000-000000000031';
const MOCK_ROOM_ID_3 = '00000000-0000-0000-0000-000000000032';

const mockHome = {
  id: MOCK_HOME_ID,
  name: 'Test Home',
  ownerId: MOCK_USER_ID,
  latitude: null,
  longitude: null,
  radius: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockFloor1 = {
  id: MOCK_FLOOR_ID_1,
  name: 'Floor 1',
  sortOrder: 0,
  homeId: MOCK_HOME_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  rooms: [],
};

const mockFloor2 = {
  id: MOCK_FLOOR_ID_2,
  name: 'Floor 2',
  sortOrder: 1,
  homeId: MOCK_HOME_ID,
  createdAt: new Date(),
  updatedAt: new Date(),
  rooms: [],
};

const mockRoom1 = {
  id: MOCK_ROOM_ID_1,
  name: 'Room 1',
  sortOrder: 0,
  homeId: MOCK_HOME_ID,
  floorId: MOCK_FLOOR_ID_1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRoom2 = {
  id: MOCK_ROOM_ID_2,
  name: 'Room 2',
  sortOrder: 1,
  homeId: MOCK_HOME_ID,
  floorId: MOCK_FLOOR_ID_1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRoom3 = {
  id: MOCK_ROOM_ID_3,
  name: 'Room 3 (ungrouped)',
  sortOrder: 0,
  homeId: MOCK_HOME_ID,
  floorId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ============================================================
// MOCK DATABASE SERVICE
// ============================================================
const createMockDatabaseService = () => ({
  home: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  floor: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
  },
  room: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    delete: jest.fn(),
    aggregate: jest.fn(),
    count: jest.fn(),
  },
  deviceFeature: {
    count: jest.fn(),
  },
  scene: {
    count: jest.fn(),
  },
  homeMember: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('HomeService', () => {
  let service: HomeService;
  let db: ReturnType<typeof createMockDatabaseService>;

  beforeEach(async () => {
    db = createMockDatabaseService();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HomeService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();
    service = module.get<HomeService>(HomeService);
  });

  // ============================================================
  // getHomesForUser
  // ============================================================
  describe('getHomesForUser', () => {
    it('should return homes with nested floors and rooms', async () => {
      const homesWithData = [{ ...mockHome, floors: [{ ...mockFloor1, rooms: [mockRoom1] }], rooms: [mockRoom1, mockRoom3] }];
      db.home.findMany.mockResolvedValue(homesWithData);
      const result = await service.getHomesForUser(MOCK_USER_ID);
      expect(result).toEqual(homesWithData);
      expect(db.home.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            floors: expect.any(Object),
            rooms: expect.any(Object),
          }),
        }),
      );
    });

    it('should return empty array when user has no homes', async () => {
      db.home.findMany.mockResolvedValue([]);
      const result = await service.getHomesForUser(MOCK_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // ============================================================
  // getHomeDetail
  // ============================================================
  describe('getHomeDetail', () => {
    it('should return home detail with floors and rooms', async () => {
      db.home.findFirst.mockResolvedValue(mockHome); // ensureAccess
      db.home.findUnique.mockResolvedValue(mockHome);
      db.floor.findMany.mockResolvedValue([{ ...mockFloor1, rooms: [mockRoom1, mockRoom2] }]);
      db.room.findMany.mockResolvedValue([mockRoom1, mockRoom2, mockRoom3]);

      const result = await service.getHomeDetail(MOCK_HOME_ID, MOCK_USER_ID);
      expect(result.home).toEqual(mockHome);
      expect(result.floors).toHaveLength(1);
      expect(result.rooms).toHaveLength(3);
    });

    it('should throw FORBIDDEN when user has no access', async () => {
      db.home.findFirst.mockResolvedValue(null);
      await expect(
        service.getHomeDetail(MOCK_HOME_ID, MOCK_OTHER_USER_ID),
      ).rejects.toThrow(
        new HttpException('home.error.notFoundOrNoAccess', HttpStatus.FORBIDDEN),
      );
    });
  });

  // ============================================================
  // createHome
  // ============================================================
  describe('createHome', () => {
    it('should create a home and add owner as member', async () => {
      db.home.create.mockResolvedValue(mockHome);
      db.homeMember.create.mockResolvedValue({});
      const result = await service.createHome(MOCK_USER_ID, { name: 'Test Home' });
      expect(result).toEqual(mockHome);
      expect(db.homeMember.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ role: EHomeRole.OWNER }),
        }),
      );
    });
  });

  // ============================================================
  // updateHome
  // ============================================================
  describe('updateHome', () => {
    it('should update home name', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      const updated = { ...mockHome, name: 'Updated' };
      db.home.update.mockResolvedValue(updated);
      const result = await service.updateHome(MOCK_HOME_ID, MOCK_USER_ID, { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should throw FORBIDDEN when non-owner tries to update', async () => {
      db.home.findFirst.mockResolvedValue(null);
      await expect(
        service.updateHome(MOCK_HOME_ID, MOCK_OTHER_USER_ID, { name: 'x' }),
      ).rejects.toThrow(HttpException);
    });
  });

  // ============================================================
  // FLOORS
  // ============================================================
  describe('createFloor', () => {
    it('should create floor with auto-increment sortOrder', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.floor.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      db.floor.create.mockResolvedValue({ ...mockFloor1, sortOrder: 3 });

      const result = await service.createFloor(MOCK_HOME_ID, MOCK_USER_ID, { name: 'New Floor' });
      expect(result.sortOrder).toBe(3);
      expect(db.floor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 3 }),
        }),
      );
    });

    it('should use provided sortOrder when given', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.floor.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      db.floor.create.mockResolvedValue({ ...mockFloor1, sortOrder: 5 });

      await service.createFloor(MOCK_HOME_ID, MOCK_USER_ID, { name: 'New', sortOrder: 5 });
      expect(db.floor.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sortOrder: 5 }),
        }),
      );
    });
  });

  describe('updateFloor', () => {
    it('should update floor name', async () => {
      db.floor.findFirst.mockResolvedValue({ id: MOCK_FLOOR_ID_1, homeId: MOCK_HOME_ID });
      db.floor.update.mockResolvedValue({ ...mockFloor1, name: 'Updated Floor' });
      const result = await service.updateFloor(MOCK_FLOOR_ID_1, MOCK_USER_ID, { name: 'Updated Floor' });
      expect(result.name).toBe('Updated Floor');
    });
  });

  describe('deleteFloor', () => {
    it('should set rooms to ungrouped and delete floor', async () => {
      db.floor.findFirst.mockResolvedValue({ id: MOCK_FLOOR_ID_1, homeId: MOCK_HOME_ID });
      db.room.updateMany.mockResolvedValue({ count: 2 });
      db.floor.delete.mockResolvedValue(mockFloor1);

      await service.deleteFloor(MOCK_FLOOR_ID_1, MOCK_USER_ID);
      expect(db.room.updateMany).toHaveBeenCalledWith({
        where: { floorId: MOCK_FLOOR_ID_1 },
        data: { floorId: null },
      });
      expect(db.floor.delete).toHaveBeenCalledWith({ where: { id: MOCK_FLOOR_ID_1 } });
    });

    it('should throw when floor not found', async () => {
      db.floor.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteFloor('non-existent', MOCK_USER_ID),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('reorderFloors', () => {
    it('should batch update floor sortOrder in order', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.$transaction.mockResolvedValue([mockFloor2, mockFloor1]);
      // After reorder, getFloors is called
      db.floor.findMany.mockResolvedValue([mockFloor2, mockFloor1]);

      const result = await service.reorderFloors(MOCK_HOME_ID, MOCK_USER_ID, {
        ids: [MOCK_FLOOR_ID_2, MOCK_FLOOR_ID_1],
      });
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      // Verify transaction receives array with correct length (one update per floor)
      const transactionArg = db.$transaction.mock.calls[0][0];
      expect(transactionArg).toHaveLength(2);
      expect(result).toHaveLength(2);
    });
  });

  describe('assignRoomsToFloor', () => {
    beforeEach(() => {
      // Mock ensureUserCanAccessFloor internals
      db.floor.findFirst.mockResolvedValue({ id: MOCK_FLOOR_ID_1, homeId: MOCK_HOME_ID });
      // Mock room check
      db.floor.findUniqueOrThrow.mockResolvedValue({ homeId: MOCK_HOME_ID });
    });

    it('should assign new rooms using Prisma set relation in a single update', async () => {
      db.room.count.mockResolvedValue(2);
      
      const updatedFloor = { 
        ...mockFloor1, 
        rooms: [{ id: MOCK_ROOM_ID_1 }, { id: MOCK_ROOM_ID_2 }] 
      };
      db.floor.update.mockResolvedValue(updatedFloor);

      const result = await service.assignRoomsToFloor(
        MOCK_FLOOR_ID_1,
        MOCK_USER_ID,
        [MOCK_ROOM_ID_1, MOCK_ROOM_ID_2],
      );

      // Verify validation query
      expect(db.room.count).toHaveBeenCalledWith({
        where: { id: { in: [MOCK_ROOM_ID_1, MOCK_ROOM_ID_2] }, homeId: MOCK_HOME_ID },
      });

      // Verify Prisma set query
      expect(db.floor.update).toHaveBeenCalledWith({
        where: { id: MOCK_FLOOR_ID_1 },
        data: {
          rooms: {
            set: [{ id: MOCK_ROOM_ID_1 }, { id: MOCK_ROOM_ID_2 }],
          },
        },
        include: {
          rooms: { orderBy: { createdAt: 'asc' } },
        },
      });

      expect(result.rooms).toHaveLength(2);
    });

    it('should handle empty roomIds correctly', async () => {
      const updatedFloor = { ...mockFloor1, rooms: [] };
      db.floor.update.mockResolvedValue(updatedFloor);

      const result = await service.assignRoomsToFloor(
        MOCK_FLOOR_ID_1,
        MOCK_USER_ID,
        [],
      );

      expect(db.room.count).not.toHaveBeenCalled(); // No validation needed for empty array

      expect(db.floor.update).toHaveBeenCalledWith({
        where: { id: MOCK_FLOOR_ID_1 },
        data: {
          rooms: { set: [] },
        },
        include: {
          rooms: { orderBy: { createdAt: 'asc' } },
        },
      });

      expect(result.rooms).toHaveLength(0);
    });

    it('should throw FORBIDDEN if some listed rooms do not belong to the home', async () => {
      // Say the count returns 1 but we passed 2 IDs
      db.room.count.mockResolvedValue(1);

      await expect(
        service.assignRoomsToFloor(MOCK_FLOOR_ID_1, MOCK_USER_ID, [MOCK_ROOM_ID_1, MOCK_ROOM_ID_2]),
      ).rejects.toThrow(
        new HttpException('home.error.roomNotFoundOrNoAccess', HttpStatus.FORBIDDEN)
      );

      expect(db.floor.update).not.toHaveBeenCalled();
    });

    it('should throw FORBIDDEN when user has no access to the floor', async () => {
      // findFirst returns null for verify process
      db.floor.findFirst.mockResolvedValue(null);
      await expect(
        service.assignRoomsToFloor(MOCK_FLOOR_ID_1, MOCK_USER_ID, [MOCK_ROOM_ID_1]),
      ).rejects.toThrow(
        new HttpException('home.error.floorNotFoundOrNoAccess', HttpStatus.FORBIDDEN)
      );
    });
  });

  describe('assignFeaturesToRoom', () => {
    beforeEach(() => {
      db.room.findFirst.mockResolvedValue({ id: MOCK_ROOM_ID_1, homeId: MOCK_HOME_ID });
      db.room.findUniqueOrThrow.mockResolvedValue({ homeId: MOCK_HOME_ID });
    });

    it('should assign features using Prisma set relation in a single update', async () => {
      db.deviceFeature.count.mockResolvedValue(2);
      
      const updatedRoom = { 
        ...mockRoom1, 
        features: [{ id: 'feature-1' }, { id: 'feature-2' }] 
      };
      db.room.update.mockResolvedValue(updatedRoom);

      const result = await service.assignFeaturesToRoom(
        MOCK_ROOM_ID_1,
        MOCK_USER_ID,
        ['feature-1', 'feature-2'],
      );

      expect(db.deviceFeature.count).toHaveBeenCalledWith({
        where: { id: { in: ['feature-1', 'feature-2'] }, device: { homeId: MOCK_HOME_ID } },
      });

      expect(db.room.update).toHaveBeenCalledWith({
        where: { id: MOCK_ROOM_ID_1 },
        data: {
          features: {
            set: [{ id: 'feature-1' }, { id: 'feature-2' }],
          },
        },
      });

      expect(result['features']).toHaveLength(2);
    });

    it('should handle empty featureIds correctly', async () => {
      const updatedRoom = { ...mockRoom1, features: [] };
      db.room.update.mockResolvedValue(updatedRoom);

      const result = await service.assignFeaturesToRoom(MOCK_ROOM_ID_1, MOCK_USER_ID, []);

      expect(db.deviceFeature.count).not.toHaveBeenCalled(); 
      expect(db.room.update).toHaveBeenCalledWith({
        where: { id: MOCK_ROOM_ID_1 },
        data: { features: { set: [] } },
      });
      expect(result['features']).toHaveLength(0);
    });

    it('should throw FORBIDDEN if some listed features do not belong to the home', async () => {
      db.deviceFeature.count.mockResolvedValue(1);

      await expect(
        service.assignFeaturesToRoom(MOCK_ROOM_ID_1, MOCK_USER_ID, ['f1', 'f2']),
      ).rejects.toThrow(
        new HttpException('home.error.featureNotFoundOrNoAccess', HttpStatus.FORBIDDEN)
      );
      expect(db.room.update).not.toHaveBeenCalled();
    });
  });

  describe('assignScenesToRoom', () => {
    beforeEach(() => {
      db.room.findFirst.mockResolvedValue({ id: MOCK_ROOM_ID_1, homeId: MOCK_HOME_ID });
      db.room.findUniqueOrThrow.mockResolvedValue({ homeId: MOCK_HOME_ID });
    });

    it('should assign scenes using Prisma set relation in a single update', async () => {
      db.scene.count.mockResolvedValue(2);
      
      const updatedRoom = { 
        ...mockRoom1, 
        scenes: [{ id: 'scene-1' }, { id: 'scene-2' }] 
      };
      db.room.update.mockResolvedValue(updatedRoom);

      const result = await service.assignScenesToRoom(
        MOCK_ROOM_ID_1,
        MOCK_USER_ID,
        ['scene-1', 'scene-2'],
      );

      expect(db.scene.count).toHaveBeenCalledWith({
        where: { id: { in: ['scene-1', 'scene-2'] }, homeId: MOCK_HOME_ID },
      });

      expect(db.room.update).toHaveBeenCalledWith({
        where: { id: MOCK_ROOM_ID_1 },
        data: {
          scenes: {
            set: [{ id: 'scene-1' }, { id: 'scene-2' }],
          },
        },
      });

      expect(result['scenes']).toHaveLength(2);
    });

    it('should handle empty sceneIds correctly', async () => {
      const updatedRoom = { ...mockRoom1, scenes: [] };
      db.room.update.mockResolvedValue(updatedRoom);

      const result = await service.assignScenesToRoom(MOCK_ROOM_ID_1, MOCK_USER_ID, []);

      expect(db.scene.count).not.toHaveBeenCalled(); 
      expect(db.room.update).toHaveBeenCalledWith({
        where: { id: MOCK_ROOM_ID_1 },
        data: { scenes: { set: [] } },
      });
      expect(result['scenes']).toHaveLength(0);
    });

    it('should throw FORBIDDEN if some listed scenes do not belong to the home', async () => {
      db.scene.count.mockResolvedValue(1);

      await expect(
        service.assignScenesToRoom(MOCK_ROOM_ID_1, MOCK_USER_ID, ['s1', 's2']),
      ).rejects.toThrow(
        new HttpException('home.error.sceneNotFoundOrNoAccess', HttpStatus.FORBIDDEN)
      );
      expect(db.room.update).not.toHaveBeenCalled();
    });
  });

  // ============================================================
  // ROOMS
  // ============================================================
  describe('createRoom', () => {
    it('should create room with auto-increment sortOrder', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.room.aggregate.mockResolvedValue({ _max: { sortOrder: 1 } });
      db.room.create.mockResolvedValue({ ...mockRoom1, sortOrder: 2 });

      const result = await service.createRoom(MOCK_HOME_ID, MOCK_USER_ID, { name: 'New Room' });
      expect(result.sortOrder).toBe(2);
    });

    it('should create room in floor when floorId provided', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.floor.findFirst.mockResolvedValue({ id: MOCK_FLOOR_ID_1, homeId: MOCK_HOME_ID });
      db.room.aggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
      db.room.create.mockResolvedValue({ ...mockRoom1, sortOrder: 1 });

      await service.createRoom(MOCK_HOME_ID, MOCK_USER_ID, { name: 'New Room' }, MOCK_FLOOR_ID_1);
      expect(db.room.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            floorId: MOCK_FLOOR_ID_1,
            sortOrder: 1,
          }),
        }),
      );
    });

    it('should throw when floor does not belong to home', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.floor.findFirst.mockResolvedValue({ id: MOCK_FLOOR_ID_1, homeId: 'other-home-id' });

      await expect(
        service.createRoom(MOCK_HOME_ID, MOCK_USER_ID, { name: 'x' }, MOCK_FLOOR_ID_1),
      ).rejects.toThrow(
        new HttpException('home.error.floorNotInHome', HttpStatus.BAD_REQUEST),
      );
    });
  });

  describe('updateRoom', () => {
    it('should update room name', async () => {
      db.room.findFirst.mockResolvedValue(mockRoom1);
      db.room.update.mockResolvedValue({ ...mockRoom1, name: 'Updated Room' });
      const result = await service.updateRoom(MOCK_ROOM_ID_1, MOCK_USER_ID, { name: 'Updated Room' });
      expect(result.name).toBe('Updated Room');
    });

    it('should throw when room not accessible', async () => {
      db.room.findFirst.mockResolvedValue(null);
      await expect(
        service.updateRoom(MOCK_ROOM_ID_1, MOCK_OTHER_USER_ID, { name: 'x' }),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('deleteRoom', () => {
    it('should delete room', async () => {
      db.room.findFirst.mockResolvedValue(mockRoom1);
      db.room.delete.mockResolvedValue(mockRoom1);

      await service.deleteRoom(MOCK_ROOM_ID_1, MOCK_USER_ID);
      expect(db.room.delete).toHaveBeenCalledWith({ where: { id: MOCK_ROOM_ID_1 } });
    });

    it('should throw when room not found', async () => {
      db.room.findFirst.mockResolvedValue(null);
      await expect(
        service.deleteRoom('non-existent', MOCK_USER_ID),
      ).rejects.toThrow(HttpException);
    });
  });

  describe('reorderRooms', () => {
    it('should batch update room sortOrder', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.$transaction.mockResolvedValue([]);
      db.room.findMany.mockResolvedValue([mockRoom2, mockRoom1]);

      const result = await service.reorderRooms(MOCK_HOME_ID, MOCK_USER_ID, {
        ids: [MOCK_ROOM_ID_2, MOCK_ROOM_ID_1],
      });
      expect(db.$transaction).toHaveBeenCalled();
      expect(result).toHaveLength(2);
    });
  });

  // ============================================================
  // MEMBERS
  // ============================================================
  describe('getMembers', () => {
    it('should return members list', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      const mockMembers = [{
        id: 'mem-1', userId: MOCK_USER_ID, homeId: MOCK_HOME_ID, role: EHomeRole.OWNER,
        user: { id: MOCK_USER_ID, email: 'test@test.com', phone: null, firstName: 'Test', lastName: 'User' },
      }];
      db.homeMember.findMany.mockResolvedValue(mockMembers);

      const result = await service.getMembers(MOCK_HOME_ID, MOCK_USER_ID);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe(EHomeRole.OWNER);
    });
  });

  describe('addMember', () => {
    it('should add member by userId', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.user.findUnique.mockResolvedValue({ id: MOCK_OTHER_USER_ID });
      db.homeMember.findUnique.mockResolvedValue(null);
      const newMember = {
        id: 'mem-2', userId: MOCK_OTHER_USER_ID, homeId: MOCK_HOME_ID, role: EHomeRole.MEMBER,
        user: { id: MOCK_OTHER_USER_ID, email: 'other@test.com', phone: null, firstName: 'Other', lastName: 'User' },
      };
      db.homeMember.create.mockResolvedValue(newMember);

      const result = await service.addMember(MOCK_HOME_ID, MOCK_USER_ID, { userId: MOCK_OTHER_USER_ID });
      expect(result.userId).toBe(MOCK_OTHER_USER_ID);
      expect(result.role).toBe(EHomeRole.MEMBER);
    });

    it('should throw when neither userId nor email provided', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      await expect(
        service.addMember(MOCK_HOME_ID, MOCK_USER_ID, {} as any),
      ).rejects.toThrow(
        new HttpException('home.error.provideUserIdOrEmail', HttpStatus.BAD_REQUEST),
      );
    });

    it('should throw when both userId and email provided', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      await expect(
        service.addMember(MOCK_HOME_ID, MOCK_USER_ID, { userId: MOCK_OTHER_USER_ID, email: 'x@x.com' } as any),
      ).rejects.toThrow(
        new HttpException('home.error.provideOnlyUserIdOrEmail', HttpStatus.BAD_REQUEST),
      );
    });

    it('should throw when target user not found', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.user.findUnique.mockResolvedValue(null);
      await expect(
        service.addMember(MOCK_HOME_ID, MOCK_USER_ID, { userId: 'non-existent' }),
      ).rejects.toThrow(
        new HttpException('home.error.userNotFound', HttpStatus.NOT_FOUND),
      );
    });

    it('should throw when member already in home', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.user.findUnique.mockResolvedValue({ id: MOCK_OTHER_USER_ID });
      db.homeMember.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(
        service.addMember(MOCK_HOME_ID, MOCK_USER_ID, { userId: MOCK_OTHER_USER_ID }),
      ).rejects.toThrow(
        new HttpException('home.error.memberAlreadyInHome', HttpStatus.CONFLICT),
      );
    });
  });

  // ============================================================
  // GET QUERIES
  // ============================================================
  describe('getFloors', () => {
    it('should return floors ordered by sortOrder', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.floor.findMany.mockResolvedValue([mockFloor1, mockFloor2]);
      const result = await service.getFloors(MOCK_HOME_ID, MOCK_USER_ID);
      expect(result).toHaveLength(2);
      expect(db.floor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: 'asc' },
        }),
      );
    });
  });

  describe('getRoomsByHome', () => {
    it('should return rooms ordered by sortOrder', async () => {
      db.home.findFirst.mockResolvedValue(mockHome);
      db.room.findMany.mockResolvedValue([mockRoom1, mockRoom2, mockRoom3]);
      const result = await service.getRoomsByHome(MOCK_HOME_ID, MOCK_USER_ID);
      expect(result).toHaveLength(3);
      expect(db.room.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { sortOrder: 'asc' },
        }),
      );
    });
  });

  describe('getRoomsByFloor', () => {
    it('should return rooms for specific floor', async () => {
      db.floor.findFirst.mockResolvedValue({ id: MOCK_FLOOR_ID_1, homeId: MOCK_HOME_ID });
      db.room.findMany.mockResolvedValue([mockRoom1, mockRoom2]);
      const result = await service.getRoomsByFloor(MOCK_FLOOR_ID_1, MOCK_USER_ID);
      expect(result).toHaveLength(2);
    });

    it('should throw when floor not accessible', async () => {
      db.floor.findFirst.mockResolvedValue(null);
      await expect(
        service.getRoomsByFloor(MOCK_FLOOR_ID_1, MOCK_OTHER_USER_ID),
      ).rejects.toThrow(HttpException);
    });
  });
});
