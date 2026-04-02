import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { AutomationProcessor } from './processors/automation.processor';
import { ScheduleCronService } from './services/schedule-cron.service';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@app/database';

@Module({
  imports: [
    DatabaseModule,
    ScheduleModule.forRoot(),
    BullModule.registerQueue(
      { name: APP_BULLMQ_QUEUES.AUTOMATION },
      { name: APP_BULLMQ_QUEUES.DEVICE_CONTROL },
    ),
  ],
  providers: [AutomationProcessor, ScheduleCronService],
})
export class AutomationModule {}
