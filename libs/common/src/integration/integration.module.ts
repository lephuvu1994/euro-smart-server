import { Module, Global } from '@nestjs/common';
import { MqttModule } from '../mqtt/mqtt.module';
import { IntegrationManager } from './registry/integration.manager';
import { MqttGenericDriver } from './drivers/mqtt-generic.driver';
import { ZigbeeGenericDriver } from './drivers/zigbee.generic.driver';

@Global()
@Module({
    imports: [MqttModule],
    providers: [IntegrationManager, MqttGenericDriver, ZigbeeGenericDriver],
    exports: [IntegrationManager],
})
export class IntegrationModule {}
