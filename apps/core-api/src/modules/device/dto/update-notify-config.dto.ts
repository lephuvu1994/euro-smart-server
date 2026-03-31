import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdateNotifyConfigDto {
  @ApiProperty({
    description: 'Object chứa cấu hình nhận thông báo (VD: { offline: true, open: false })',
    example: { offline: true, open: true },
    required: true,
  })
  @IsObject()
  notify!: Record<string, boolean>;
}
