import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateSystemConfigDto {
    @ApiPropertyOptional({ example: 'tcp://broker.hivemq.com:1883' })
    @IsString()
    @IsOptional()
    mqttHost?: string;

    @ApiPropertyOptional({ example: 'admin_user' })
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
