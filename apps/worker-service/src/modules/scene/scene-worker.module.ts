import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { SceneScheduleCronService } from './services/scene-schedule-cron.service';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    BullModule.registerQueue({
      name: APP_BULLMQ_QUEUES.DEVICE_CONTROL,
    }),
  ],
  providers: [SceneScheduleCronService],
})
export class SceneWorkerModule {}
