import { Device, DeviceFeature } from '@prisma/client';

export interface IDeviceDriver {
  /**
   * Tên hiển thị của Driver (dùng cho Log/UI)
   * VD: 'Generic MQTT Driver'
   */
  readonly name: string;
  /**
   * Hàm thực thi lệnh
   * @param device Entity Device (chứa thông tin kết nối, token...)
   * @param feature Entity Feature (chứa code: switch_1, type: binary...)
   * @param value Giá trị user gửi lên (1, 0, #FF0000, 50...)
   */
  setValue(
    device: Device,
    feature: DeviceFeature,
    value: any,
  ): Promise<boolean>;

  setValueBulk(device: Device, features: DeviceFeature[]): Promise<boolean>;

  /**
   * (Optional) Hàm convert dữ liệu thô từ thiết bị về format chuẩn của server
   */
  normalizeValue?(feature: DeviceFeature, rawValue: any): any;
}
