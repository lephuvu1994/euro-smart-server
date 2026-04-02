import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { InjectQueue } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { Queue } from 'bullmq';
import { CreateTimerDto } from '../dto/create-timer.dto';
import { CreateScheduleDto } from '../dto/create-schedule.dto';

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: DatabaseService,
    @InjectQueue(APP_BULLMQ_QUEUES.AUTOMATION)
    private readonly automationQueue: Queue,
  ) {}

  async createTimer(userId: string, dto: CreateTimerDto) {
    const executeAt = new Date(dto.executeAt);
    
    const timer = await this.prisma.deviceTimer.create({
      data: {
        userId,
        name: dto.name,
        targetType: dto.targetType,
        targetId: dto.targetId,
        service: dto.service,
        actions: dto.actions || [] as any,
        executeAt,
      },
    });

    const delay = executeAt.getTime() - Date.now();
    
    // Add job to BullMQ
    await this.automationQueue.add(
      DEVICE_JOBS.TIMER_EXECUTE,
      { timerId: timer.id },
      { delay: delay > 0 ? delay : 0, removeOnComplete: true }
    );

    return timer;
  }

  async createSchedule(userId: string, dto: CreateScheduleDto) {
    const nextExecuteAt = this.calculateNextExecution(dto);

    const schedule = await this.prisma.deviceSchedule.create({
      data: {
        userId,
        name: dto.name,
        targetType: dto.targetType,
        targetId: dto.targetId,
        service: dto.service,
        actions: dto.actions || [] as any,
        cronExpression: dto.cronExpression,
        daysOfWeek: dto.daysOfWeek || [],
        timeOfDay: dto.timeOfDay,
        timezone: dto.timezone || 'Asia/Ho_Chi_Minh',
        jitterSeconds: dto.jitterSeconds || 0,
        isActive: true,
        nextExecuteAt,
      },
    });

    return schedule;
  }

  private calculateNextExecution(dto: Partial<CreateScheduleDto>): Date | null {
    if (dto.cronExpression) {
      try {
        const cronParser = require('cron-parser');
        const interval = cronParser.parseExpression(dto.cronExpression, { tz: dto.timezone || 'Asia/Ho_Chi_Minh' });
        return interval.next().toDate();
      } catch (_err) {
        return null;
      }
    }

    if (dto.daysOfWeek && dto.daysOfWeek.length > 0 && dto.timeOfDay) {
      // timeOfDay format: "HH:mm"
      const [hour, minute] = dto.timeOfDay.split(':').map(Number);
      
      const now = new Date();
      // Simple timezone handling for demonstration, production would strictly use timezone lib.
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);

      // Find the next day that matches
      for (let i = 0; i <= 7; i++) {
        const testDate = new Date(candidate.getTime() + i * 24 * 60 * 60 * 1000);
        if (dto.daysOfWeek.includes(testDate.getDay())) {
          if (testDate > now) {
            return testDate;
          }
        }
      }
    }

    return null;
  }

  async getTimers(userId: string) {
    return this.prisma.deviceTimer.findMany({ where: { userId } });
  }

  async getSchedules(userId: string) {
    return this.prisma.deviceSchedule.findMany({ where: { userId } });
  }
}
