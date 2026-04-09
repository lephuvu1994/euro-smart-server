import { IsEnum, IsNotEmpty, IsString, Length } from 'class-validator';
import { SharePermission } from '@prisma/client';

export class AddDeviceShareDto {
  @IsNotEmpty()
  @IsString()
  @Length(3, 255)
  targetUser: string;

  @IsEnum(SharePermission)
  permission?: SharePermission = SharePermission.EDITOR;
}

export class CreateDeviceShareTokenDto {
  @IsEnum(SharePermission)
  permission?: SharePermission = SharePermission.EDITOR;
}
