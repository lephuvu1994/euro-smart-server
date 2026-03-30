import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdatePushTokenDto {
  @ApiProperty({
    description: 'Expo Push Token để nhận thông báo. Gửi null để gỡ token hợp lệ.',
    required: false,
    nullable: true,
  })
  @IsString()
  @IsOptional()
  pushToken!: string | null;
}
