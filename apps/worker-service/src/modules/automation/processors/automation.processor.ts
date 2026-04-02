import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { AutomationTargetType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';

@Processor(APP_BULLMQ_QUEUES.AUTOMATION, {
  concurrency: 50,
  limiter: {
    max: 1000,
    duration: 1000,
  },
})
@Injectable()
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(
    private readonly prisma: DatabaseService,
    @InjectQueue(APP_BULLMQ_QUEUES.DEVICE_CONTROL)
    private readonly deviceControlQueue: Queue,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case DEVICE_JOBS.TIMER_EXECUTE:
        return this.handleTimerExecute(job.data);
      case DEVICE_JOBS.SCHEDULE_EXECUTE:
        return this.handleScheduleExecute(job.data);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  private async handleTimerExecute(data: { timerId: string }) {
    const timer = await this.prisma.deviceTimer.findUnique({
      where: { id: data.timerId },
    });

    if (!timer) {
      return;
    }

    let status = 'SUCCESS';
    let errorReason = null;

    try {
      // actions is an array, we execute the first one for now or handle chain
      const actions = (timer.actions as any[]) || [];
      if (actions.length > 0) {
        // For simplicity in this iteration, we execute actions sequentially or the first one
        // Production would use a recursion pattern with BullMQ delay for 'DELAY' actions
        for (const action of actions) {
           await this.executeAction(timer.targetType, timer.targetId, timer.service, action);
        }
      }
    } catch (error) {
      status = 'FAILED';
      errorReason = error.message;
      this.logger.error(`Timer execution failed: ${errorReason}`);
    }

    // Ghi log vào Hypertable (TimescaleDB)
    await this.prisma.scheduleExecutionLog.create({
      data: {
        sourceType: 'TIMER',
        sourceId: timer.id,
        userId: timer.userId,
        status,
        errorReason,
      }
    });

    // Ephemeral: Xóa record sau khi chạy xong
    await this.prisma.deviceTimer.delete({
      where: { id: timer.id }
    });
  }

  private async handleScheduleExecute(data: { scheduleId: string }) {
    const schedule = await this.prisma.deviceSchedule.findUnique({
      where: { id: data.scheduleId },
    });

    if (!schedule || !schedule.isActive) {
      return;
    }

    let status = 'SUCCESS';
    let errorReason = null;

    try {
      const actions = (schedule.actions as any[]) || [];
       for (const action of actions) {
          await this.executeAction(schedule.targetType, schedule.targetId, schedule.service, action);
       }
    } catch (error) {
      status = 'FAILED';
      errorReason = error.message;
      this.logger.error(`Schedule execution failed: ${errorReason}`);
    }

    // Ghi log vào Hypertable
    await this.prisma.scheduleExecutionLog.create({
      data: {
        sourceType: 'SCHEDULE',
        sourceId: schedule.id,
        userId: schedule.userId,
        status,
        errorReason,
      }
    });

    // Update lastExecutedAt
    await this.prisma.deviceSchedule.update({
      where: { id: schedule.id },
      data: { lastExecutedAt: new Date() }
    });
  }

  private async executeAction(
    targetType: AutomationTargetType,
    targetId: string,
    service: string,
    actionData: any,
  ) {
    if (targetType === AutomationTargetType.SCENE) {
      await this.deviceControlQueue.add(
        DEVICE_JOBS.RUN_SCENE,
        { sceneId: targetId, source: 'automation' },
        { priority: 1, removeOnComplete: true }
      );
    } else if (targetType === AutomationTargetType.DEVICE_ENTITY) {
      const entity = await this.prisma.deviceEntity.findUnique({
        where: { id: targetId },
        include: { device: true },
      });

      if (!entity || !entity.device) {
        throw new Error(`DeviceEntity not found: ${targetId}`);
      }

      const value = actionData?.state ?? actionData?.value ?? 1;

      await this.deviceControlQueue.add(
        DEVICE_JOBS.CONTROL_CMD,
        {
          token: entity.device.token,
          entityCode: entity.code,
          value: value,
          userId: entity.device.ownerId,
          source: 'automation',
        },
        { priority: 1, removeOnComplete: true }
      );
    }
  }
}
