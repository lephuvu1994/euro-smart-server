import { ApiProperty } from '@nestjs/swagger';

export class QuotaUsageDto {
    @ApiProperty({ example: 'WIFI_SWITCH_4' })
    modelCode: string;

    @ApiProperty({ example: 'Công tắc Wifi 4 nút' })
    modelName: string;

    @ApiProperty({ example: 50, description: 'Số lượng đã kích hoạt (Used)' })
    used: number;

    @ApiProperty({
        example: 100,
        description: 'Tổng số lượng cấp phép (Total)',
    })
    total: number;
}

export class PartnerUsageResponseDto {
    @ApiProperty({ example: 'COMPANY_A' })
    companyCode: string;

    @ApiProperty({ example: 'Công ty Smarthome A' })
    companyName: string;

    @ApiProperty({ type: [QuotaUsageDto] })
    quotas: QuotaUsageDto[];
}
