import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ForgotPasswordDto {
    @ApiProperty({
        description: 'Email hoặc Số điện thoại',
        example: 'user@example.com',
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    identifier: string;
}
