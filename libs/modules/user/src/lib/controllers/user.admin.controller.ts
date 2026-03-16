import { Controller, Delete, HttpStatus, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { DocGenericResponse } from '@app/common/doc/decorators/doc.generic.decorator';
import { AllowedRoles } from '@app/common/request/decorators/request.role.decorator';
import { ApiGenericResponseDto } from '@app/common/response/dtos/response.generic.dto';

import { UserService } from '../services/user.service';

@ApiTags('admin.user')
@Controller({
  path: '/admin/user',
  version: '1',
})
export class UserAdminController {
  constructor(private readonly userService: UserService) {}

  @Delete(':id')
  @AllowedRoles([UserRole.ADMIN])
  @ApiBearerAuth('accessToken')
  @ApiOperation({ summary: 'Delete user' })
  @DocGenericResponse({
    httpStatus: HttpStatus.OK,
    messageKey: 'user.success.deleted',
  })
  public async deleteUser(
    @Param('id') userId: string,
  ): Promise<ApiGenericResponseDto> {
    return this.userService.deleteUser(userId);
  }
}
