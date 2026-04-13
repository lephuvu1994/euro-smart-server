import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsUUID } from 'class-validator';

export class AssignEntitiesToRoomDto {
  @ApiProperty({
    description:
      'Danh sách deviceId sẽ được gán vào phòng này. ' +
      'Devices hiện đang trong phòng nhưng KHÔNG nằm trong list sẽ bị gỡ (roomId → null).',
    type: [String],
    example: ['uuid-device-1', 'uuid-device-2'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  entityIds: string[];
}
