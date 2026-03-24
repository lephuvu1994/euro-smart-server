import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SceneTriggerItemDto } from './scene-trigger.dto';

/** Một action trong scene: điều khiển 1 entity của 1 thiết bị */
export class SceneActionItemDto {
  @ApiProperty({ description: 'Token thiết bị' })
  @IsString()
  deviceToken: string;

  @ApiProperty({ description: 'Mã entity (vd: channel_1, main)' })
  @IsString()
  entityCode: string;

  @ApiProperty({
    description: 'Giá trị (số, boolean, string tùy loại entity)',
  })
  value: any;
}

export class CreateSceneDto {
  @ApiProperty({ description: 'ID nhà (home) mà scene thuộc về' })
  @IsUUID()
  homeId: string;

  @ApiProperty({ example: 'Tối về nhà', description: 'Tên scene' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Triggers: SCHEDULE (lịch cron/at time), LOCATION (geofence enter/leave), DEVICE_STATE (điều kiện thiết bị). Để trống = scene chỉ chạy tay (manual). Server tự chạy scene khi trigger kích hoạt.',
    type: [SceneTriggerItemDto],
    example: [],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneTriggerItemDto)
  triggers?: SceneTriggerItemDto[];

  @ApiProperty({
    description:
      'Danh sách action khi chạy scene (Gladys/Home Assistant style)',
    type: [SceneActionItemDto],
    example: [
      { deviceToken: 'device-abc', entityCode: 'channel_1', value: 1 },
      { deviceToken: 'device-abc', entityCode: 'channel_2', value: 80 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneActionItemDto)
  actions: SceneActionItemDto[];
}
