import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { SceneController } from './scene.controller';
import { SceneScheduleService } from './services/scene-schedule.service';
import { SceneTriggerLocationService } from './services/scene-trigger-location.service';
import { SceneService } from './scene.service';

@Module({
    imports: [
        DatabaseModule,
        RedisModule,
        BullModule.registerQueue({
            name: APP_BULLMQ_QUEUES.DEVICE_CONTROL,
        }),
    ],
    controllers: [SceneController],
    providers: [
        SceneService,
        SceneScheduleService,
        SceneTriggerLocationService,
    ],
    exports: [SceneService],
})
export class SceneModule {}
