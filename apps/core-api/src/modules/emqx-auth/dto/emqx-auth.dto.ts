import { IsString, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmqxAuthDto {
  @ApiProperty({ description: 'MQTT username', example: 'user_abc123' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({ description: 'MQTT password (HMAC or plain)' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({
    description: 'MQTT client ID',
    example: 'app_abc123_1711411200000',
  })
  @IsOptional()
  @IsString()
  clientid?: string;
}
