import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
    IsEnum,
    IsOptional,
    IsString,
    IsNumber,
    Min,
    Max,
    ValidateNested,
    IsArray,
    IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Trigger types (Gladys / Home Assistant style):
 * - SCHEDULE: theo lịch (cron / at time) – scheduler sẽ xử lý sau
 * - LOCATION: theo vị trí user (vào/ra zone) – geofence listener sẽ xử lý sau
 * - DEVICE_STATE: theo trạng thái/cảm biến (1 hoặc nhiều thiết bị, AND/OR) – device event sẽ xử lý sau
 *
 * Scene: manual (triggers rỗng) hoặc automation (có trigger; executor chưa implement).
 */
export enum SceneTriggerType {
    SCHEDULE = 'SCHEDULE',
    LOCATION = 'LOCATION',
    DEVICE_STATE = 'DEVICE_STATE',
}

/** Logic gộp nhiều điều kiện thiết bị (thứ tự trong mảng được giữ, evaluate theo thứ tự) */
export type ConditionLogic = 'and' | 'or';

// ---------------------------------------------------------------------------
// SCHEDULE – Lập lịch theo giờ (cron hoặc at time)
// ---------------------------------------------------------------------------

export class ScheduleTriggerConfigDto {
    @ApiPropertyOptional({
        description: 'Cron expression (vd: 0 18 * * * = 18h mỗi ngày)',
        example: '0 18 * * *',
    })
    @IsOptional()
    @IsString()
    cron?: string;

    @ApiPropertyOptional({
        description: 'Giờ (0-23), dùng khi không dùng cron',
        example: 18,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(23)
    hour?: number;

    @ApiPropertyOptional({ description: 'Phút (0-59)', example: 0 })
    @IsOptional()
    @IsNumber()
    @Min(0)
    @Max(59)
    minute?: number;

    @ApiPropertyOptional({
        description: 'Timezone (vd: Asia/Ho_Chi_Minh)',
        example: 'Asia/Ho_Chi_Minh',
    })
    @IsOptional()
    @IsString()
    timezone?: string;
}

// ---------------------------------------------------------------------------
// LOCATION – Kích hoạt khi user vào/ra zone (geofence)
// ---------------------------------------------------------------------------

export enum LocationTriggerEvent {
    ENTER = 'enter',
    LEAVE = 'leave',
}

export class LocationTriggerConfigDto {
    @ApiProperty({
        description: 'Sự kiện: vào zone hay ra khỏi zone',
        enum: LocationTriggerEvent,
    })
    @IsEnum(LocationTriggerEvent)
    event: LocationTriggerEvent;

    @ApiPropertyOptional({
        description:
            'ID zone (nếu dùng zone đã lưu; tham chiếu Home hoặc bảng Zone)',
    })
    @IsOptional()
    @IsString()
    zoneId?: string;

    @ApiPropertyOptional({
        description: 'Vĩ độ (dùng khi không có zoneId – geofence tọa độ)',
    })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiPropertyOptional({ description: 'Kinh độ' })
    @IsOptional()
    @IsNumber()
    longitude?: number;

    @ApiPropertyOptional({
        description: 'Bán kính (mét), dùng với latitude/longitude',
        example: 100,
    })
    @IsOptional()
    @IsNumber()
    @Min(0)
    radius?: number;

    @ApiPropertyOptional({
        description:
            'User cần theo dõi (để trống = user đang thực thi / context)',
    })
    @IsOptional()
    @IsString()
    userId?: string;
}

// ---------------------------------------------------------------------------
// DEVICE_STATE – Cảm biến / trạng thái thiết bị (mảng điều kiện, AND/OR)
// ---------------------------------------------------------------------------

/** Một điều kiện: 1 thiết bị + 1 feature (giá trị cảm biến hoặc state), so sánh theo operator */
export class SceneDeviceConditionDto {
    @ApiProperty({ description: 'Token thiết bị' })
    @IsString()
    deviceToken: string;

    @ApiProperty({ description: 'Mã feature (vd: sw1, motion, temperature)' })
    @IsString()
    featureCode: string;

    @ApiPropertyOptional({
        description:
            'Giá trị so sánh (số, boolean, string). Với cảm biến số dùng cùng operator (above/below).',
        example: 1,
    })
    @IsOptional()
    value?: any;

    @ApiPropertyOptional({
        description: 'eq, ne, gt, gte, lt, lte (mặc định eq)',
        default: 'eq',
    })
    @IsOptional()
    @IsString()
    @IsIn(['eq', 'ne', 'gt', 'gte', 'lt', 'lte'])
    operator?: string;
}

/**
 * Trigger theo trạng thái thiết bị / cảm biến.
 * Nhiều điều kiện trong mảng, kết hợp theo conditionLogic (and/or), đánh giá theo thứ tự (short-circuit).
 * Ví dụ: (cảm biến chuyển động = 1) AND (nhiệt độ > 30) AND (công tắc A = bật).
 */
export class DeviceStateTriggerConfigDto {
    @ApiProperty({
        description:
            'Kết hợp nhiều điều kiện: and = tất cả thỏa; or = ít nhất một thỏa',
        enum: ['and', 'or'],
    })
    @IsIn(['and', 'or'])
    conditionLogic: ConditionLogic;

    @ApiProperty({
        description: 'Mảng điều kiện (thứ tự giữ nguyên khi evaluate)',
        type: [SceneDeviceConditionDto],
    })
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SceneDeviceConditionDto)
    conditions: SceneDeviceConditionDto[];
}

// ---------------------------------------------------------------------------
// Trigger item (một phần tử trong triggers[])
// ---------------------------------------------------------------------------

export class SceneTriggerItemDto {
    @ApiProperty({ enum: SceneTriggerType, description: 'Loại trigger' })
    @IsEnum(SceneTriggerType)
    type: SceneTriggerType;

    @ApiPropertyOptional({
        description: 'Khi type = SCHEDULE',
        type: ScheduleTriggerConfigDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => ScheduleTriggerConfigDto)
    scheduleConfig?: ScheduleTriggerConfigDto;

    @ApiPropertyOptional({
        description: 'Khi type = LOCATION (vào/ra zone)',
        type: LocationTriggerConfigDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => LocationTriggerConfigDto)
    locationConfig?: LocationTriggerConfigDto;

    @ApiPropertyOptional({
        description: 'Khi type = DEVICE_STATE (mảng điều kiện + and/or)',
        type: DeviceStateTriggerConfigDto,
    })
    @IsOptional()
    @ValidateNested()
    @Type(() => DeviceStateTriggerConfigDto)
    deviceStateConfig?: DeviceStateTriggerConfigDto;
}
