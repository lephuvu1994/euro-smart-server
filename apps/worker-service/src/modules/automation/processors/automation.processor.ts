import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';
import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@app/database';
import { AutomationTargetType } from '@prisma/client';
import { InjectQueue } from '@nestjs/bullmq';

// ---------------------------------------------------------------------------
// Typed job payload interfaces — no `any`
// ---------------------------------------------------------------------------

interface AutomationAction {
  state?: number | string | boolean;
  value?: number | string | boolean;
  delay?: number;
  [key: string]: unknown;
}

interface TimerExecutePayload {
  timerId: string;
  /** Serialized by AutomationService — skips DB re-query */
  actions?: AutomationAction[];
  targetType?: AutomationTargetType;
  targetId?: string;
  service?: string;
  userId?: string;
}

interface ScheduleExecutePayload {
  scheduleId: string;
  /** Serialized by ScheduleCronService — skips DB re-query */
  actions?: AutomationAction[];
  targetType?: AutomationTargetType;
  targetId?: string;
  service?: string;
  userId?: string;
}

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

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `[DLQ] ${job?.name} failed after ${job?.attemptsMade} attempts: ${error?.message}`,
      { jobId: job?.id, data: job?.data },
    );
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case DEVICE_JOBS.TIMER_EXECUTE:
        return this.handleTimerExecute(job.data as TimerExecutePayload);
      case DEVICE_JOBS.SCHEDULE_EXECUTE:
        return this.handleScheduleExecute(job.data as ScheduleExecutePayload);
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
    }
  }

  /**
   * Execute a one-shot timer.
   * Optimistic path: uses serialized payload from AutomationService (0 DB reads).
   * Fallback path: loads from DB if payload is incomplete (backwards-compat).
   */
  private async handleTimerExecute(data: TimerExecutePayload): Promise<void> {
    let targetType = data.targetType;
    let targetId = data.targetId;
    let service = data.service;
    let userId = data.userId;
    let actions = data.actions;

    // Fallback: load from DB if payload is missing (old-enqueued jobs)
    if (!targetType || !targetId || !actions) {
      const timer = await this.prisma.deviceTimer.findUnique({
        where: { id: data.timerId },
      });
      if (!timer) return;

      targetType = timer.targetType;
      targetId = timer.targetId;
      service = timer.service;
      userId = timer.userId;
      actions = (timer.actions as AutomationAction[]) ?? [];
    }

    let status = 'SUCCESS';
    let errorReason: string | null = null;

    try {
      for (const action of (actions ?? [])) {
        await this.executeAction(
          targetType as AutomationTargetType,
          targetId as string,
          service ?? '',
          action,
        );
      }
    } catch (error) {
      status = 'FAILED';
      errorReason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Timer execution failed: ${errorReason}`);
    }

    // Write audit log to TimescaleDB hypertable
    await this.prisma.scheduleExecutionLog.create({
      data: {
        sourceType: 'TIMER',
        sourceId: data.timerId,
        userId: userId ?? null,
        status,
        errorReason,
      },
    });

    // Ephemeral: delete timer after execution
    await this.prisma.deviceTimer.delete({ where: { id: data.timerId } }).catch(() => {
      // Already deleted — safe to ignore
    });
  }

  /**
   * Execute a recurring schedule tick.
   * Optimistic path: uses serialized payload from ScheduleCronService (0 DB reads).
   * Fallback path: loads from DB if payload is incomplete (backwards-compat).
   */
  private async handleScheduleExecute(data: ScheduleExecutePayload): Promise<void> {
    let targetType = data.targetType;
    let targetId = data.targetId;
    let service = data.service;
    let userId = data.userId;
    let actions = data.actions;

    // Fallback: load from DB if payload is missing
    if (!targetType || !targetId || !actions) {
      const schedule = await this.prisma.deviceSchedule.findUnique({
        where: { id: data.scheduleId },
      });
      if (!schedule || !schedule.isActive) return;

      targetType = schedule.targetType;
      targetId = schedule.targetId;
      service = schedule.service;
      userId = schedule.userId;
      actions = (schedule.actions as AutomationAction[]) ?? [];
    }

    let status = 'SUCCESS';
    let errorReason: string | null = null;

    try {
      for (const action of (actions ?? [])) {
        await this.executeAction(
          targetType as AutomationTargetType,
          targetId as string,
          service ?? '',
          action,
        );
      }
    } catch (error) {
      status = 'FAILED';
      errorReason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Schedule execution failed: ${errorReason}`);
    }

    // Batch log write + lastExecutedAt update in parallel
    await Promise.all([
      this.prisma.scheduleExecutionLog.create({
        data: {
          sourceType: 'SCHEDULE',
          sourceId: data.scheduleId,
          userId: userId ?? null,
          status,
          errorReason,
        },
      }),
      this.prisma.deviceSchedule
        .update({
          where: { id: data.scheduleId },
          data: { lastExecutedAt: new Date() },
        })
        .catch(() => {
          // Schedule may have been deleted concurrently — safe to ignore
        }),
    ]);
  }

  private async executeAction(
    targetType: AutomationTargetType,
    targetId: string,
    _service: string,
    action: AutomationAction,
  ): Promise<void> {
    if (targetType === AutomationTargetType.SCENE) {
      await this.deviceControlQueue.add(
        DEVICE_JOBS.RUN_SCENE,
        { sceneId: targetId, source: 'automation' },
        { priority: 1, removeOnComplete: true },
      );
      return;
    }

    if (targetType === AutomationTargetType.DEVICE_ENTITY) {
      const entity = await this.prisma.deviceEntity.findUnique({
        where: { id: targetId },
        include: { device: true },
      });

      if (!entity?.device) {
        throw new Error(`DeviceEntity not found: ${targetId}`);
      }

      const value =
        (action.state as string | number | boolean | undefined) ??
        (action.value as string | number | boolean | undefined) ??
        1;

      await this.deviceControlQueue.add(
        DEVICE_JOBS.CONTROL_CMD,
        {
          token: entity.device.token,
          entityCode: entity.code,
          value,
          userId: entity.device.ownerId,
          source: 'automation',
        },
        { priority: 1, removeOnComplete: true },
      );
    }
  }
}
