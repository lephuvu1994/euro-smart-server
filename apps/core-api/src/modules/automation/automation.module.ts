import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { AutomationService } from './services/automation.service';
import { AutomationController } from './controllers/automation.controller';
import { DatabaseModule } from '@app/database';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue({
      name: APP_BULLMQ_QUEUES.AUTOMATION,
    }),
  ],
  controllers: [AutomationController],
  providers: [AutomationService],
  exports: [AutomationService],
})
export class AutomationModule {}
