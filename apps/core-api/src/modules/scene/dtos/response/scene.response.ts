import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SceneTriggerType } from '@app/common';
import { LocationTriggerEvent } from '../request/scene-trigger.dto';

export class SceneActionResponseDto {
    @ApiProperty()
    deviceToken: string;

    @ApiProperty()
    featureCode: string;

    @ApiProperty()
    value: any;
}

/** Một trigger trong response (SCHEDULE | LOCATION | DEVICE_STATE). Executor chưa implement. */
export class SceneTriggerResponseDto {
    @ApiProperty({ enum: SceneTriggerType })
    type: SceneTriggerType;

    @ApiPropertyOptional()
    scheduleConfig?: {
        cron?: string;
        hour?: number;
        minute?: number;
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
            featureCode: string;
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

    @ApiProperty({
        description:
            'Triggers: rỗng = scene chỉ chạy tay; có phần tử = automation (tự chạy theo trigger – chưa implement)',
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
