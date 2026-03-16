import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { configs, APP_BULLMQ_QUEUES } from '@app/common';
import { MqttModule } from '@app/common/mqtt/mqtt.module';
import { CustomLoggerModule } from '@app/common/logger/logger.module';
import { IntegrationModule } from '@app/common';
import { MqttInboundService } from './listeners/mqtt-inbound.service';

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
    MqttModule,
    CustomLoggerModule,
    IntegrationModule,
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
      { name: APP_BULLMQ_QUEUES.DEVICE_STATUS },
      { name: APP_BULLMQ_QUEUES.DEVICE_CONTROL },
    ),
  ],
  providers: [MqttInboundService],
  exports: [],
})
export class AppModule {}
