import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { EmqxAuthService } from '../services/emqx-auth.service';
import { EmqxAuthDto } from '../dto/emqx-auth.dto';
import { EmqxAclDto } from '../dto/emqx-acl.dto';
import { PublicRoute } from '@app/common/request/decorators/request.public.decorator';

@ApiTags('internal.emqx')
@SkipThrottle()
@Controller('internal/emqx')
export class EmqxAuthController {
  constructor(private readonly emqxAuthService: EmqxAuthService) {}

  /**
   * EMQX HTTP Auth — Called by EMQX on every client connect.
   * Public route (no JWT) — Only EMQX calls this internally.
   */
  @Post('auth')
  @PublicRoute()
  @ApiOperation({ summary: 'EMQX HTTP Auth — Verify MQTT credentials' })
  authenticate(@Body() dto: EmqxAuthDto) {
    return this.emqxAuthService.authenticate(dto);
  }

  /**
   * EMQX HTTP ACL — Called by EMQX on subscribe/publish.
   * Public route (no JWT) — Only EMQX calls this internally.
   */
  @Post('acl')
  @PublicRoute()
  @ApiOperation({ summary: 'EMQX HTTP ACL — Check topic permission' })
  authorize(@Body() dto: EmqxAclDto) {
    return this.emqxAuthService.authorize(dto);
  }
}
