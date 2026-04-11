import { ApiPropertyOptional } from '@nestjs/swagger';
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
import { SceneActionItemDto } from './create-scene.dto';
import { SceneTriggerItemDto } from './scene-trigger.dto';

export class UpdateSceneDto {
  @ApiPropertyOptional({ example: 'Tối về nhà' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Khoảng cách tối thiểu (giây) giữa 2 lần chạy. Mặc định = 60s. Tối thiểu 10s.',
    example: 60,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  minIntervalSeconds?: number;

  @ApiPropertyOptional({
    description: 'Icon name từ MaterialCommunityIcons (vd: "home-outline")',
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

  @ApiPropertyOptional({ description: 'ID phòng (null để xóa gán phòng)' })
  @IsOptional()
  @IsUUID()
  roomId?: string | null;

  @ApiPropertyOptional({
    description: 'Triggers: SCHEDULE, LOCATION, DEVICE_STATE. Rỗng = chỉ chạy tay (manual).',
    type: [SceneTriggerItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneTriggerItemDto)
  triggers?: SceneTriggerItemDto[];

  @ApiPropertyOptional({
    type: [SceneActionItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneActionItemDto)
  actions?: SceneActionItemDto[];
}
