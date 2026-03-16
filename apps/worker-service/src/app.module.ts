import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { configs, APP_BULLMQ_QUEUES } from '@app/common';
import { CustomLoggerModule } from '@app/common/logger/logger.module';
import { HelperModule } from '@app/common/helper/helper.module';
import { IntegrationModule } from '@app/common';
import { EmailProcessorWorker } from './processors/email.processor';
import { DeviceControlProcessor } from './processors/device-control.processor';
import { MidNightScheduleWorker } from './schedulers/midnight.scheduler';

@Module({
    imports: [
        ConfigModule.forRoot({ load: configs, isGlobal: true, cache: true, envFilePath: ['.env'], expandVariables: true }),
        DatabaseModule, RedisModule, CustomLoggerModule, HelperModule, ScheduleModule.forRoot(), IntegrationModule,
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
            { name: APP_BULLMQ_QUEUES.DEVICE_STATUS }
        ),
    ],
    providers: [EmailProcessorWorker, DeviceControlProcessor, MidNightScheduleWorker],
})
export class AppModule {}
