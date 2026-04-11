import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SceneTriggerType } from '@app/common';
import { LocationTriggerEvent } from '../request/scene-trigger.dto';

export class SceneActionResponseDto {
  @ApiProperty()
  deviceToken: string;

  @ApiProperty()
  entityCode: string;

  @ApiProperty()
  value: any;

  @ApiPropertyOptional({ description: 'Độ trễ (ms) trước khi thực thi action này', example: 5000 })
  delayMs?: number;
}

/** Một trigger trong response (SCHEDULE | LOCATION | DEVICE_STATE). */
export class SceneTriggerResponseDto {
  @ApiProperty({ enum: SceneTriggerType })
  type: SceneTriggerType;

  @ApiPropertyOptional()
  scheduleConfig?: {
    cron?: string;
    hour?: number;
    minute?: number;
    daysOfWeek?: number[];
    timezone?: string;
  };

  @ApiPropertyOptional()
  locationConfig?: {
    event: LocationTriggerEvent;
    zoneId?: string;
    latitude?: number;
    longitude?: number;
    radius?: number;
    userId?: string;
  };

  @ApiPropertyOptional()
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
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  active: boolean;

  @ApiPropertyOptional({ description: 'Icon name từ MaterialCommunityIcons', example: 'home-outline' })
  icon?: string | null;

  @ApiPropertyOptional({ description: 'Hex color cho card nền', example: '#ECFDF5' })
  color?: string | null;

  @ApiPropertyOptional({ description: 'ID phòng gán cho scene' })
  roomId?: string | null;

  @ApiProperty({
    description: 'Triggers: rỗng = chỉ chạy tay; có phần tử = automation (tự chạy theo trigger)',
    type: [SceneTriggerResponseDto],
    example: [],
  })
  triggers: SceneTriggerResponseDto[];

  @ApiProperty({
    description: 'Actions khi chạy scene',
    type: [SceneActionResponseDto],
  })
  actions: SceneActionResponseDto[];

  @ApiProperty()
  homeId: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
