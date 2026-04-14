import { ApiProperty } from '@nestjs/swagger';

export class HardwareResponseDto {
  @ApiProperty({ example: 'b553ee3f-a7f2-47f2-b8d3-4cb9d8d5d9ad' })
  id: string;

  @ApiProperty({ example: 'MAC-AABBCCDDEEFF' })
  identifier: string;

  @ApiProperty({ example: 'device-token-123' })
  deviceToken: string;

  @ApiProperty({ example: 'WIFI_SWITCH_4' })
  deviceModelCode: string;

  @ApiProperty({ example: 'COMPANY_A' })
  partnerCode: string;

  @ApiProperty({ example: '1.0.0', required: false, nullable: true })
  firmwareVer: string | null;

  @ApiProperty({ example: false })
  isBanned: boolean;

  @ApiProperty({ example: '2023-10-15T12:00:00Z', required: false, nullable: true })
  activatedAt: Date | null;
}
