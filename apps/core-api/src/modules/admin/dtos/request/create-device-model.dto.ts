import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
    description: 'Cấu hình tính năng JSON (Blueprint)',
    example: [{ code: 'sw1', name: 'Switch 1', type: 'BINARY' }],
    required: false,
  })
  @IsArray()
  @IsOptional()
  config?: any[];
}
