import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDeviceDto {
  @ApiProperty({ example: 'Phòng khách - Rèm chính' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;
}
