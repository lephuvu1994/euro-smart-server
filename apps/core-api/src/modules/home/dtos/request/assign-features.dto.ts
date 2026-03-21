import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignFeaturesDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách ID tất cả các tính năng thiết bị (features) thuộc phòng',
  })
  @IsArray()
  @IsString({ each: true })
  featureIds: string[];
}
