import { HttpStatus, Injectable, HttpException } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { EHomeRole } from '@app/common';
import {
  AddMemberDto,
  CreateFloorDto,
  CreateHomeDto,
  CreateRoomDto,
  ReorderDto,
  UpdateFloorDto,
  UpdateHomeDto,
  UpdateRoomDto,
} from './dtos/request';
import {
  FloorResponseDto,
  HomeDetailResponseDto,
  HomeMemberResponseDto,
  HomeResponseDto,
  RoomResponseDto,
} from './dtos/response/home.response';

@Injectable()
export class HomeService {
  constructor(private readonly databaseService: DatabaseService) {}

  /** Kiểm tra user có quyền truy cập home (owner hoặc member) */
  private async ensureUserCanAccessHome(
    userId: string,
    homeId: string,
  ): Promise<void> {
    const home = await this.databaseService.home.findFirst({
      where: {
        id: homeId,
        OR: [{ ownerId: userId }, { members: { some: { userId: userId } } }],
      },
    });
    if (!home) {
      throw new HttpException(
        'home.error.notFoundOrNoAccess',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Chỉ owner nhà mới được thêm thành viên / quản lý nhà */
  private async ensureUserIsHomeOwner(
    userId: string,
    homeId: string,
  ): Promise<void> {
    const home = await this.databaseService.home.findFirst({
      where: { id: homeId, ownerId: userId },
    });
    if (!home) {
      throw new HttpException(
        'home.error.onlyOwnerCanManage',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Kiểm tra floor thuộc home và user có quyền */
  private async ensureUserCanAccessFloor(
    userId: string,
    floorId: string,
  ): Promise<{ floor: { id: string; homeId: string } }> {
    const floor = await this.databaseService.floor.findFirst({
      where: {
        id: floorId,
        home: {
          OR: [{ ownerId: userId }, { members: { some: { userId: userId } } }],
        },
      },
      select: { id: true, homeId: true },
    });
    if (!floor) {
      throw new HttpException(
        'home.error.floorNotFoundOrNoAccess',
        HttpStatus.FORBIDDEN,
      );
    }
    return { floor };
  }

  /** Kiểm tra room thuộc home và user có quyền */
  private async ensureUserCanAccessRoom(
    userId: string,
    roomId: string,
  ): Promise<void> {
    const room = await this.databaseService.room.findFirst({
      where: {
        id: roomId,
        home: {
          OR: [{ ownerId: userId }, { members: { some: { userId: userId } } }],
        },
      },
    });
    if (!room) {
      throw new HttpException(
        'home.error.roomNotFoundOrNoAccess',
        HttpStatus.FORBIDDEN,
      );
    }
  }

  // ============================================================
  // HOMES
  // ============================================================

  /** Lấy chi tiết 1 nhà — kèm floors (nested rooms) + all rooms */
  async getHomeDetail(
    homeId: string,
    userId: string,
  ): Promise<HomeDetailResponseDto> {
    await this.ensureUserCanAccessHome(userId, homeId);
    const home = await this.databaseService.home.findUnique({
      where: { id: homeId },
    });
    const floors = await this.databaseService.floor.findMany({
      where: { homeId },
      include: {
        rooms: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    const rooms = await this.databaseService.room.findMany({
      where: { homeId },
      orderBy: { sortOrder: 'asc' },
    });
    return {
      home: home as HomeResponseDto,
      floors: floors as FloorResponseDto[],
      rooms: rooms as RoomResponseDto[],
    };
  }

  async createHome(
    userId: string,
    dto: CreateHomeDto,
  ): Promise<HomeResponseDto> {
    const home = await this.databaseService.home.create({
      data: {
        name: dto.name,
        ownerId: userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radius: dto.radius ?? 100,
      },
    });
    await this.databaseService.homeMember.create({
      data: {
        userId: userId,
        homeId: home.id,
        role: EHomeRole.OWNER,
      },
    });
    return home as HomeResponseDto;
  }

  async updateHome(
    homeId: string,
    userId: string,
    dto: UpdateHomeDto,
  ): Promise<HomeResponseDto> {
    await this.ensureUserIsHomeOwner(userId, homeId);
    const home = await this.databaseService.home.update({
      where: { id: homeId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && {
          longitude: dto.longitude,
        }),
        ...(dto.radius !== undefined && { radius: dto.radius }),
      },
    });
    return home as HomeResponseDto;
  }

  // ============================================================
  // MEMBERS
  // ============================================================

  async getMembers(
    homeId: string,
    userId: string,
  ): Promise<HomeMemberResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    const members = await this.databaseService.homeMember.findMany({
      where: { homeId: homeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: { id: 'asc' },
    });
    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      homeId: m.homeId,
      role: m.role,
      user: m.user,
    })) as HomeMemberResponseDto[];
  }

  async addMember(
    homeId: string,
    userId: string,
    dto: AddMemberDto,
  ): Promise<HomeMemberResponseDto> {
    await this.ensureUserIsHomeOwner(userId, homeId);
    if (!dto.userId && !dto.email) {
      throw new HttpException(
        'home.error.provideUserIdOrEmail',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.userId && dto.email) {
      throw new HttpException(
        'home.error.provideOnlyUserIdOrEmail',
        HttpStatus.BAD_REQUEST,
      );
    }
    let targetUser: { id: string } | null = null;
    if (dto.userId) {
      targetUser = await this.databaseService.user.findUnique({
        where: { id: dto.userId },
        select: { id: true },
      });
    } else if (dto.email) {
      targetUser = await this.databaseService.user.findUnique({
        where: { email: dto.email },
        select: { id: true },
      });
    }
    if (!targetUser) {
      throw new HttpException('home.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    const existing = await this.databaseService.homeMember.findUnique({
      where: {
        userId_homeId: { userId: targetUser.id, homeId: homeId },
      },
    });
    if (existing) {
      throw new HttpException(
        'home.error.memberAlreadyInHome',
        HttpStatus.CONFLICT,
      );
    }
    const member = await this.databaseService.homeMember.create({
      data: {
        userId: targetUser.id,
        homeId: homeId,
        role: dto.role ?? EHomeRole.MEMBER,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    return {
      id: member.id,
      userId: member.userId,
      homeId: member.homeId,
      role: member.role,
      user: member.user,
    } as HomeMemberResponseDto;
  }

  // ============================================================
  // FLOORS
  // ============================================================

  async getFloors(homeId: string, userId: string): Promise<FloorResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    const floors = await this.databaseService.floor.findMany({
      where: { homeId: homeId },
      include: {
        rooms: { orderBy: { sortOrder: 'asc' } },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return floors as FloorResponseDto[];
  }

  async createFloor(
    homeId: string,
    userId: string,
    dto: CreateFloorDto,
  ): Promise<FloorResponseDto> {
    await this.ensureUserCanAccessHome(userId, homeId);
    // Auto-increment sortOrder nếu không được truyền
    const maxSort = await this.databaseService.floor.aggregate({
      where: { homeId },
      _max: { sortOrder: true },
    });
    const floor = await this.databaseService.floor.create({
      data: {
        homeId: homeId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
      },
      include: {
        rooms: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return floor as FloorResponseDto;
  }

  async updateFloor(
    floorId: string,
    userId: string,
    dto: UpdateFloorDto,
  ): Promise<FloorResponseDto> {
    await this.ensureUserCanAccessFloor(userId, floorId);
    const floor = await this.databaseService.floor.update({
      where: { id: floorId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && {
          sortOrder: dto.sortOrder,
        }),
      },
      include: {
        rooms: { orderBy: { sortOrder: 'asc' } },
      },
    });
    return floor as FloorResponseDto;
  }

  async assignRoomsToFloor(
    floorId: string,
    userId: string,
    roomIds: string[],
  ): Promise<FloorResponseDto> {
    await this.ensureUserCanAccessFloor(userId, floorId);

    // Verify all upcoming rooms belong to this home to prevent cross-home assignment bypasses
    const { floor } = await this.databaseService.floor.findUniqueOrThrow({
      where: { id: floorId },
      select: { homeId: true },
    }).then(floor => ({ floor }));

    if (roomIds && roomIds.length > 0) {
      const dbRoomsCount = await this.databaseService.room.count({
        where: { id: { in: roomIds }, homeId: floor.homeId },
      });
      if (dbRoomsCount !== roomIds.length) {
        throw new HttpException('home.error.roomNotFoundOrNoAccess', HttpStatus.FORBIDDEN);
      }
    }

    const updatedFloor = await this.databaseService.floor.update({
      where: { id: floorId },
      data: {
        rooms: {
          set: (roomIds || []).map(id => ({ id })),
        },
      },
      include: {
        rooms: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    return updatedFloor as FloorResponseDto;
  }

  async deleteFloor(
    floorId: string,
    userId: string,
  ): Promise<void> {
    const { floor } = await this.ensureUserCanAccessFloor(userId, floorId);
    // Rooms trong floor này → set floorId = null (ungrouped)
    await this.databaseService.room.updateMany({
      where: { floorId: floor.id },
      data: { floorId: null },
    });
    await this.databaseService.floor.delete({
      where: { id: floor.id },
    });
  }

  async reorderFloors(
    homeId: string,
    userId: string,
    dto: ReorderDto,
  ): Promise<FloorResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    // Batch update sortOrder theo vị trí trong mảng ids
    await this.databaseService.$transaction(
      dto.ids.map((id, index) =>
        this.databaseService.floor.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getFloors(homeId, userId);
  }

  // ============================================================
  // ROOMS
  // ============================================================

  async getRoomsByHome(
    homeId: string,
    userId: string,
  ): Promise<RoomResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    const rooms = await this.databaseService.room.findMany({
      where: { homeId: homeId },
      orderBy: { sortOrder: 'asc' },
    });
    return rooms as RoomResponseDto[];
  }

  async getRoomsByFloor(
    floorId: string,
    userId: string,
  ): Promise<RoomResponseDto[]> {
    await this.ensureUserCanAccessFloor(userId, floorId);
    const rooms = await this.databaseService.room.findMany({
      where: { floorId: floorId },
      orderBy: { sortOrder: 'asc' },
    });
    return rooms as RoomResponseDto[];
  }

  async createRoom(
    homeId: string,
    userId: string,
    dto: CreateRoomDto,
    floorId?: string,
  ): Promise<RoomResponseDto> {
    await this.ensureUserCanAccessHome(userId, homeId);
    if (floorId) {
      const { floor } = await this.ensureUserCanAccessFloor(userId, floorId);
      if (floor.homeId !== homeId) {
        throw new HttpException(
          'home.error.floorNotInHome',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    // Auto-increment sortOrder
    const maxSort = await this.databaseService.room.aggregate({
      where: floorId ? { floorId } : { homeId, floorId: null },
      _max: { sortOrder: true },
    });
    const room = await this.databaseService.room.create({
      data: {
        homeId: homeId,
        floorId: floorId ?? null,
        name: dto.name,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
      },
    });
    return room as RoomResponseDto;
  }

  async updateRoom(
    roomId: string,
    userId: string,
    dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    await this.ensureUserCanAccessRoom(userId, roomId);
    const room = await this.databaseService.room.update({
      where: { id: roomId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
      },
    });
    return room as RoomResponseDto;
  }

  async deleteRoom(
    roomId: string,
    userId: string,
  ): Promise<void> {
    await this.ensureUserCanAccessRoom(userId, roomId);
    await this.databaseService.room.delete({
      where: { id: roomId },
    });
  }

  async reorderRooms(
    homeId: string,
    userId: string,
    dto: ReorderDto,
  ): Promise<RoomResponseDto[]> {
    await this.ensureUserCanAccessHome(userId, homeId);
    await this.databaseService.$transaction(
      dto.ids.map((id, index) =>
        this.databaseService.room.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return this.getRoomsByHome(homeId, userId);
  }
}
