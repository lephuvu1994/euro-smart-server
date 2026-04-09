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
    enum: ['publish', 'subscribe', 'PUBLISH', 'SUBSCRIBE', 'PUBLISH(Q0)', 'SUBSCRIBE(Q0)', 'PUBLISH(Q1)', 'SUBSCRIBE(Q1)', 'PUBLISH(Q2)', 'SUBSCRIBE(Q2)'],
  })
  @IsString()
  action: string;

  @ApiProperty({
    description: 'MQTT client ID (sent by EMQX webhook)',
    required: false,
  })
  @IsString()
  clientid?: string;
}
