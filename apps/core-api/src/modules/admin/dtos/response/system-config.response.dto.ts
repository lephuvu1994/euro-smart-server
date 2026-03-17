import { ApiProperty } from '@nestjs/swagger';

export class SystemConfigResponseDto {
  @ApiProperty({ example: 'mqtts://broker.example.com:8883' })
  mqttHost: string;

  @ApiProperty({ example: 'admin_mqtt' })
  mqttUser: string;

  @ApiProperty({ example: 'secret_password' })
  mqttPass: string;

  @ApiProperty({ example: 5, description: 'OTP expiration time in minutes' })
  otpExpire: number;
}
