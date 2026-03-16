import { ApiProperty } from '@nestjs/swagger';
import {
    IsOptional,
    IsString,
    IsUUID,
    MaxLength,
    MinLength,
} from 'class-validator';

export class CreateRoomDto {
    @ApiProperty({ example: 'Phòng khách', description: 'Tên phòng' })
    @IsString()
    @MinLength(1)
    @MaxLength(100)
    name: string;

    @ApiProperty({
        required: false,
        description: 'ID tầng (nếu tạo phòng trong tầng)',
    })
    @IsOptional()
    @IsUUID()
    floorId?: string;
}
