import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class ReorderScenesDto {
  @ApiProperty({ description: 'ID nhà (home) mà các scene thuộc về' })
  @IsUUID()
  homeId: string;

  @ApiProperty({
    description: 'Mảng scene IDs theo thứ tự mới',
    type: [String],
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  sceneIds: string[];
}
