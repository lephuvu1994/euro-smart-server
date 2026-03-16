import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDeviceModelDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    code: string;

    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ required: false })
    @IsString()
    @IsOptional()
    description?: string;

    // --- BẠN ĐANG THIẾU ĐOẠN NÀY ---
    @ApiProperty({
        description: 'Cấu hình tính năng JSON (Blueprint)',
        example: [{ code: 'sw1', name: 'Switch 1', type: 'BINARY' }],
    })
    @IsArray() // Bắt buộc phải là mảng
    @IsOptional() // Có thể để trống nếu muốn
    featuresConfig?: any[];
}
