import { Module } from '@nestjs/common';
import { CommandModule } from 'nestjs-command';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@app/database';
import { configs } from '@app/common';
import { HelperModule } from '@app/common/helper/helper.module';
import { CustomLoggerModule } from '@app/common/logger/logger.module';
import { AdminMigrationSeed } from './admin.seed';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: configs,
      isGlobal: true,
      cache: true,
      envFilePath: ['.env'],
      expandVariables: true,
    }),
    CustomLoggerModule,
    DatabaseModule,
    HelperModule,
    CommandModule,
  ],
  providers: [AdminMigrationSeed],
  exports: [AdminMigrationSeed],
})
export class MigrationModule {}
