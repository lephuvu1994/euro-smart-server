import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class UserCreateDto {
  @ApiProperty({
    description: 'Email hoặc Số điện thoại',
    example: faker.internet.email(),
    required: true,
  })
  @IsString()
  @IsNotEmpty({ message: 'Email hoặc SĐT không được để trống' })
  public identifier: string;

  @ApiProperty({
    description: 'Mật khẩu',
    example: `${faker.string.alphanumeric(5).toLowerCase()}${faker.string
      .alphanumeric(5)
      .toUpperCase()}@@!${faker.number.int(1000)}`,
    required: true,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Mật khẩu phải từ 8 ký tự trở lên' })
  public password: string;

  @ApiProperty({
    description: 'Tên (First Name)',
    example: faker.person.firstName(),
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(1, 50)
  public firstName?: string;

  @ApiProperty({
    description: 'Họ (Last Name)',
    example: faker.person.lastName(),
    required: false,
  })
  @IsString()
  @IsOptional()
  @Length(1, 50)
  public lastName?: string;
}
