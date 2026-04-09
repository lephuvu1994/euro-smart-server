import { ApiProperty } from '@nestjs/swagger';

export class SystemConfigResponseDto {
  @ApiProperty({ example: 'mqtts://broker.example.com:8883' })
  mqttHost: string;



  @ApiProperty({ example: 5, description: 'OTP expiration time in minutes' })
  otpExpire: number;
}
