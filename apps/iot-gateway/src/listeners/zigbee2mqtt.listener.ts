import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { MqttService } from '@app/common/mqtt/mqtt.service';
import { DeviceStatusService } from '../services/device-status.service';
import { DeviceStateService } from '../services/device-state.service';

/**
 * Mock Listener for Zigbee2MQTT integration.
 * This demonstrates how the refactored core state/status services can be reused
 * by a completely different inbound protocol/topic structure.
 */
@Injectable()
export class Zigbee2MqttListener implements OnApplicationBootstrap {
  private readonly logger = new Logger(Zigbee2MqttListener.name);

  constructor(
    private mqttService: MqttService,
    private deviceStatusService: DeviceStatusService,
    private deviceStateService: DeviceStateService,
  ) {}

  onApplicationBootstrap() {
    // Example: zigbee2mqtt/[FRIENDLY_NAME] (State/Telemetry)
    this.mqttService.subscribe(
      'zigbee2mqtt/+',
      this.handleDeviceMessage.bind(this),
      { qos: 0 },
    );

    // Example: zigbee2mqtt/[FRIENDLY_NAME]/availability (Status)
    this.mqttService.subscribe(
      'zigbee2mqtt/+/availability',
      this.handleAvailabilityMessage.bind(this),
      { qos: 0 },
    );

    this.logger.log('Zigbee2MqttListener initialized subscribers');
  }

  private async handleAvailabilityMessage(topic: string, payload: Buffer) {
    const token = this.extractToken(topic);
    if (!token || (Number.isNaN(Number(token)) && token === 'bridge')) return; // Skip bridge messages for now

    try {
      const rawData = JSON.parse(payload.toString());
      // Z2M availability payload typically looks like: { "state": "online" } or { "state": "offline" }
      const isOnline = rawData.state === 'online';

      // Standardize the payload to what our core service expects: { online: boolean }
      const standardizedPayload = { online: isOnline, ...rawData };

      await this.deviceStatusService.processStatus(token, standardizedPayload);
    } catch (e) {
      this.logger.error(
        `Failed to parse Z2M availability for ${token}: ${e.message}`,
      );
    }
  }

  private async handleDeviceMessage(topic: string, payload: Buffer) {
    // Note: z2m also publishes to zigbee2mqtt/bridge/... which we should ignore
    if (topic.startsWith('zigbee2mqtt/bridge')) return;

    const token = this.extractToken(topic);
    if (!token) return;

    try {
      const rawData = JSON.parse(payload.toString());
      // The Z2M payload usually contains standard snake_case keys (e.g. state_l1, brightness)
      // As long as the generic `commandKey` and `attribute.key` in PostgreSQL match the Z2M keys,
      // the `processState` service will automatically map them without any extra work!
      await this.deviceStateService.processState(token, rawData);
    } catch (e) {
      this.logger.error(
        `Invalid JSON in Z2M message from ${token}: ${e.message}`,
      );
    }
  }

  private extractToken(topic: string): string {
    const parts = topic.split('/');
    // Topic: "zigbee2mqtt/[FRIENDLY_NAME]" or "zigbee2mqtt/[FRIENDLY_NAME]/availability"
    if (parts.length >= 2) {
      return parts[1];
    }
    return null;
  }
}
