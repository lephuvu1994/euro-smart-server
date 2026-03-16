import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
    @ApiProperty({
        description: 'Email hoặc Số điện thoại',
        example: 'user@example.com',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    identifier: string;

    @ApiProperty({
        description: 'Reset token nhận được sau khi verify OTP',
        example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    resetToken: string;

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
