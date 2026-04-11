import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class RunSceneDto {
  @ApiPropertyOptional({
    description: 'Bao nhiêu giây nữa mới chạy',
    example: 3600,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  delaySeconds?: number;
}
