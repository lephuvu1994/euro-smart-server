import { IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmqxAclDto {
  @ApiProperty({ description: 'MQTT username', example: 'user_abc123' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({
    description: 'MQTT topic',
    example: 'COMPANY/MODEL/device-token/state',
  })
  @IsString()
  @IsNotEmpty()
  topic: string;

  @ApiProperty({
    description: 'MQTT action',
    example: 'subscribe',
    enum: ['publish', 'subscribe'],
  })
  @IsString()
  @IsIn(['publish', 'subscribe'])
  action: 'publish' | 'subscribe';

  @ApiProperty({
    description: 'MQTT client ID (sent by EMQX webhook)',
    required: false,
  })
  @IsString()
  clientid?: string;
}
