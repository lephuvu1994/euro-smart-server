import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetMqttConfigDto {
  @ApiProperty({ example: 'mqtts://broker.example.com:8883' })
  @IsString()
  @IsNotEmpty()
  host: string;

  @ApiProperty({ example: 'admin_mqtt' })
  @IsString()
  @IsNotEmpty()
  user: string;

  @ApiProperty({ example: 'secret_password' })
  @IsString()
  @IsNotEmpty()
  pass: string;
}
