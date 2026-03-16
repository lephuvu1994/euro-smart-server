import { ApiProperty } from '@nestjs/swagger';
import {
    IsOptional,
    IsNumber,
    IsString,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateHomeDto {
    @ApiProperty({ example: 'Nhà của tôi', description: 'Tên nhà' })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name: string;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    latitude?: number;

    @ApiProperty({ required: false })
    @IsOptional()
    @IsNumber()
    longitude?: number;

    @ApiProperty({ required: false, default: 100 })
    @IsOptional()
    @IsNumber()
    radius?: number;
}
