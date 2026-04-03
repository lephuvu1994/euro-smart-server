import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES, SceneTriggerIndexService } from '@app/common';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { SceneController } from './scene.controller';
import { SceneTriggerLocationService } from './services/scene-trigger-location.service';
import { SceneService } from './scene.service';

// NOTE: SceneScheduleService has been moved to worker-service/src/modules/scene/
// where it runs with distributed lock for multi-instance safety.

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    BullModule.registerQueue({
      name: APP_BULLMQ_QUEUES.DEVICE_CONTROL,
    }),
  ],
  controllers: [SceneController],
  providers: [SceneService, SceneTriggerLocationService, SceneTriggerIndexService],
  exports: [SceneService],
})
export class SceneModule {}
