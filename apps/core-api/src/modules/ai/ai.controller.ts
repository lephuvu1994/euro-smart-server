import {
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

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
  @ApiOperation({ summary: 'Send a prompt to the AI Assistant (Gemini)' })
  async chat(@Body() body: { prompt: string; lang?: 'vi' | 'en' }) {
    if (!body.prompt) {
      return { error: 'Prompt is required' };
    }
    const response = await this.aiService.chat(body.prompt, body.lang || 'vi');
    return { response };
  }
}
