import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignScenesToRoomDto {
  @ApiProperty({
    description:
      'Danh sách sceneId sẽ được gán vào phòng này. ' +
      'Scenes hiện đang trong phòng nhưng KHÔNG nằm trong list sẽ bị gỡ (roomId → null).',
    type: [String],
    example: ['uuid-scene-1', 'uuid-scene-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  sceneIds: string[];
}
