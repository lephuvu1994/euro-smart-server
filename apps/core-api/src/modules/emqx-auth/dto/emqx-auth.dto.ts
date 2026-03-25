import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmqxAuthDto {
  @ApiProperty({ description: 'MQTT username', example: 'user_abc123' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: 'MQTT password (HMAC or plain)' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({
    description: 'MQTT client ID',
    example: 'app_abc123_1711411200000',
  })
  @IsString()
  @IsNotEmpty()
  clientid: string;
}
