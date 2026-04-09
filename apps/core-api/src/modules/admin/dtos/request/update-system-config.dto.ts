import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiPropertyOptional({ example: 'mqtts://broker.example.com:8883' })
  @IsString()
  @IsOptional()
  mqttHost?: string;



  @ApiPropertyOptional({
    example: 5,
    description: 'OTP expiration time in minutes',
  })
  @IsNumber()
  @IsOptional()
  otpExpire?: number;

  @ApiPropertyOptional({ example: 'wss://aurathink.ddns.net/mqtt' })
  @IsString()
  @IsOptional()
  mqttWssUrl?: string;
}
