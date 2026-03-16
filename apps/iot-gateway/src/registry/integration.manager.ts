// src/modules/integration/registry/integration.manager.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { DeviceProtocol } from '@prisma/client'; // Enum từ Prisma
import { IDeviceDriver } from '../interfaces/device-driver.interface';
import { MqttGenericDriver } from '../drivers/mqtt-generic.driver';
// import { ZigbeeDriver } from '../drivers/zigbee.driver'; // Sau này mở rộng

@Injectable()
export class IntegrationManager implements OnModuleInit {
    private readonly logger = new Logger(IntegrationManager.name);

    // Nơi lưu trữ các driver: Map<'MQTT_WIFI', MqttDriverInstance>
    private drivers = new Map<string, IDeviceDriver>();

    constructor(
        // Inject tất cả các Driver vào đây
        private mqttGenericDriver: MqttGenericDriver
        // private zigbeeDriver: ZigbeeDriver,
    ) {}

    onModuleInit() {
        // Đăng ký Driver vào hệ thống khi khởi động
        this.register(DeviceProtocol.MQTT, this.mqttGenericDriver);

        // Ví dụ sau này:
        // this.register(DeviceProtocol.ZIGBEE, this.zigbeeDriver);

        this.logger.log(
            `Integration Manager initialized with ${this.drivers.size} drivers.`
        );
    }

    private register(protocol: string, driver: IDeviceDriver) {
        this.drivers.set(protocol, driver);
    }

    /**
     * Hàm này được Worker gọi để lấy Driver xử lý
     */
    getDriver(protocol: string): IDeviceDriver {
        const driver = this.drivers.get(protocol);
        if (!driver) {
            this.logger.error(
                `Protocol ${protocol} not supported or not registered.`
            );
            throw new Error(`Driver for protocol ${protocol} not found`);
        }
        return driver;
    }
}
