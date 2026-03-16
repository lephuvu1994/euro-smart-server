import { Global, Module } from '@nestjs/common';
import { VietguysService } from './vietguys.service';

@Global()
@Module({
  providers: [VietguysService],
  exports: [VietguysService],
})
export class VietguysModule {}
