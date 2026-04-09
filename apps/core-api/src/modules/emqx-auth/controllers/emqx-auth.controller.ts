import {
  Controller,
  Post,
  Body,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EMQX HTTP Auth — Verify MQTT credentials' })
  async authenticate(@Body() dto: any, @Res() res: Response) {
    console.error('RECEIVED_AUTH:', dto);
    const result = await this.emqxAuthService.authenticate(dto);
    return res.status(HttpStatus.OK).json(result);
  }

  /**
   * EMQX HTTP ACL — Called by EMQX on subscribe/publish.
   * Public route (no JWT) — Only EMQX calls this internally.
   */
  @Post('acl')
  @PublicRoute()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'EMQX HTTP ACL — Check topic permission' })
  async authorize(@Body() dto: any, @Res() res: Response) {
    console.error('RECEIVED_ACL:', dto);
    const result = await this.emqxAuthService.authorize(dto);
    return res.status(HttpStatus.OK).json(result);
  }
}
