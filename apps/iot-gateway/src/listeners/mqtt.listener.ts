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
      'device/+/status',
      this.handleStatusMessage.bind(this),
      { qos: 0 },
    );
    // QoS 0: Telemetry — sensor data
    this.mqttService.subscribe(
      'device/+/telemetry',
      this.handleTelemetryMessage.bind(this),
      { qos: 0 },
    );
    // QoS 1: State feedback — device control response
    this.mqttService.subscribe(
      'device/+/state',
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

  private async handleTelemetryMessage(topic: string, payload: Buffer) {
    const token = this.extractToken(topic);
    if (!token) return;

    try {
      const rawData = JSON.parse(payload.toString());
      // Telemetry uses the same entity→attribute mapping as state messages
      await this.deviceStateService.processState(token, rawData);
    } catch (error) {
      this.logger.error(
        `Failed to parse telemetry message for ${token}: ${error.message}`,
      );
    }
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
    // Topic: "device/{token}/status"
    if (parts.length < 3 || parts[0] !== 'device') {
      this.logger.error(`Invalid topic format: ${topic}`);
      return null;
    }
    return parts[1];
  }
}
