import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { SceneTriggerType } from '@app/common';
import { LocationTriggerEvent } from '../request/scene-trigger.dto';

export class SceneActionResponseDto {
  @ApiProperty()
  @Expose()
  deviceToken: string;

  @ApiProperty()
  @Expose()
  entityCode: string;

  @ApiProperty()
  @Expose()
  value: any;

  @ApiPropertyOptional({
    description: 'Độ trễ (ms) trước khi thực thi action này',
    example: 5000,
  })
  @Expose()
  delayMs?: number;
}

/** Một trigger trong response (SCHEDULE | LOCATION | DEVICE_STATE). */
export class SceneTriggerResponseDto {
  @ApiProperty({ enum: SceneTriggerType })
  @Expose()
  type: SceneTriggerType;

  @ApiPropertyOptional()
  @Expose()
  scheduleConfig?: {
    cron?: string;
    hour?: number;
    minute?: number;
    daysOfWeek?: number[];
    timezone?: string;
  };

  @ApiPropertyOptional()
  @Expose()
  locationConfig?: {
    event: LocationTriggerEvent;
    zoneId?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    userId?: string;
  };

  @ApiPropertyOptional()
  @Expose()
  deviceStateConfig?: {
    conditionLogic: 'and' | 'or';
    conditions: Array<{
      deviceToken: string;
      entityCode: string;
      attributeKey?: string;
      value?: any;
      operator?: string;
    }>;
  };
}

export class SceneResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  name: string;

  @ApiProperty()
  @Expose()
  active: boolean;

  @ApiProperty({ description: 'Thứ tự sắp xếp', example: 0 })
  @Expose()
  sortOrder: number;

  @ApiPropertyOptional({
    description: 'Khoảng cách tối thiểu (giây) giữa 2 lần chạy scene',
    example: 60,
  })
  @Expose()
  minIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Icon name từ MaterialCommunityIcons',
    example: 'home-outline',
  })
  @Expose()
  icon?: string | null;

  @ApiPropertyOptional({
    description: 'Hex color cho card nền',
    example: '#ECFDF5',
  })
  @Expose()
  color?: string | null;

  @ApiPropertyOptional({ description: 'ID phòng gán cho scene' })
  @Expose()
  roomId?: string | null;

  @ApiProperty({
    description:
      'Triggers: rỗng = chỉ chạy tay; có phần tử = automation (tự chạy theo trigger)',
    type: [SceneTriggerResponseDto],
    example: [],
  })
  @Expose()
  @Type(() => SceneTriggerResponseDto)
  triggers: SceneTriggerResponseDto[];

  @ApiProperty({
    description: 'Actions khi chạy scene',
    type: [SceneActionResponseDto],
  })
  @Expose()
  @Type(() => SceneActionResponseDto)
  actions: SceneActionResponseDto[];

  @ApiProperty()
  @Expose()
  homeId: string;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;
}
