import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { InjectQueue } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS, calculateNextExecution } from '@app/common';
import { Queue } from 'bullmq';
import { DeviceSchedule, DeviceTimer, Prisma } from '@prisma/client';
import { CreateTimerDto } from '../dto/create-timer.dto';
import { CreateScheduleDto } from '../dto/create-schedule.dto';

// ---------------------------------------------------------------------------
// Typed action item — no `any`
// ---------------------------------------------------------------------------
interface AutomationAction {
  state?: number | string | boolean;
  value?: number | string | boolean;
  delay?: number;
  [key: string]: unknown;
}

@Injectable()
export class AutomationService {
  constructor(
    private readonly prisma: DatabaseService,
    @InjectQueue(APP_BULLMQ_QUEUES.AUTOMATION)
    private readonly automationQueue: Queue,
  ) {}

  async createTimer(userId: string, dto: CreateTimerDto): Promise<DeviceTimer> {
    const [user, timerCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { maxTimers: true } }),
      this.prisma.deviceTimer.count({ where: { userId } }),
    ]);

    if (timerCount >= (user?.maxTimers ?? 50)) {
      throw new BadRequestException('automation.error.timerQuotaExceeded');
    }
    const executeAt = new Date(dto.executeAt);

    if (executeAt <= new Date()) {
      throw new BadRequestException('automation.error.executeDateMustBeFuture');
    }

    const actions: AutomationAction[] = (dto.actions as AutomationAction[]) ?? [];

    const timer = await this.prisma.deviceTimer.create({
      data: {
        userId,
        name: dto.name,
        targetType: dto.targetType,
        targetId: dto.targetId,
        service: dto.service,
        actions: actions as unknown as Prisma.InputJsonValue,
        executeAt,
      },
    });

    const delay = executeAt.getTime() - Date.now();

    // Enqueue with full payload so worker does not need a DB round-trip
    const job = await this.automationQueue.add(
      DEVICE_JOBS.TIMER_EXECUTE,
      {
        timerId: timer.id,
        actions,
        targetType: timer.targetType,
        targetId: timer.targetId,
        service: timer.service,
        userId: timer.userId,
      },
      { delay: delay > 0 ? delay : 0, removeOnComplete: true },
    );

    if (job?.id) {
      await this.prisma.deviceTimer.update({
        where: { id: timer.id },
        data: { jobId: String(job.id) },
      });
    }

    return timer;
  }

  async createSchedule(userId: string, dto: CreateScheduleDto): Promise<DeviceSchedule> {
    const [user, scheduleCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { maxSchedules: true } }),
      this.prisma.deviceSchedule.count({ where: { userId } }),
    ]);

    if (scheduleCount >= (user?.maxSchedules ?? 50)) {
      throw new BadRequestException('automation.error.scheduleQuotaExceeded');
    }
    const nextExecuteAt = calculateNextExecution({
      cronExpression: dto.cronExpression,
      daysOfWeek: dto.daysOfWeek,
      timeOfDay: dto.timeOfDay,
      timezone: dto.timezone,
    });

    const actions: AutomationAction[] = (dto.actions as AutomationAction[]) ?? [];

    return this.prisma.deviceSchedule.create({
      data: {
        userId,
        name: dto.name,
        targetType: dto.targetType,
        targetId: dto.targetId,
        service: dto.service,
        actions: actions as unknown as Prisma.InputJsonValue,
        cronExpression: dto.cronExpression,
        daysOfWeek: dto.daysOfWeek ?? [],
        timeOfDay: dto.timeOfDay,
        timezone: dto.timezone ?? 'Asia/Ho_Chi_Minh',
        jitterSeconds: dto.jitterSeconds ?? 0,
        isActive: true,
        nextExecuteAt,
      },
    });
  }

  async getTimers(userId: string): Promise<DeviceTimer[]> {
    return this.prisma.deviceTimer.findMany({ where: { userId } });
  }

  async getSchedules(userId: string): Promise<DeviceSchedule[]> {
    return this.prisma.deviceSchedule.findMany({ where: { userId } });
  }

  async deleteTimer(userId: string, timerId: string): Promise<void> {
    const timer = await this.prisma.deviceTimer.findFirst({
      where: { id: timerId, userId },
    });
    if (!timer) throw new NotFoundException('automation.error.timerNotFound');

    // Remove BullMQ job if jobId is stored
    if (timer.jobId) {
      const job = await this.automationQueue.getJob(timer.jobId);
      if (job) await job.remove().catch((err: Error) => console.log('Remove job err:', err.message));
    }

    await this.prisma.deviceTimer.delete({ where: { id: timerId } });
  }

  async deleteSchedule(userId: string, scheduleId: string): Promise<void> {
    const schedule = await this.prisma.deviceSchedule.findFirst({
      where: { id: scheduleId, userId },
    });
    if (!schedule) throw new NotFoundException('automation.error.scheduleNotFound');

    await this.prisma.deviceSchedule.delete({ where: { id: scheduleId } });
  }

  async toggleSchedule(
    userId: string,
    scheduleId: string,
    isActive: boolean,
  ): Promise<DeviceSchedule> {
    const schedule = await this.prisma.deviceSchedule.findFirst({
      where: { id: scheduleId, userId },
    });
    if (!schedule) throw new NotFoundException('automation.error.scheduleNotFound');

    // Recalculate nextExecuteAt when re-enabling
    const nextExecuteAt =
      isActive
        ? calculateNextExecution({
            cronExpression: schedule.cronExpression,
            daysOfWeek: schedule.daysOfWeek,
            timeOfDay: schedule.timeOfDay,
            timezone: schedule.timezone,
          })
        : schedule.nextExecuteAt;

    return this.prisma.deviceSchedule.update({
      where: { id: scheduleId },
      data: { isActive, nextExecuteAt },
    });
  }
}
