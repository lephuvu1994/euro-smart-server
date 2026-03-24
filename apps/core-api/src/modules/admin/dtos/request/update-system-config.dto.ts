import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateSystemConfigDto {
  @ApiPropertyOptional({ example: 'mqtts://broker.example.com:8883' })
  @IsString()
  @IsOptional()
  mqttHost?: string;

  @ApiPropertyOptional({ example: 'admin_mqtt' })
  @IsString()
  @IsOptional()
  mqttUser?: string;

  @ApiPropertyOptional({ example: 'secret_password' })
  @IsString()
  @IsOptional()
  mqttPass?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'OTP expiration time in minutes',
  })
  @IsNumber()
  @IsOptional()
  otpExpire?: number;
}
