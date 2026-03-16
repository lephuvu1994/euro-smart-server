import { ApiProperty } from '@nestjs/swagger';
import {
    IsEmail,
    IsOptional,
    IsString,
    IsUUID,
    ValidateIf,
} from 'class-validator';

export class AddMemberDto {
    @ApiProperty({
        description: 'ID user cần thêm vào nhà (dùng userId hoặc email)',
        required: false,
    })
    @ValidateIf(o => !o.email)
    @IsUUID()
    @IsOptional()
    userId?: string;

    @ApiProperty({
        description: 'Email user cần mời vào nhà (dùng userId hoặc email)',
        required: false,
    })
    @ValidateIf(o => !o.userId)
    @IsEmail()
    @IsOptional()
    email?: string;

    @ApiProperty({ example: 'MEMBER', required: false, default: 'MEMBER' })
    @IsOptional()
    @IsString()
    role?: string;
}
