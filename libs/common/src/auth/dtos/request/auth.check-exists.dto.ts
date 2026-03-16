import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CheckExistsDto {
  @ApiProperty({
    description: 'Email hoặc Số điện thoại cần kiểm tra',
    example: 'user@example.com',
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Vui lòng nhập Email hoặc Số điện thoại' })
  public identifier: string;
}
