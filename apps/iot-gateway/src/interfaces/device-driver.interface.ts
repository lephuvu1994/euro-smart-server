// Re-export from libs/common to avoid duplication
// TODO: Consolidate — iot-gateway should import directly from @app/common
import { Device, DeviceEntity } from '@prisma/client';

export interface IDeviceDriver {
  readonly name: string;
  setValue(device: Device, entity: DeviceEntity, value: any): Promise<boolean>;
  setValueBulk(device: Device, entities: DeviceEntity[]): Promise<boolean>;
  normalizeValue?(entity: DeviceEntity, rawValue: any): any;
}
