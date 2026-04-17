import {
  Body,
  Controller,
  Post,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Response } from 'express';

import { JwtAccessGuard } from '@app/common/request/guards/jwt.access.guard';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { AllowedRoles } from '@app/common/request/decorators/request.role.decorator';

import { AiService } from './ai.service';

@ApiTags('App AI Chat')
@Controller({ version: '1', path: '/app/ai' })
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@AllowedRoles([UserRole.USER])
export class AiAppController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat/stream')
  @ApiOperation({
    summary: 'Stream AI response via SSE for End Users.',
    description: 'Securely bounded by user ID to only control devices/scenes owned by this user.',
  })
  async chatStream(
    @Req() req: Request & { user: { id: string } },
    @Body() body: {
      prompt: string;
      history?: Array<{ role: string; content: string }>;
      lang?: 'vi' | 'en';
    },
    @Res() res: Response,
  ) {
    if (!body.prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }
    const userId = req.user.id;
    
    // Method to be implemented/updated in AiService
    await this.aiService.chatStream(
      res,
      body.prompt,
      body.history || [],
      body.lang || 'vi',
      userId,
    );
  }
}
