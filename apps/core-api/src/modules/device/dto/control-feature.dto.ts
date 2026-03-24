import { IsNotEmpty, IsString } from 'class-validator';

export class ControlEntityDto {
  @IsString()
  entityCode: string; // Mã entity (VD: channel_1)

  @IsNotEmpty()
  value: any; // 1, 0, "red", 50...
}
