import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { NotificationService } from './services/notification.service';

@Module({
  imports: [DatabaseModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
