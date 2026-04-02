import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '@app/database';
import { RedisService } from '@app/redis-cache';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { APP_BULLMQ_QUEUES, DEVICE_JOBS } from '@app/common';


@Injectable()
export class ScheduleCronService {
  private readonly logger = new Logger(ScheduleCronService.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly redis: RedisService,
    @InjectQueue(APP_BULLMQ_QUEUES.AUTOMATION)
    private readonly automationQueue: Queue,
  ) {}

  @Cron('0 * * * * *') // Run at 0 seconds of every minute
  async scanSchedules() {
    // Distributed Lock
    const lock = await this.redis.getClient().set('lock:schedule_cron', '1', 'EX', 55, 'NX');
    if (!lock) {
      return; 
    }

    try {
      const now = new Date();
      const jobsToRun = await this.prisma.deviceSchedule.findMany({
        where: { 
          isActive: true, 
          nextExecuteAt: { lte: now } 
        },
      });

      if (jobsToRun.length === 0) return;

      this.logger.log(`Found ${jobsToRun.length} schedules to execute.`);

      const bulkJobs = jobsToRun.map(schedule => {
        // Jittering: random 0 -> jitterSeconds.
        const jitterMs = schedule.jitterSeconds > 0 
          ? Math.floor(Math.random() * (schedule.jitterSeconds * 1000))
          : 0;
        
        return {
          name: DEVICE_JOBS.SCHEDULE_EXECUTE,
          data: { scheduleId: schedule.id },
          opts: { delay: jitterMs, removeOnComplete: true }
        };
      });

      // Add bulk
      await this.automationQueue.addBulk(bulkJobs);

      // Recalculate nextExecuteAt
      for (const schedule of jobsToRun) {
        let nextTs: Date | null = null;
        
        if (schedule.cronExpression) {
          try {
            const cronParser = require('cron-parser');
            const interval = cronParser.parseExpression(schedule.cronExpression, { tz: schedule.timezone });
            nextTs = interval.next().toDate();
          } catch (_e) {
            nextTs = null;
          }
        } else if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0 && schedule.timeOfDay) {
          const [hour, minute] = schedule.timeOfDay.split(':').map(Number);
          const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);

          for (let i = 1; i <= 7; i++) { // look into the future
            const testDate = new Date(candidate.getTime() + i * 24 * 60 * 60 * 1000);
            if (schedule.daysOfWeek.includes(testDate.getDay())) {
              nextTs = testDate;
              break;
            }
          }
        }

        if (nextTs) {
          await this.prisma.deviceSchedule.update({
            where: { id: schedule.id },
            data: { nextExecuteAt: nextTs },
          });
        } else {
           // Deactivate if no valid next execute at
           await this.prisma.deviceSchedule.update({
            where: { id: schedule.id },
            data: { isActive: false },
          });
        }
      }

    } catch (error) {
      this.logger.error(`Error in schedule cron: ${error.message}`);
    }
  }
}
