import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiAppController } from './ai.app.controller';
import { AiService } from './ai.service';

@Module({
  controllers: [AiController, AiAppController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
