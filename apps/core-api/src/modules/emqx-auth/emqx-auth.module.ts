import { Module } from '@nestjs/common';
import { DatabaseModule } from '@app/database';
import { EmqxAuthController } from './controllers/emqx-auth.controller';
import { EmqxAuthService } from './services/emqx-auth.service';

@Module({
  imports: [DatabaseModule],
  controllers: [EmqxAuthController],
  providers: [EmqxAuthService],
  exports: [EmqxAuthService],
})
export class EmqxAuthModule {}
