import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class SetMqttConfigDto {
    @ApiProperty({ example: 'tcp://broker.hivemq.com:1883' })
    @IsString()
    @IsNotEmpty()
    host: string;

    @ApiProperty({ example: 'admin_user' })
    @IsString()
    @IsNotEmpty()
    user: string;

    @ApiProperty({ example: 'secret_password' })
    @IsString()
    @IsNotEmpty()
    pass: string;
}
