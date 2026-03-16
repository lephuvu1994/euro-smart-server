import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class VerifyOtpDto {
    @ApiProperty({
        description: 'Email hoặc Số điện thoại',
        example: 'user@example.com',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    identifier: string;

    @ApiProperty({
        description: 'Mã OTP nhận được',
        example: '1234',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    otp: string;
}
