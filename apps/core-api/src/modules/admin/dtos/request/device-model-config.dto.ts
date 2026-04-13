import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EntityDomain, AttributeValueType } from '@prisma/client';

import type {
  IBlueprintAttribute,
  IBlueprintEntity,
  IDeviceModelConfig,
} from '../../../device/interfaces/device-model-config.interface';

// ─── Attribute DTO ───────────────────

export class BlueprintAttributeDto implements IBlueprintAttribute {
  @ApiProperty({ description: 'Mã thuộc tính', example: 'brightness' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ description: 'Tên hiển thị', example: 'Độ sáng' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Loại giá trị (dựa theo AttributeValueType)',
    example: 'NUMBER',
    enum: AttributeValueType,
  })
  @IsEnum(AttributeValueType)
  valueType: AttributeValueType;

  @ApiProperty({ description: 'Giá trị min', required: false })
  @IsNumber()
  @IsOptional()
  min?: number;

  @ApiProperty({ description: 'Giá trị max', required: false })
  @IsNumber()
  @IsOptional()
  max?: number;

  @ApiProperty({ description: 'Đơn vị', example: '%', required: false })
  @IsString()
  @IsOptional()
  unit?: string;

  @ApiProperty({ description: 'Thuộc tính chỉ đọc', required: false })
  @IsBoolean()
  @IsOptional()
  readOnly?: boolean;

  @ApiProperty({ description: 'Danh sách giá trị enum', required: false, type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enumValues?: string[];

  @ApiProperty({ description: 'MQTT command key', required: false })
  @IsString()
  @IsOptional()
  commandKey?: string;

  @ApiProperty({ description: 'Cấu hình mở rộng', required: false })
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  // Cho phép các trường không xác định
  [key: string]: unknown;
}

// ─── Entity DTO ───────────────────

export class BlueprintEntityDto implements IBlueprintEntity {
  @ApiProperty({ description: 'Mã entity', example: 'main' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Tên hiển thị', example: 'Đèn chính' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Entity domain',
    example: 'light',
    enum: EntityDomain,
  })
  @IsEnum(EntityDomain)
  domain: EntityDomain;

  @ApiProperty({ description: 'MQTT command key', required: false })
  @IsString()
  @IsOptional()
  commandKey?: string;

  @ApiProperty({ description: 'MQTT command suffix', required: false })
  @IsString()
  @IsOptional()
  commandSuffix?: string;

  @ApiProperty({ description: 'Entity chỉ đọc', required: false })
  @IsBoolean()
  @IsOptional()
  readOnly?: boolean;

  @ApiProperty({ description: 'Thứ tự hiển thị', required: false })
  @IsNumber()
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({
    description: 'Danh sách thuộc tính (Attributes)',
    type: [BlueprintAttributeDto],
    required: false,
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlueprintAttributeDto)
  @IsOptional()
  attributes?: BlueprintAttributeDto[];

  // Cho phép các trường không xác định
  [key: string]: unknown;
}

// ─── Config DTO (Top-Level) ─────────────────────────

export class DeviceModelConfigDto implements IDeviceModelConfig {
  @ApiProperty({ description: 'Mã model logic (khác với code DB)', required: false })
  @IsString()
  @IsOptional()
  modelCode?: string;

  @ApiProperty({ description: 'Tên model logic', required: false })
  @IsString()
  @IsOptional()
  modelName?: string;

  @ApiProperty({ description: 'Giao thức giao tiếp (Vd: MQTT)', required: false })
  @IsString()
  @IsOptional()
  protocol?: string;

  @ApiProperty({
    description: 'Danh sách entities của Device Model',
    type: [BlueprintEntityDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BlueprintEntityDto)
  entities: BlueprintEntityDto[];

  // Cho phép extension
  [key: string]: unknown;
}
