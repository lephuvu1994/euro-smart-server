import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class UserLoginDto {
    @ApiProperty({
        description: 'Email hoặc Số điện thoại',
        example: 'user@example.com', // Hoặc '0912345678'
        required: true,
    })
    // QUAN TRỌNG:
    // 1. Đổi tên từ 'email' -> 'identifier'
    // 2. Bỏ @IsEmail() vì nếu nhập SĐT sẽ bị lỗi validation
    @IsString()
    @IsNotEmpty({ message: 'Vui lòng nhập Email hoặc Số điện thoại' })
    public identifier: string;

    @ApiProperty({
        example: 'Password@123', // Static example cho gọn
        required: true,
    })
    @IsString()
    @IsNotEmpty()
    @Matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
        {
            message:
                'Mật khẩu quá yếu (cần chữ hoa, thường, số và ký tự đặc biệt)',
        }
    )
    public password: string;
}
