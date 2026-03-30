import { Controller, Get, Delete, Param, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAccessGuard } from '@app/common';
import { UserSessionService } from '../services/user-session.service';
import { IRequest } from '@app/common';

@ApiTags('User Sessions')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('v1/user/sessions')
export class UserSessionController {
  constructor(private readonly userSessionService: UserSessionService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các phiên đăng nhập hoạt động' })
  async getSessions(@Req() req: IRequest) {
    return this.userSessionService.getSessions(req.user.userId);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Đăng xuất một phiên làm việc cụ thể' })
  async revokeSession(@Req() req: IRequest, @Param('id') id: string) {
    return this.userSessionService.revokeSession(req.user.userId, id);
  }
}
