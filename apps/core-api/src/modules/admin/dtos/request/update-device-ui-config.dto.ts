import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class DeviceUiConfigItemDto {
  @ApiProperty({ example: 'light', description: 'Device type key (DeviceModel.code or DeviceFeatureCategory)' })
  @IsString()
  deviceType: string;

  @ApiProperty({ example: true, description: 'Whether this device type shows a toggle button' })
  @IsBoolean()
  hasToggle: boolean;

  @ApiProperty({ example: '#A3EC3E', description: 'Accent/gradient color when device is ON' })
  @IsString()
  accentColor: string;

  @ApiProperty({ example: ['50%'], description: 'Bottom sheet modal snap points' })
  @IsArray()
  @IsString({ each: true })
  modalSnapPoints: string[];

  @ApiProperty({ required: false, example: 'lightbulb', description: 'Optional icon override' })
  @IsString()
  @IsOptional()
  icon?: string;
}

export class UpdateDeviceUiConfigDto {
  @ApiProperty({ type: [DeviceUiConfigItemDto], description: 'Full list of device UI configs (replaces all)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeviceUiConfigItemDto)
  configs: DeviceUiConfigItemDto[];
}
