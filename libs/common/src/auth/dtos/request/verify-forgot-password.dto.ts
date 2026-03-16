import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class VerifyForgotPasswordDto {
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
        example: '123456',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    otp: string;

    @ApiProperty({
        description: 'Mật khẩu mới',
        example: 'NewPass@123',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @MinLength(8)
    newPassword: string;
}
