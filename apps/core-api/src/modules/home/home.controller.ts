import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DocResponse } from '@app/common/doc/decorators/doc.response.decorator';
import { AuthUser } from '@app/common/request/decorators/request.user.decorator';
import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { IAuthUser } from '@app/common/request/interfaces/request.interface';
import { UseGuards } from '@nestjs/common';
import {
  AddMemberDto,
  CreateFloorDto,
  CreateHomeDto,
  CreateRoomDto,
  UpdateFloorDto,
  UpdateHomeDto,
  UpdateRoomDto,
} from './dtos/request';
import {
  FloorResponseDto,
  HomeMemberResponseDto,
  HomeResponseDto,
  RoomResponseDto,
} from './dtos/response/home.response';
import { HomeService } from './home.service';

@ApiTags('Home')
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@Controller({ path: '/homes', version: '1' })
export class HomeController {
  constructor(private readonly homeService: HomeService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách nhà của user' })
  @DocResponse({
    serialization: HomeResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.list',
  })
  async getHomes(@AuthUser() user: IAuthUser): Promise<HomeResponseDto[]> {
    return this.homeService.getHomesForUser(user.userId);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo nhà mới' })
  @DocResponse({
    serialization: HomeResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'home.success.created',
  })
  async createHome(
    @AuthUser() user: IAuthUser,
    @Body() dto: CreateHomeDto,
  ): Promise<HomeResponseDto> {
    return this.homeService.createHome(user.userId, dto);
  }

  @Get(':homeId/members')
  @ApiOperation({ summary: 'Lấy danh sách thành viên trong nhà' })
  @DocResponse({
    serialization: HomeMemberResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.members',
  })
  async getMembers(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
  ): Promise<HomeMemberResponseDto[]> {
    return this.homeService.getMembers(homeId, user.userId);
  }

  @Post(':homeId/members')
  @ApiOperation({
    summary: 'Thêm thành viên vào nhà (theo userId hoặc email)',
  })
  @DocResponse({
    serialization: HomeMemberResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'home.success.memberAdded',
  })
  async addMember(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
    @Body() dto: AddMemberDto,
  ): Promise<HomeMemberResponseDto> {
    return this.homeService.addMember(homeId, user.userId, dto);
  }

  @Get(':homeId/floors/:floorId/rooms')
  @ApiOperation({ summary: 'Lấy danh sách phòng theo tầng' })
  @DocResponse({
    serialization: RoomResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.rooms',
  })
  async getRoomsByFloor(
    @AuthUser() user: IAuthUser,
    @Param('floorId') floorId: string,
  ): Promise<RoomResponseDto[]> {
    return this.homeService.getRoomsByFloor(floorId, user.userId);
  }

  @Get(':homeId/floors')
  @ApiOperation({ summary: 'Lấy danh sách tầng theo nhà' })
  @DocResponse({
    serialization: FloorResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.floors',
  })
  async getFloors(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
  ): Promise<FloorResponseDto[]> {
    return this.homeService.getFloors(homeId, user.userId);
  }

  @Get(':homeId/rooms')
  @ApiOperation({ summary: 'Lấy danh sách phòng theo nhà' })
  @DocResponse({
    serialization: RoomResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.rooms',
  })
  async getRoomsByHome(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
  ): Promise<RoomResponseDto[]> {
    return this.homeService.getRoomsByHome(homeId, user.userId);
  }

  @Post(':homeId/floors')
  @ApiOperation({ summary: 'Tạo tầng trong nhà' })
  @DocResponse({
    serialization: FloorResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'home.success.floorCreated',
  })
  async createFloor(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
    @Body() dto: CreateFloorDto,
  ): Promise<FloorResponseDto> {
    return this.homeService.createFloor(homeId, user.userId, dto);
  }

  @Post(':homeId/rooms')
  @ApiOperation({
    summary: 'Tạo phòng trong nhà (có thể chỉ định tầng qua body)',
  })
  @DocResponse({
    serialization: RoomResponseDto,
    httpStatus: HttpStatus.CREATED,
    messageKey: 'home.success.roomCreated',
  })
  async createRoom(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
    @Body() dto: CreateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.homeService.createRoom(homeId, user.userId, dto, dto.floorId);
  }

  @Patch('floors/:floorId')
  @ApiOperation({ summary: 'Cập nhật tầng' })
  @DocResponse({
    serialization: FloorResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.floorUpdated',
  })
  async updateFloor(
    @AuthUser() user: IAuthUser,
    @Param('floorId') floorId: string,
    @Body() dto: UpdateFloorDto,
  ): Promise<FloorResponseDto> {
    return this.homeService.updateFloor(floorId, user.userId, dto);
  }

  @Patch('rooms/:roomId')
  @ApiOperation({ summary: 'Cập nhật phòng' })
  @DocResponse({
    serialization: RoomResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.roomUpdated',
  })
  async updateRoom(
    @AuthUser() user: IAuthUser,
    @Param('roomId') roomId: string,
    @Body() dto: UpdateRoomDto,
  ): Promise<RoomResponseDto> {
    return this.homeService.updateRoom(roomId, user.userId, dto);
  }

  @Patch(':homeId')
  @ApiOperation({ summary: 'Cập nhật thông tin nhà (tên, tọa độ, bán kính)' })
  @DocResponse({
    serialization: HomeResponseDto,
    httpStatus: HttpStatus.OK,
    messageKey: 'home.success.updated',
  })
  async updateHome(
    @AuthUser() user: IAuthUser,
    @Param('homeId') homeId: string,
    @Body() dto: UpdateHomeDto,
  ): Promise<HomeResponseDto> {
    return this.homeService.updateHome(homeId, user.userId, dto);
  }
}
