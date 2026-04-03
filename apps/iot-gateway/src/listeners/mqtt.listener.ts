import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { DeviceStatusService } from '../services/device-status.service';
import { DeviceStateService } from '../services/device-state.service';

@Injectable()
export class MqttListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(MqttListener.name);

  constructor(
    private mqttService: MqttService,
    private deviceStatusService: DeviceStatusService,
    private deviceStateService: DeviceStateService,
  ) {}

  onApplicationBootstrap() {
    // QoS 0: Status/heartbeat
    this.mqttService.subscribe(
      '+/+/+/status',
      this.handleStatusMessage.bind(this),
      { qos: 0 },
    );
    // QoS 0: Telemetry — sensor data
    this.mqttService.subscribe(
      '+/+/+/telemetry',
      this.handleTelemetryMessage.bind(this),
      { qos: 0 },
    );
    // QoS 1: State feedback — device control response
    this.mqttService.subscribe(
      '+/+/+/state',
      this.handleStateMessage.bind(this),
      { qos: 1 },
    );

    this.logger.log('MqttListener initialized subscribers');
  }

  private async handleStatusMessage(topic: string, payload: Buffer) {
    const deviceToken = this.extractToken(topic);
    if (!deviceToken) return;

    try {
      const rawData = JSON.parse(payload.toString());
      await this.deviceStatusService.processStatus(deviceToken, rawData);
    } catch (error) {
      this.logger.error(
        `Failed to parse status message for ${deviceToken}: ${error.message}`,
      );
    }
  }

  private async handleTelemetryMessage(_topic: string, _payload: Buffer) {
    // TODO: Forward to generic telemetry processor (TimescaleDB)
  }

  public async handleStateMessage(topic: string, payload: Buffer) {
    const token = this.extractToken(topic);
    if (!token) return;

    try {
      const rawData = JSON.parse(payload.toString());
      await this.deviceStateService.processState(token, rawData);
    } catch (e) {
      this.logger.error(
        `Invalid JSON in state message from ${token}: ${e.message}`,
      );
    }
  }

  private extractToken(topic: string): string {
    if (!topic || typeof topic !== 'string') {
      return null;
    }

    const parts = topic.split('/');
    if (!parts || parts.length < 4) {
      this.logger.error(`Invalid topic format: ${topic}`);
      return null;
    }
    // Topic: "COMPANY_A/DEVICE_CODE/DEVICE_TOKEN/status"
    return parts[2];
  }
}
