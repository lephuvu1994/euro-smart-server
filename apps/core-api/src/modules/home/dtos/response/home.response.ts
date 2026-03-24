import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

export class HomeResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  latitude: number | null;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  longitude: number | null;

  @Expose()
  @ApiProperty({ default: 100 })
  radius: number;

  @Expose()
  @ApiProperty()
  ownerId: string;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}

export class RoomResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty({ default: 0 })
  sortOrder: number;

  @Expose()
  @ApiProperty()
  homeId: string;

  @Expose()
  @ApiProperty({ required: false, nullable: true })
  floorId: string | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}

export class FloorResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty({ default: 0 })
  sortOrder: number;

  @Expose()
  @ApiProperty()
  homeId: string;

  @ApiProperty({
    description: 'Danh sách các phòng thuộc tầng này',
    type: [RoomResponseDto],
  })
  @Expose()
  @Type(() => RoomResponseDto)
  @ValidateNested({ each: true })
  rooms: RoomResponseDto[];

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}

export class HomeMemberResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  userId: string;

  @Expose()
  @ApiProperty()
  homeId: string;

  @Expose()
  @ApiProperty()
  role: string;

  @Expose()
  @ApiProperty({ description: 'Thông tin user (không có password)' })
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

/** Response cho GET /homes/:homeId/detail — gộp home + floors + rooms */
export class HomeDetailResponseDto {
  @Expose()
  @ApiProperty({ type: HomeResponseDto })
  @Type(() => HomeResponseDto)
  home: HomeResponseDto;

  @Expose()
  @ApiProperty({ type: [FloorResponseDto] })
  @Type(() => FloorResponseDto)
  @ValidateNested({ each: true })
  floors: FloorResponseDto[];

  @Expose()
  @ApiProperty({
    type: [RoomResponseDto],
    description:
      'Tất cả rooms của home (bao gồm cả rooms không thuộc floor nào)',
  })
  @Type(() => RoomResponseDto)
  @ValidateNested({ each: true })
  rooms: RoomResponseDto[];
}
