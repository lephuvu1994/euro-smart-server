# Device State Attribution (Source Tracking)

> Tài liệu mô tả kiến trúc ghi nhận **ai / nguồn nào** đã thay đổi trạng thái thiết bị.
> Áp dụng cho toàn bộ thiết bị trong hệ thống (Curtain, Switch, Lock, Climate, ...).

## 1. Tổng quan

Mỗi khi trạng thái thiết bị thay đổi (ON/OFF, OPEN/CLOSE, LOCK/UNLOCK, ...), hệ thống cần ghi nhận:
- **Source** (nguồn): `app`, `physical`, `rf`, `ble`, `system`, `automation`
- **User ID** (nếu source = `app`): ai đã bấm trên App

Thông tin này hiển thị trên **Timeline** (Lịch sử hoạt động) và **Push Notification**.

### Thiết kế theo chuẩn

| Platform | Cách tiếp cận |
|:---|:---|
| **Tuya** | Cloud logs ghi nhận Operator từ API caller. Firmware không báo source. |
| **Home Assistant** | Context Object gắn `user_id` + `parent_id` xuyên suốt chuỗi sự kiện. |
| **Hệ thống này** | Hybrid: Firmware báo `source` field trong MQTT status + Server duy trì `cmd_user` cache để ghi nhận User ID. |

> **Nguyên tắc**: Server là **source of truth** cho attribution. Firmware báo source để hỗ trợ fallback, nhưng Server ưu tiên dùng `cmd_user` cache.

---

## 2. Luồng dữ liệu (Data Flow)

### 2.1. User bấm trên App

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  App    │────▶│ Worker       │────▶│ MQTT Broker  │────▶│ Firmware │
│ (User)  │     │ (cmd_user    │     │ device/.../  │     │ (chip)   │
│         │     │  cache=120s) │     │ set          │     │          │
└─────────┘     └──────────────┘     └──────────────┘     └──────────┘
                                                                │
                                     ┌──────────────┐           │
                                     │ IoT Gateway  │◀──────────┘
                                     │ (processState│   MQTT status
                                     │  cmd_user    │   { state, source }
                                     │  lookup)     │
                                     └──────────────┘
                                           │
                                     ┌──────────────┐
                                     │ DB History   │
                                     │ source: app  │
                                     │ userId: xxx  │
                                     └──────────────┘
```

### 2.2. User bấm nút vật lý / RF / BLE

```
┌─────────┐     ┌──────────────┐     ┌──────────────┐
│ Button  │────▶│ Firmware     │────▶│ IoT Gateway  │
│ RF/BLE  │     │ source=      │     │ cmd_user=∅   │
│         │     │ physical/rf/ │     │ fallback to  │
│         │     │ ble          │     │ rawData.source│
└─────────┘     └──────────────┘     └──────────────┘
                                           │
                                     ┌──────────────┐
                                     │ DB History   │
                                     │ source:      │
                                     │ physical/rf  │
                                     │ userId: null │
                                     └──────────────┘
```

---

## 3. Kiến trúc chi tiết

### 3.1. Worker Service (`device-control.processor.ts`)

Khi nhận lệnh điều khiển từ App:

```typescript
// Cache userId vào Redis SET, TTL = 120s (safety net)
const cacheKey = `cmd_user:${token}:${entityCode}`;
await this.redisService.sadd(cacheKey, userId);
await this.redisService.expire(cacheKey, 120);
```

**Tại sao TTL = 120s?**
- Thiết bị cơ học (curtain, garage door) có travel time lên đến 120s.
- TTL chỉ là safety net — Gateway chủ động xóa cache sau khi ghi history.

### 3.2. IoT Gateway (`device-state.service.ts`)

Khi nhận MQTT status từ thiết bị:

```
1. Đọc cmd_user cache → có userId? → source = "app"
2. Không có? → fallback sang rawData.source (firmware báo)
3. Kiểm tra isTransientState(domain, state)?
   ├── YES (CLOSING, OPENING, ...) → KHÔNG ghi history, KHÔNG xóa cmd_user
   └── NO  (CLOSED, OPENED, ...)   → Ghi history + Xóa cmd_user
```

> **Quan trọng**: `cmd_user` chỉ bị xóa khi trạng thái **cuối cùng** (final state) được ghi vào history.
> Trạng thái trung gian (transient state) KHÔNG tiêu thụ cache.

#### Transient States (theo Domain)

Định nghĩa tại `libs/common/src/constants/entity-domain.constant.ts`:

| Domain | Transient States | Final States |
|:---|:---|:---|
| `curtain` | OPENING, CLOSING | OPENED, CLOSED, STOPPED |
| `lock` | UNLOCKING, LOCKING | LOCKED, UNLOCKED |
| `climate` | DEFROSTING | ON, OFF |
| `update` | INSTALLING, DOWNLOADING | IDLE, DONE |

### 3.3. Source Priority (Thứ tự ưu tiên)

```typescript
const source = actionUserIds.length > 0 
  ? 'app'                           // 1. cmd_user cache (App control)
  : rawData.source || 'device';     // 2. Firmware-reported source (physical/rf/ble/system)
```

---

## 4. Firmware — Source Tracking (`app_door_controller_core.c`)

### 4.1. Biến `g_last_source`

Firmware duy trì biến `g_last_source` để giữ source gốc xuyên suốt chu kỳ transient → final state.

```c
// Valid values: "app", "physical", "rf", "ble", "system"
static const char* g_last_source = "system";
```

### 4.2. Luồng gán source theo từng nguồn lệnh

| Nguồn | Caller | Source value | Ví dụ |
|:---|:---|:---|:---|
| **MQTT** (App) | `app_cmd_parser.c` → `execute_cmd_string(cmd, "app")` | `"app"` | User bấm CLOSE trên điện thoại |
| **Nút vật lý** | `handle_button_event()` → `execute_cmd_string(cmd, "physical")` | `"physical"` | Bấm nút trên tường |
| **RF Remote** | `sm_handle_hardware_control()` → `execute_cmd_string(cmd, "rf")` | `"rf"` | Bấm remote RF |
| **BLE** | `app_ble.c` → `execute_cmd_string(cmd, "ble")` | `"ble"` | Điều khiển qua Bluetooth |
| **System** | `auto_stop_callback()`, `init()` | `g_last_source` hoặc `"system"` | Timer hết hành trình, khởi động |

### 4.3. Lifecycle của `g_last_source`

```
Khởi tạo: g_last_source = "system"
    │
    ▼
execute_cmd_string("OPEN", "app")
    ├── g_last_source = "app"           ← GÁN source gốc
    ├── notify(OPENING, "app")          ← Transient state
    │
    ▼  (20 giây sau - timer fires)
auto_stop_callback()
    ├── notify(OPENED, g_last_source)   ← Final state, dùng "app" thay vì "system"
    │
    ▼
execute_cmd_string("CLOSE", "physical")
    ├── g_last_source = "physical"      ← CẬP NHẬT source mới
    ├── notify(CLOSING, "physical")
    │
    ▼  (20 giây sau)
auto_stop_callback()
    └── notify(CLOSED, g_last_source)   ← "physical"
```

### 4.4. Các lệnh tức thời (không cần `g_last_source`)

STOP, LOCK, UNLOCK, DIR_REV, DIR_FWD — không khởi động timer, source được truyền trực tiếp:

```c
// STOP — tức thời, dùng source trực tiếp
notify_status_change(false, source);

// LOCK — tức thời
notify_status_change(false, source);
```

---

## 5. Quy tắc khi thêm thiết bị mới

Khi thêm loại thiết bị mới có trạng thái trung gian (transient state):

### Server
1. Thêm domain vào `TRANSIENT_STATES_BY_DOMAIN` trong `entity-domain.constant.ts`
2. Đảm bảo `cmd_user` TTL (120s) đủ cho travel time của thiết bị

### Firmware
1. Trong hàm xử lý lệnh dài (có timer), lưu `source` vào biến cục bộ trước khi khởi động timer
2. Timer callback dùng biến đã lưu thay vì hard-code `"system"`
3. MQTT status payload luôn bao gồm field `"source"` để hỗ trợ fallback

---

## 6. Changelog

| Ngày | Thay đổi |
|:---|:---|
| 2026-04-12 | Fix: Firmware `auto_stop_callback` dùng `g_last_source` thay vì `"system"` |
| 2026-04-12 | Fix: Gateway defer `cmd_user` deletion đến final state |
| 2026-04-12 | Fix: Worker TTL `cmd_user` tăng từ 10s → 120s |
