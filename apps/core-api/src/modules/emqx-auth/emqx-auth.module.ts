import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
import { EmqxAuthController } from './controllers/emqx-auth.controller';
import { EmqxAuthService } from './services/emqx-auth.service';

@Module({
  imports: [DatabaseModule, RedisModule],
  controllers: [EmqxAuthController],
  providers: [EmqxAuthService],
  exports: [EmqxAuthService],
})
export class EmqxAuthModule {}
