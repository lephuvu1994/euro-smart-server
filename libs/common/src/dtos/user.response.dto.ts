import { faker } from '@faker-js/faker';
import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { $Enums } from '@prisma/client';
import { Exclude, Expose, Type } from 'class-transformer';
import {
    IsDate,
    IsEmail,
    IsEnum,
    IsOptional,
    IsString,
    IsUUID,
    IsNumber,
    ValidateNested,
} from 'class-validator';
import { HomeResponseDto } from './home.response.dto';

export class UserResponseDto {
    @ApiProperty({
        example: faker.string.uuid(),
    })
    @Expose()
    @IsUUID()
    id: string;

    // --- THÔNG TIN LIÊN HỆ (Email hoặc Phone) ---
    @ApiProperty({
        description: 'Email (có thể null nếu đăng ký bằng SĐT)',
        example: faker.internet.email(),
        required: false,
        nullable: true,
    })
    @Expose() // Nếu tên trường DB trùng tên DTO thì không cần { name: ... }
    @IsEmail()
    @IsOptional()
    email: string | null;

    @ApiProperty({
        description: 'Số điện thoại (có thể null nếu đăng ký bằng Email)',
        example: '+84909090909',
        required: false,
        nullable: true,
    })
    @Expose()
    @IsString()
    @IsOptional()
    phone: string | null;

    // --- HỌ TÊN (Map từ snake_case DB sang camelCase DTO) ---
    @ApiProperty({
        example: faker.person.firstName(),
        required: false,
        nullable: true,
    })
    @Expose({ name: 'firstName' }) // <--- QUAN TRỌNG: Lấy dữ liệu từ cột 'firstname'
    @IsString()
    @IsOptional()
    firstName: string | null;

    @ApiProperty({
        example: faker.person.lastName(),
        required: false,
        nullable: true,
    })
    @Expose({ name: 'lastName' }) // <--- QUAN TRỌNG: Lấy dữ liệu từ cột 'lastname'
    @IsString()
    @IsOptional()
    lastName: string | null;

    // --- THÔNG TIN KHÁC ---
    @ApiProperty({
        example: 'https://example.com/avatar.jpg',
        required: false,
        nullable: true,
    })
    @Expose()
    @IsString()
    @IsOptional()
    avatar: string | null;

    @ApiProperty({
        description: 'Username (từ email hoặc phone, dùng trong auth response)',
        example: 'johndoe',
        required: false,
        nullable: true,
    })
    @Expose()
    @IsString()
    @IsOptional()
    userName?: string | null;

    @ApiProperty({
        enum: $Enums.UserRole,
        example: $Enums.UserRole.USER,
    })
    @Expose()
    @IsEnum($Enums.UserRole)
    role: $Enums.UserRole;

    @ApiProperty({
        description: 'Trạng thái xác thực',
        example: true,
    })

    // --- LOCATION (Vị trí cache mới nhất) ---
    @ApiProperty({ description: 'Vĩ độ', required: false, example: 21.0285 })
    @Expose({ name: 'lastLatitude' })
    @IsNumber()
    @IsOptional()
    lastLatitude?: number;

    @ApiProperty({ description: 'Kinh độ', required: false, example: 105.8542 })
    @Expose({ name: 'lastLongitude' })
    @IsNumber()
    @IsOptional()
    lastLongitude?: number;

    @ApiProperty({ description: 'Thời gian cập nhật vị trí', required: false })
    @Expose({ name: 'lastLocationChanged' })
    @IsDate()
    @IsOptional()
    lastLocationChanged?: Date;

    // --- TIMESTAMPS (Map từ snake_case) ---
    @ApiProperty({
        example: faker.date.past().toISOString(),
    })
    @Expose({ name: 'createdAt' }) // Map từ 'created_at'
    @IsDate()
    createdAt: Date;

    @ApiProperty({
        example: new Date().toISOString(),
    })
    @Expose({ name: 'updatedAt' }) // Map từ 'updated_at'
    @IsDate()
    updatedAt: Date;

    // --- BẢO MẬT (Luôn ẩn Password) ---
    @ApiHideProperty()
    @Exclude()
    password?: string;
}

export class UserGetProfileResponseDto extends UserResponseDto {
    @ApiProperty({
        description: 'Danh sách các Home mà user sở hữu hoặc là thành viên',
        type: [HomeResponseDto],
    })
    @Expose()
    @Type(() => HomeResponseDto)
    @ValidateNested({ each: true })
    homes: HomeResponseDto[];
}

export class UserUpdateProfileResponseDto extends UserResponseDto {}
