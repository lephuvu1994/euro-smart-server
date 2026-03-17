import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreatePartnerDto {
  @ApiProperty({ example: 'COMPANY_B', description: 'Mã định danh công ty (Unique, chỉ chứa chữ số và gạch dưới)' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Za-z0-9_]+$/, { message: 'Code chỉ chứa chữ, số và gạch dưới' })
  code: string;

  @ApiProperty({ example: 'Công ty SmartHome Miền Bắc' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
