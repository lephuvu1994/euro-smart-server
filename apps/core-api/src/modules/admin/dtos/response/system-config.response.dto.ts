import { ApiProperty } from '@nestjs/swagger';

export class SystemConfigResponseDto {
    @ApiProperty({ example: 'tcp://broker.hivemq.com:1883' })
    mqttHost: string;

    @ApiProperty({ example: 'admin_user' })
    mqttUser: string;

    @ApiProperty({ example: 'secret_password' })
    mqttPass: string;

    @ApiProperty({ example: 5, description: 'OTP expiration time in minutes' })
    otpExpire: number;
}
