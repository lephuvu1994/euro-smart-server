import { ApiProperty } from '@nestjs/swagger';

export class DashboardStatsResponseDto {
  @ApiProperty({ example: 120 })
  totalPartners: number;

  @ApiProperty({ example: 4500 })
  totalDevices: number;

  @ApiProperty({ example: 15 })
  totalDeviceModels: number;

  @ApiProperty({ example: 8500 })
  activeQuotas: number;
}
