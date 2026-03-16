import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import { APP_BULLMQ_QUEUES } from '../enums/app.enum';

import { DatabaseModule } from '@app/database';
import { HelperModule } from '../helper/helper.module';

import { AuthPublicController } from './controllers/auth.public.controller';
import { JwtAccessStrategy } from './providers/access-jwt.strategy';
import { JwtRefreshStrategy } from './providers/refresh-jwt.strategy';
import { AuthService } from './services/auth.service';

@Module({
  controllers: [AuthPublicController],
  imports: [
    HelperModule,
    PassportModule,
    DatabaseModule,
    // Đăng ký lại queue email
    BullModule.registerQueue({
      name: APP_BULLMQ_QUEUES.EMAIL,
    }),
  ],
  providers: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
  exports: [AuthService, JwtAccessStrategy, JwtRefreshStrategy],
})
export class AuthModule {}
