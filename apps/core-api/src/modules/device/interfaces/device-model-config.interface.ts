/**
 * DeviceModel Blueprint Config Types
 *
 * Định nghĩa cấu trúc JSON config cho DeviceModel (Blueprint).
 * Config được lưu trong cột JSONB `config` của bảng `t_device_model`.
 *
 * Cấu trúc chuẩn:
 * {
 *   "entities": [ { code, name, domain, commandKey, attributes: [...] } ],
 *   ... các field mở rộng khác
 * }
 */

// ─── Attribute (thuộc tính phụ của Entity) ───────────────────

export interface IBlueprintAttribute {
  /** Mã thuộc tính (VD: "brightness", "color_temp", "mode") */
  key: string;

  /** Tên hiển thị (VD: "Độ sáng", "Nhiệt độ màu") */
  name: string;

  /** Loại giá trị: NUMBER, STRING, BOOLEAN, ENUM, COLOR, JSON */
  valueType: string;

  /** Giá trị min (cho NUMBER) */
  min?: number | null;

  /** Giá trị max (cho NUMBER) */
  max?: number | null;

  /** Đơn vị (VD: "%", "°C", "K") */
  unit?: string | null;

  /** Thuộc tính chỉ đọc (sensor) */
  readOnly?: boolean;

  /** Danh sách giá trị enum (cho ENUM type) */
  enumValues?: string[];

  /** MQTT command key (nếu khác key mặc định) */
  commandKey?: string;

  /** Cấu hình mở rộng */
  config?: Record<string, unknown>;

  /** Cho phép mở rộng thêm field */
  [key: string]: unknown;
}

// ─── Entity (đơn vị điều khiển: kênh đèn, switch, sensor...) ──

export interface IBlueprintEntity {
  /** Mã entity (VD: "main", "channel_1", "temperature") */
  code: string;

  /** Tên hiển thị (VD: "Đèn chính", "Kênh 1") */
  name: string;

  /** Entity domain: light, switch_, sensor, camera, lock, curtain, climate, button */
  domain: string;

  /** MQTT command key cho primary state (VD: "state", "switch_1") */
  commandKey?: string;

  /** MQTT command suffix (VD: "/set") */
  commandSuffix?: string;

  /** Entity chỉ đọc (sensor) */
  readOnly?: boolean;

  /** Thứ tự hiển thị */
  sortOrder?: number;

  /** Danh sách attributes (thuộc tính phụ) */
  attributes?: IBlueprintAttribute[];

  /** Cho phép mở rộng thêm field */
  [key: string]: unknown;
}

// ─── DeviceModel Config (top-level) ─────────────────────────

export interface IDeviceModelConfig {
  /** Danh sách entities (bắt buộc) */
  entities: IBlueprintEntity[];

  /** Cho phép mở rộng thêm field (VD: protocol, metadata, uiHints...) */
  [key: string]: unknown;
}
