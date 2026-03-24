import { faker } from '@faker-js/faker';
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Type } from 'class-transformer';
import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

import { UserResponseDto } from '../../../dtos/user.response.dto';

export class TokenDto {
  @ApiProperty({
    example: faker.string.alphanumeric({ length: 64 }),
    required: true,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({
    example: faker.string.alphanumeric({ length: 64 }),
    required: true,
  })
  @Expose()
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class AuthHomeDto {
  @ApiProperty({ example: faker.string.uuid() })
  @Expose()
  id!: string;

  @ApiProperty({ example: 'Nhà của tôi' })
  @Expose()
  name!: string;

  @ApiProperty({ example: 'OWNER', enum: ['OWNER', 'MEMBER'] })
  @Expose()
  role!: string;
}

export class AuthResponseDto extends TokenDto {
  @ApiProperty({
    type: () => UserResponseDto,
    required: true,
  })
  @Expose()
  @Type(() => UserResponseDto)
  @ValidateNested()
  user!: UserResponseDto;

  @ApiProperty({
    type: () => [AuthHomeDto],
    description: 'List of homes the user belongs to (as owner or member)',
  })
  @Expose()
  @Type(() => AuthHomeDto)
  homes!: AuthHomeDto[];
}

export class AuthRefreshResponseDto extends TokenDto {}

export class AuthMeResponseDto {
  @ApiProperty({
    type: () => UserResponseDto,
    required: true,
  })
  @Expose()
  @Type(() => UserResponseDto)
  @ValidateNested()
  user: UserResponseDto;

  @ApiProperty({
    type: () => [AuthHomeDto],
    description: 'List of homes the user belongs to (as owner or member)',
  })
  @Expose()
  @Type(() => AuthHomeDto)
  homes: AuthHomeDto[];
}
