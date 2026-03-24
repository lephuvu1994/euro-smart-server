import { Device, DeviceEntity } from '@prisma/client';

export interface IDeviceDriver {
  /**
   * Tên hiển thị của Driver (dùng cho Log/UI)
   * VD: 'Generic MQTT Driver'
   */
  readonly name: string;
  /**
   * Hàm thực thi lệnh cho 1 entity
   * @param device Entity Device (chứa thông tin kết nối, token...)
   * @param entity DeviceEntity (chứa code: channel_1, domain: light...)
   * @param value Giá trị user gửi lên (1, 0, #FF0000, 50...)
   */
  setValue(device: Device, entity: DeviceEntity, value: any): Promise<boolean>;

  /**
   * Hàm thực thi bulk cho nhiều entities cùng 1 device
   */
  setValueBulk(device: Device, entities: DeviceEntity[]): Promise<boolean>;

  /**
   * (Optional) Hàm convert dữ liệu thô từ thiết bị về format chuẩn của server
   */
  normalizeValue?(entity: DeviceEntity, rawValue: any): any;
}
