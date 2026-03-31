import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { configs, APP_BULLMQ_QUEUES } from '@app/common';
import { CustomLoggerModule } from '@app/common/logger/logger.module';
import { HelperModule } from '@app/common/helper/helper.module';
import { IntegrationModule, NotificationModule, MessageModule } from '@app/common';
import { EmailProcessorWorker } from './processors/email.processor';
import { DeviceControlProcessor } from './processors/device-control.processor';
import { DeviceStatusProcessor } from './processors/device-status.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { MidNightScheduleWorker } from './schedulers/midnight.scheduler';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configs,
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      expandVariables: true,
    }),
    DatabaseModule,
    RedisModule,
    CustomLoggerModule,
    HelperModule,
    ScheduleModule.forRoot(),
    IntegrationModule,
    NotificationModule,
    MessageModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        connection: {
          host: cs.get('redis.host'),
          port: Number(cs.get('redis.port')),
          password: cs.get('redis.password'),
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: APP_BULLMQ_QUEUES.EMAIL },
      { name: APP_BULLMQ_QUEUES.DEVICE_CONTROL },
      { name: APP_BULLMQ_QUEUES.DEVICE_STATUS },
      { name: APP_BULLMQ_QUEUES.PUSH_NOTIFICATION },
    ),
  ],
  providers: [
    EmailProcessorWorker,
    DeviceControlProcessor,
    DeviceStatusProcessor,
    NotificationProcessor,
    MidNightScheduleWorker,
  ],
})
export class AppModule {}
