import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS, calculateNextExecution } from '@app/common';
import { DeviceSchedule } from '@prisma/client';

/** Batch size per cursor page — keeps memory bounded at any scale */
const BATCH_SIZE = 500;

interface ScheduleUpdate {
  id: string;
  nextExecuteAt: Date | null;
  isActive: boolean;
}

@Injectable()
export class ScheduleCronService {
  private readonly logger = new Logger(ScheduleCronService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly redis: RedisService,
    @InjectQueue(APP_BULLMQ_QUEUES.AUTOMATION)
    private readonly automationQueue: Queue,
  ) {}

  /** Runs at second 0 of every minute */
  @Cron('0 * * * * *')
  async scanSchedules(): Promise<void> {
    // Distributed lock — prevents duplicate execution across multiple worker instances
    const lock = await this.redis
      .getClient()
      .set('lock:schedule_cron', '1', 'EX', 55, 'NX');
    if (!lock) return;

    try {
      await this.processBatches();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error in schedule cron: ${message}`);
    }
  }

  private async processBatches(): Promise<void> {
    const now = new Date();
    let cursor: string | undefined;
    const allUpdates: ScheduleUpdate[] = [];
    let totalQueued = 0;

    // Cursor-based pagination — prevents loading all rows into memory
    while (true) {
      const batch: DeviceSchedule[] = await this.prisma.deviceSchedule.findMany({
        where: { isActive: true, nextExecuteAt: { lte: now } },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id;

      // Enqueue batch of BullMQ jobs with full payload (zero extra DB reads in processor)
      const bulkJobs = batch.map((schedule) => {
        const jitterMs =
          schedule.jitterSeconds > 0
            ? Math.floor(Math.random() * schedule.jitterSeconds * 1000)
            : 0;

        return {
          name: DEVICE_JOBS.SCHEDULE_EXECUTE,
          data: {
            scheduleId: schedule.id,
            // Serialize full payload — AutomationProcessor skips re-querying DB
            actions: schedule.actions,
            targetType: schedule.targetType,
            targetId: schedule.targetId,
            service: schedule.service,
            userId: schedule.userId,
          },
          opts: { delay: jitterMs, removeOnComplete: true },
        };
      });

      await this.automationQueue.addBulk(bulkJobs);
      totalQueued += batch.length;

      // Compute nextExecuteAt in-memory (no DB round-trip per schedule)
      for (const schedule of batch) {
        const nextExecuteAt = calculateNextExecution(
          {
            cronExpression: schedule.cronExpression,
            daysOfWeek: schedule.daysOfWeek,
            timeOfDay: schedule.timeOfDay,
            timezone: schedule.timezone ?? undefined,
          },
          now,
        );

        allUpdates.push({
          id: schedule.id,
          nextExecuteAt,
          isActive: nextExecuteAt !== null,
        });
      }

      if (batch.length < BATCH_SIZE) break;
    }

    if (totalQueued === 0) return;
    this.logger.log(`Queued ${totalQueued} schedule(s) for execution.`);

    // Bulk update via single raw SQL — replaces N sequential UPDATE statements
    await this.bulkUpdateSchedules(allUpdates);
  }

  /**
   * Batch update schedules using Prisma interactive transaction.
   * Replaces raw SQL to eliminate SQL injection risk from string concatenation.
   * All updates are sent in a single transaction roundtrip.
   */
  private async bulkUpdateSchedules(updates: ScheduleUpdate[]): Promise<void> {
    if (updates.length === 0) return;

    await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.deviceSchedule.update({
          where: { id: u.id },
          data: {
            nextExecuteAt: u.nextExecuteAt,
            isActive: u.isActive,
          },
        }),
      ),
    );

    this.logger.log(`Bulk-updated ${updates.length} schedule(s).`);
  }
}
