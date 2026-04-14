import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import * as redisStore from 'cache-manager-ioredis';

import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { configs } from '@app/common';
import { AuthModule } from '@app/common/auth/auth.module';
import { CustomLoggerModule } from '@app/common/logger/logger.module';
import { RequestModule } from '@app/common/request/request.module';
import { ResponseModule } from '@app/common/response/response.module';
import { VietguysModule } from '@app/common/vietguys/vietguys.module';
import { SmsSimModule } from '@app/common/sms-sim/sms-sim.module';
import { HelperModule } from '@app/common/helper/helper.module';

import { HealthController } from './controllers/health.controller';
import { UserModule } from './modules/user/user.module';
import { AdminModule } from './modules/admin/admin.module';
import { DeviceModule } from './modules/device/device.module';
import { HomeModule } from './modules/home/home.module';
import { SceneModule } from './modules/scene/scene.module';
import { EmqxAuthModule } from './modules/emqx-auth/emqx-auth.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configs,
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      expandVariables: true,
    }),
    // Rate limiting: 100 requests per minute per IP (global)
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    DatabaseModule,
    RedisModule,
    AuthModule,
    VietguysModule,
    SmsSimModule,
    HelperModule,
    CustomLoggerModule,
    RequestModule,
    ResponseModule,
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (cs: ConfigService) => ({
        isGlobal: true,
        store: redisStore,
        host: cs.get('redis.host'),
        port: cs.get('redis.port'),
        password: cs.get('redis.password'),
        tls: cs.get('redis.tls'),
        ttl: 5000,
      }),
      inject: [ConfigService],
    }),
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
    TerminusModule,
    UserModule,
    AdminModule,
    DeviceModule,
    HomeModule,
    SceneModule,
    EmqxAuthModule,
    AutomationModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
