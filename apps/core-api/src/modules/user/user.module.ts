import { Module } from '@nestjs/common';

import { DatabaseModule } from '@app/database';
import { HelperModule } from '@app/common/helper/helper.module';

import { UserAdminController } from './controllers/user.admin.controller';
import { UserPublicController } from './controllers/user.public.controller';
import { UserSessionController } from './controllers/user-session.controller';
import { UserService } from './services/user.service';
import { UserSessionService } from './services/user-session.service';

@Module({
  imports: [HelperModule, DatabaseModule],
  controllers: [
    UserAdminController,
    UserPublicController,
    UserSessionController,
  ],
  providers: [UserService, UserSessionService],
  exports: [UserService, UserSessionService],
})
export class UserModule {}
