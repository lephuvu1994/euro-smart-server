import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
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

  @ApiPropertyOptional({
    description: 'Độ trễ (ms) trước khi thực thi action này. Hỗ trợ "đóng rèm → chờ 5s → tắt đèn".',
    example: 5000,
    default: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  delayMs?: number;
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

  @ApiPropertyOptional({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description:
      'Khoảng cách tối thiểu (giây) giữa 2 lần chạy scene. Bảo vệ chống loop: nếu trigger kích liên tục, scene sẽ được throttle theo khoảng này. Mặc định = 60s.',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  minIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Icon name từ MaterialCommunityIcons (vd: "home-outline", "weather-night")',
    example: 'home-outline',
  })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({
    description: 'Hex color cho card nền (vd: "#ECFDF5")',
    example: '#ECFDF5',
  })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ description: 'ID phòng để filter scene theo phòng (optional)' })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({
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
      { deviceToken: 'device-abc', entityCode: 'channel_2', value: 80, delayMs: 5000 },
    ],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneActionItemDto)
  actions: SceneActionItemDto[];
}
