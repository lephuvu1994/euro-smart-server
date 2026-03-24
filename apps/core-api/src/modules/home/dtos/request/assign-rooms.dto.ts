import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';

export class AssignRoomsDto {
  @ApiProperty({
    example: ['room-id-1', 'room-id-2'],
    description:
      'Danh sách roomId sẽ thuộc tầng này. Rooms cũ không nằm trong list sẽ bị gỡ khỏi tầng.',
  })
  @IsArray()
  @IsString({ each: true })
  roomIds: string[];
}
