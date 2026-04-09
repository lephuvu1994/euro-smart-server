import { IsOptional, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class GetDeviceTimelineDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 30;

  @ApiPropertyOptional({ description: 'Filter by entity code (e.g. curtain_1)' })
  @IsOptional()
  @IsString()
  entityCode?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ enum: ['connection', 'state'], description: 'Filter timeline by event type' })
  @IsOptional()
  type?: 'connection' | 'state';
}
