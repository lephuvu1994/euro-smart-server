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
}
