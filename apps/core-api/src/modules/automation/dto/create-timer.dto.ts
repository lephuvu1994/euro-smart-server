import { AutomationTargetType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsArray, IsString, IsUUID, IsDateString, IsOptional } from 'class-validator';

export class CreateTimerDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsNotEmpty()
  @IsEnum(AutomationTargetType)
  targetType: AutomationTargetType;

  @IsNotEmpty()
  @IsUUID()
  targetId: string;

  @IsNotEmpty()
  @IsString()
  service: string;

  @IsOptional()
  @IsArray()
  actions?: any[];

  @IsNotEmpty()
  @IsDateString()
  executeAt: string;
}
