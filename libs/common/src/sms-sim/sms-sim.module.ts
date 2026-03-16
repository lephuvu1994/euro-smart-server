import { Global, Module } from '@nestjs/common';
import { SmsSimService } from './sms-sim.service';

@Global()
@Module({
  providers: [SmsSimService],
  exports: [SmsSimService],
})
export class SmsSimModule {}
