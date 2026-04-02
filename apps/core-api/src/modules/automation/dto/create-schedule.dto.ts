import { AutomationTargetType } from '@prisma/client';
import { IsEnum, IsNotEmpty, IsArray, IsString, IsUUID, IsDateString, IsOptional, IsNumber } from 'class-validator';

export class CreateScheduleDto {
  @IsNotEmpty()
  @IsString()
  name: string;

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

  @IsOptional()
  @IsString()
  cronExpression?: string;

  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  daysOfWeek?: number[];

  @IsOptional()
  @IsString()
  timeOfDay?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  @IsOptional()
  @IsNumber()
  jitterSeconds?: number;
}
