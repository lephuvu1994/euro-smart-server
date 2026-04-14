import {
  Body,
  Controller,
  Post,
  Res,
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

@ApiTags('Admin AI Chat')
@Controller({ version: '1', path: '/admin/ai' })
@UseGuards(JwtAccessGuard, RolesGuard)
@ApiBearerAuth('accessToken')
@AllowedRoles([UserRole.ADMIN])
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Send a prompt to the AI Assistant (Gemini) — legacy sync' })
  async chat(@Body() body: { prompt: string; lang?: 'vi' | 'en' }) {
    if (!body.prompt) {
      return { error: 'Prompt is required' };
    }
    const response = await this.aiService.chat(body.prompt, body.lang || 'vi');
    return { response };
  }

  @Post('chat/stream')
  @ApiOperation({
    summary: 'Stream AI response via SSE (Phase 6)',
    description: 'Sends prompt + conversation history. Returns SSE events: tool_start, tool_call, tool_result, stream_start, delta, done, error.',
  })
  async chatStream(
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
    await this.aiService.chatStream(
      res,
      body.prompt,
      body.history || [],
      body.lang || 'vi',
    );
  }
}
