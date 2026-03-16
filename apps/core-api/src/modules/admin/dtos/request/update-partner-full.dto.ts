import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export class PartnerQuotaItemDto {
    @ApiProperty({ example: 'WIFI_SWITCH_4' })
    @IsString()
    deviceModelCode: string;

    @ApiProperty({ example: 100 })
    @IsInt()
    @Min(0)
    quantity: number;

    @ApiProperty({ example: 90, required: false, description: 'Số ngày license (default 90)' })
    @IsOptional()
    @IsInt()
    @Min(1)
    licenseDays?: number;
}

export class UpdatePartnerDto {
    // 1. Cho phép không gửi name (nếu chỉ muốn sửa quota)
    @ApiProperty({ example: 'Tên Công ty Mới', required: false })
    @IsOptional()
    @IsString()
    name?: string;

    // 2. Cho phép không gửi quotas (nếu chỉ muốn sửa name)
    @ApiProperty({ type: [PartnerQuotaItemDto], required: false })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => PartnerQuotaItemDto)
    quotas?: PartnerQuotaItemDto[];
}
