import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { AutomationService } from '../services/automation.service';
import { CreateTimerDto } from '../dto/create-timer.dto';
import { CreateScheduleDto } from '../dto/create-schedule.dto';
import { IRequest } from '@app/common';

@Controller('v1/automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('timers')
  async createTimer(@Req() req: IRequest, @Body() dto: CreateTimerDto) {
    return this.automationService.createTimer(req.user.userId, dto);
  }

  @Get('timers')
  async getTimers(@Req() req: IRequest) {
    return this.automationService.getTimers(req.user.userId);
  }

  @Post('schedules')
  async createSchedule(@Req() req: IRequest, @Body() dto: CreateScheduleDto) {
    return this.automationService.createSchedule(req.user.userId, dto);
  }

  @Get('schedules')
  async getSchedules(@Req() req: IRequest) {
    return this.automationService.getSchedules(req.user.userId);
  }
}
