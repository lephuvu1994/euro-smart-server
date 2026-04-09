import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class EmqxAclDto {
  @ApiProperty({ description: 'MQTT username', example: 'user_abc123' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiProperty({
    description: 'MQTT topic',
    example: 'COMPANY/MODEL/device-token/state',
  })
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiProperty({
    description: 'MQTT action',
    example: 'subscribe',
    enum: ['publish', 'subscribe', 'PUBLISH', 'SUBSCRIBE', 'PUBLISH(Q0)', 'SUBSCRIBE(Q0)', 'PUBLISH(Q1)', 'SUBSCRIBE(Q1)', 'PUBLISH(Q2)', 'SUBSCRIBE(Q2)'],
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({
    description: 'MQTT client ID (sent by EMQX webhook)',
    required: false,
  })
  @IsOptional()
  @IsString()
  clientid?: string;
}
