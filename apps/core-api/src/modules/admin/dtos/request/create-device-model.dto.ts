import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { DeviceModelConfigDto } from './device-model-config.dto';

export class CreateDeviceModelDto {
  @ApiProperty({ example: '1001', description: 'Mã model duy nhất' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Công tắc WiFi 4 nút Pro' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false, example: 'Mô tả ngắn về model' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description:
      'Cấu hình Blueprint JSON. Bắt buộc có key "entities", cho phép mở rộng thêm field.',
    type: () => DeviceModelConfigDto,
    required: false,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceModelConfigDto)
  config?: DeviceModelConfigDto;
}
