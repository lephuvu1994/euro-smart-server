import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AutomationService } from '../services/automation.service';
import { CreateTimerDto } from '../dto/create-timer.dto';
import { CreateScheduleDto } from '../dto/create-schedule.dto';
import { IRequest } from '@app/common';
import { JwtAccessGuard } from '@app/common';
import { AllowedRoles } from '@app/common/request/decorators/request.role.decorator';
import { RolesGuard } from '@app/common/request/guards/roles.guard';
import { UserRole } from '@prisma/client';

class ToggleScheduleDto {
  @IsBoolean()
  isActive!: boolean;
}

@ApiTags('Automation')
@UseGuards(JwtAccessGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @ApiOperation({ summary: 'Get automation execution stats' })
  @Get('stats')
  getStats(@Req() req: IRequest) {
    return this.automationService.getExecutionStats(req.user.userId);
  }

  @ApiOperation({ summary: 'Get BullMQ queue metrics (Admin only)' })
  @UseGuards(RolesGuard)
  @AllowedRoles([UserRole.ADMIN])
  @Get('queue-metrics')
  getQueueMetrics() {
    return this.automationService.getQueueMetrics();
  }

  // ── Timers ──────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a one-shot timer' })
  @Post('timers')
  createTimer(@Req() req: IRequest, @Body() dto: CreateTimerDto) {
    return this.automationService.createTimer(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'List all timers for current user' })
  @Get('timers')
  getTimers(@Req() req: IRequest) {
    return this.automationService.getTimers(req.user.userId);
  }

  @ApiOperation({ summary: 'Cancel a pending timer' })
  @Delete('timers/:timerId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTimer(@Req() req: IRequest, @Param('timerId') timerId: string) {
    return this.automationService.deleteTimer(req.user.userId, timerId);
  }

  // ── Schedules ────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Create a recurring schedule' })
  @Post('schedules')
  createSchedule(@Req() req: IRequest, @Body() dto: CreateScheduleDto) {
    return this.automationService.createSchedule(req.user.userId, dto);
  }

  @ApiOperation({ summary: 'List all schedules for current user' })
  @Get('schedules')
  getSchedules(@Req() req: IRequest) {
    return this.automationService.getSchedules(req.user.userId);
  }

  @ApiOperation({ summary: 'Enable or disable a schedule' })
  @Patch('schedules/:scheduleId/toggle')
  toggleSchedule(
    @Req() req: IRequest,
    @Param('scheduleId') scheduleId: string,
    @Body() body: ToggleScheduleDto,
  ) {
    return this.automationService.toggleSchedule(
      req.user.userId,
      scheduleId,
      body.isActive,
    );
  }

  @ApiOperation({ summary: 'Delete a schedule' })
  @Delete('schedules/:scheduleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSchedule(
    @Req() req: IRequest,
    @Param('scheduleId') scheduleId: string,
  ) {
    return this.automationService.deleteSchedule(req.user.userId, scheduleId);
  }
}
