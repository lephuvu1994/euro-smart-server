import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DeviceController } from './controllers/device.controller';
// import { DeviceControlProcessor } from './processors/device-control.processor';
import { APP_BULLMQ_QUEUES } from '@app/common';
import { DatabaseModule } from '@app/database';
import { RedisModule } from '@app/redis-cache';
// import { SocketModule } from '../socket/socket.module';
// import { IntegrationModule } from '../integration/integration.module';
import { SceneModule } from '@euro-smart-server/modules/scene';
import { DeviceProvisioningService } from './services/device-provisioning.service';
import { DeviceControlService } from './services/device-control.service';
import { DeviceService } from './services/device.service';

@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    // SocketModule,
    BullModule.registerQueue({
      name: APP_BULLMQ_QUEUES.DEVICE_CONTROL,
    }),
    // IntegrationModule,
    SceneModule,
  ],
  controllers: [DeviceController],
  providers: [
    DeviceService,
    DeviceProvisioningService,
    DeviceControlService,
    // DeviceControlProcessor,
  ],
})
export class DeviceModule {}
