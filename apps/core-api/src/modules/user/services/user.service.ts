import { HttpStatus, Injectable, HttpException } from '@nestjs/common';

import { DatabaseService } from '@app/database';
import { EHomeRole } from '@app/common';
import { ApiGenericResponseDto } from '@app/common/response/dtos/response.generic.dto';

import { UserUpdateDto } from '../dtos/request/user.update.request';
import {
  UserGetProfileResponseDto,
  UserUpdateProfileResponseDto,
} from '../dtos/response/user.response';
import { IUserService } from '../interfaces/user.service.interface';

@Injectable()
export class UserService implements IUserService {
  constructor(private readonly databaseService: DatabaseService) {}

  async updateUser(
    userId: string,
    data: UserUpdateDto,
  ): Promise<UserUpdateProfileResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    const updatedUser = await this.databaseService.user.update({
      where: { id: userId },
      data,
    });
    // CHỖ SỬA: Map dữ liệu từ DB sang định dạng của DTO
    return {
      id: updatedUser.id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      // Thêm avatar (hoặc null/chuỗi rỗng nếu schema của bạn chưa bắt buộc)
      avatar: updatedUser.avatar || null,
      createdAt: updatedUser.createdAt,
      updatedAt: updatedUser.updatedAt,
    };
  }

  async deleteUser(userId: string): Promise<ApiGenericResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }
    await this.databaseService.user.update({
      where: { id: userId },
      data: { updatedAt: new Date() },
    });

    return {
      success: true,
      message: 'user.success.userDeleted',
    };
  }

  async getProfile(id: string): Promise<UserGetProfileResponseDto> {
    const user = await this.databaseService.user.findUnique({
      where: { id },
      include: {
        ownedHomes: {
          select: {
            id: true,
            name: true,
          },
        },
        homeMemberships: {
          include: {
            home: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new HttpException('user.error.userNotFound', HttpStatus.NOT_FOUND);
    }

    // Homes mà user là OWNER
    const ownerHomes = user.ownedHomes.map((home) => ({
      id: home.id,
      name: home.name,
      isOwner: true,
      role: EHomeRole.OWNER,
    }));

    // Homes mà user là MEMBER
    const memberHomes = user.homeMemberships.map((membership) => ({
      id: membership.home.id,
      name: membership.home.name,
      isOwner: false,
      role: membership.role, // MEMBER
    }));

    // Merge lại (tránh duplicate nếu có)
    const homesMap = new Map();

    [...ownerHomes, ...memberHomes].forEach((home) => {
      homesMap.set(home.id, home);
    });

    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatar: user.avatar || null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      homes: Array.from(homesMap.values()),
    };
  }
}
