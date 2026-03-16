import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SceneActionItemDto } from './create-scene.dto';
import { SceneTriggerItemDto } from './scene-trigger.dto';

export class UpdateSceneDto {
  @ApiProperty({ example: 'Tối về nhà', required: false })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Triggers: SCHEDULE, LOCATION, DEVICE_STATE. Rỗng = chỉ chạy tay (manual).',
    type: [SceneTriggerItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneTriggerItemDto)
  triggers?: SceneTriggerItemDto[];

  @ApiProperty({
    required: false,
    type: [SceneActionItemDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SceneActionItemDto)
  actions?: SceneActionItemDto[];
}
