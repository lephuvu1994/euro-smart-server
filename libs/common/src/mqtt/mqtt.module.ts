import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MqttService } from './mqtt.service';

@Global() // [Optional] Đánh dấu Global nếu bạn muốn dùng ở mọi nơi mà không cần import lại
@Module({
    imports: [ConfigModule], // Cần Config để lấy MQTT_HOST, MQTT_PORT
    providers: [MqttService],
    exports: [MqttService], // Export để IntegrationModule dùng được
})
export class MqttModule {}
