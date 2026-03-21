import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignScenesDto {
  @ApiProperty({
    type: [String],
    description: 'Danh sách ID tất cả các kịch bản (scenes) thuộc phòng',
  })
  @IsArray()
  @IsString({ each: true })
  sceneIds: string[];
}
