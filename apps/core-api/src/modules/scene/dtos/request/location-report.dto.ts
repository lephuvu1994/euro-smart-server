import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';

export class LocationReportDto {
    @ApiProperty({ example: 21.0285, description: 'Vĩ độ' })
    @IsNumber()
    @Min(-90)
    @Max(90)
    latitude: number;

    @ApiProperty({ example: 105.8542, description: 'Kinh độ' })
    @IsNumber()
    @Min(-180)
    @Max(180)
    longitude: number;
}
