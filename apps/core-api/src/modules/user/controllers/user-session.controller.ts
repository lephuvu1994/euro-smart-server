import { Controller, Get, Delete, Param, UseGuards, Req, Patch, Body, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAccessGuard, IRequest, DocResponse } from '@app/common';
import { UserSessionService } from '../services/user-session.service';
import { UpdatePushTokenDto } from '../dto/update-push-token.dto';

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

  @Patch('push-token')
  @ApiOperation({ summary: 'Cập nhật Expo Push Token cho phiên làm việc hiện tại' })
  @DocResponse({ messageKey: 'base.update_success', httpStatus: HttpStatus.OK })
  async updatePushToken(@Req() req: IRequest, @Body() body: UpdatePushTokenDto) {
    if (!req.user.sid) {
      throw new Error('Session ID is missing from token payload');
    }
    await this.userSessionService.updatePushToken(req.user.userId, req.user.sid, body.pushToken);
    return null;
  }
}
