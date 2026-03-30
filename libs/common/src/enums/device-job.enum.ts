export enum DEVICE_JOBS {
  CONTROL_CMD = 'control_cmd',
  CONTROL_DEVICE_VALUE_CMD = 'control_device_value_cmd',
  /** Chỉ đẩy job con theo từng thiết bị, không thực thi trong job này */
  RUN_SCENE = 'run_scene',
  /** Thực thi gộp toàn bộ action của 1 thiết bị (setValueBulk) - xử lý song song với các thiết bị khác */
  SCENE_DEVICE_ACTIONS = 'scene_device_actions',
  /** Đánh giá scene có trigger DEVICE_STATE khi thiết bị báo state thay đổi */
  CHECK_DEVICE_STATE_TRIGGERS = 'check_device_state_triggers',
  UPDATE_LAST_SEEN = 'update_last_seen',
  SAVE_TELEMETRY = 'save_telemetry',
  /** Ghi lịch sử thay đổi trạng thái entity (OPEN/CLOSE/ON/OFF...) */
  RECORD_STATE_HISTORY = 'record_state_history',
  /** Ghi lịch sử kết nối thiết bị (online/offline) */
  RECORD_CONNECTION_LOG = 'record_connection_log',
  /** Gửi lệnh unbind (factory reset) xuống chip trước khi xóa DB */
  UNBIND_DEVICE = 'unbind_device',
  /** Hard-delete Device sau khi iot-gateway đã gửi unbind cho chip */
  HARD_DELETE_DEVICE = 'hard_delete_device',
}
