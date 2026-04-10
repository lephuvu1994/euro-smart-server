# Smart Home - To Do List Tính Năng Mới

Tài liệu này dùng để theo dõi, phân tích và lên kế hoạch (To-Do) cho các tính năng hệ thống chuẩn bị phát triển, giúp duy trì ngữ cảnh cho AI và team.

---

## Tính năng 1: Smart Scene (Ngữ cảnh / Tự động hóa)

**Trạng thái**: ✅ Core đã triển khai. Đang optimize scale 50k–200k thiết bị.

### 1. Mô tả tổng quan

Tính năng "Scene" cho phép người dùng nhóm nhiều hành động điều khiển thiết bị lại với nhau và tự động hóa chúng dựa trên các sự kiện hoặc thời gian (If - Then).
Thay vì điều khiển thủ công, hệ thống tự động nhận diện **Nguồn kích hoạt (Trigger)** và phát lệnh đồng thời hàng loạt **Hành động (Action)** xuống mạch phần cứng.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api & worker-service)**

- [x] Cấu trúc lại Database Schema cho `Scene`: triggers (JSON) và actions (JSON) với logic AND/OR.
- [x] Phát triển **Scene Rule Engine**: `handleCheckDeviceStateTriggers` trong `DeviceControlProcessor` evaluate conditions từ Redis.
- [x] Phát triển Scheduler Worker: `SceneScheduleCronService` trong `worker-service` với distributed Redis lock.
- [x] Phát triển **Action Executor**: `handleSceneDeviceActions` → MQTT `driver.setValueBulk` + realtime `socket:emit`.
- [x] Redis Reverse-Index: `SceneTriggerIndexService` — O(1) lookup `scene_trigger:device:{token}` → Set\<sceneId\>.
- [x] API Endpoints: GET/POST/PATCH/DELETE /v1/scenes + POST /v1/scenes/:id/run + POST /v1/scenes/triggers/location.

👉 **Phía Mobile App (new-app)**: Chuyển sang theo dõi tại repo `new-app` ở đường dẫn `../../new-app/.agents/smarthome_todo.md`

**C. Phía Thiết bị Nhúng (Firmware: switch_door)**

- [ ] Tối ưu hóa MQTT Receiver: Khi một Scene kích hoạt nhiều thiết bị cùng lúc, thiết bị nhận cần chịu tải không bị miss bản tin.
- [ ] Tối ưu hóa hiệu năng đo báo trạng thái: Rút ngắn delay khi công tắc chuyển trạng thái để báo về Server làm Trigger.

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Engine chạy trên đám mây (Cloud) hoàn toàn hay hỗ trợ Local Scene (Offline)?
- Việc thực thi Scene Actions có hỗ trợ Delay không? (VD: Đóng rèm, 10 giây sau tắt đèn). Nếu có, BullMQ Delayed jobs.
- Xử lý xung đột (Collision): Scene 1 mở công tắc, trùng thời điểm Scene 2 tắt công tắc → cần priority.

---

## Tính năng 2: Device Sharing (Chia sẻ thiết bị)

**Trạng thái**: ✅ Đã hoàn thành (cả Backend và App).

### 1. Mô tả tổng quan

Tính năng cho phép chủ sở hữu thiết bị (Owner) có thể chia sẻ quyền điều khiển và quản lý thiết bị cho các thành viên khác trong gia đình hoặc khách. Hệ thống cần đảm bảo tính phân quyền (Admin, Editor, Viewer) và bảo mật khi thu hồi quyền truy cập.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api)**

- [x] Phát triển API tạo lời mời chia sẻ (Share Invitation): Nhận thẳng username/email qua DTO, cập nhật `AddDeviceShareDto`.
- [x] Phát triển API chấp nhận chia sẻ: Tự động lưu và cập nhật trạng thái `DeviceShare` V1.
- [x] Quản lý phân quyền (Permissions): Xây dựng phân tầng Owner thao tác chia sẻ thiết bị (Chặn Viewer/Editor).
- [x] Logic thu hồi (Revoke): Chủ sở hữu có thể ngắt kết nối (Xóa) người dùng khỏi quyền truy cập thiết bị.
- [x] Notification: Thiết lập Document chuẩn bị bắn qua socket.

**B. Kịch bản Kích hoạt qua Link / Mã QR (Deep Link Sharing)**

- [ ] Schema: Tạo bảng `DeviceShareToken` liên kết với `deviceId`, lưu thời hạn `expiresAt` và trạng thái hiệu lực.
- [ ] API Generate Link: `POST /v1/devices/:id/shares/tokens` trả về mã code token tạm thời.
- [ ] API Preview Share: `GET /v1/devices/shares/tokens/:token` (Public/Auth) để xem hiển thị popup đồng ý/từ chối.
- [ ] API Accept Share: `POST /v1/devices/shares/tokens/:token/accept` thao tác đổi token sang mapping vào `DeviceShare`.

👉 **Phía Mobile App (new-app)**: Chuyển sang theo dõi tại repo `new-app` ở đường dẫn `../../new-app/.agents/smarthome_todo.md`

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Cơ chế mời qua cái gì là tối ưu nhất? (Email link, QR Code quét trực tiếp, hay nhập số điện thoại ID người dùng).
- Có giới hạn số lượng người được chia sẻ trên một thiết bị không?
- Khi chủ sở hữu xóa thiết bị (Unbind), tất cả các liên kết chia sẻ có tự động bị xóa sạch không? (Dự kiến là có).

---

## Tính năng 3: Timer & Schedule (Hẹn giờ và Lịch trình)

**Trạng thái**: ✅ Backend đã triển khai. ✅ **Đã hoàn thành UI App**.

### 1. Mô tả tổng quan

Cho phép người dùng đặt lịch bật/tắt thiết bị theo thời gian cố định, đếm ngược hoặc lặp lại theo các ngày trong tuần.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: worker-service)**

- [x] Xây dựng bảng `DeviceTimer` và `DeviceSchedule`.
- [x] Tích hợp BullMQ để quản lý các Jobs đếm ngược (Countdown).
- [x] Xây dựng Scheduler (Cron) cursor-based pagination để quét và thực thi các lịch trình.
- [x] API: POST/GET/DELETE timers, POST/GET/DELETE/PATCH(toggle) schedules.
- [x] Store `jobId` vào `DeviceTimer` để hỗ trợ cancel job đang pending.
- [x] **fix(automation)**: Sửa bug route `/v1/v1/automation` → `/v1/automation` (controller dùng manual `v1/` prefix trong khi NestJS URI versioning đã thêm tự động).

**B. Phía Mobile App (eec-app-smarthome)**

- [x] `automationService.ts` — API client cho timers + schedules (CRUD).
- [x] `DeviceActionBar` — Bottom action bar dùng chung cho **tất cả** detail screens.
  - Single entity: 2 button (Đếm ngược, Hẹn giờ)
  - Group entity (nhiều switch): 4 button (Bật tất, Tắt tất, Đếm ngược, Hẹn giờ)
- [x] `CountdownModal` — Bottom sheet chọn giờ/phút/giây (wheel) + toggle trạng thái BẬT/TẮT.
  - Group: thêm TabView chọn switch cụ thể phía trên wheel.
- [x] `SelectEntitySheet` — Bottom sheet chọn switch (dùng cho group trước khi vào Schedule Editor).
- [x] `ScheduleEditorScreen` — Màn hình hẹn giờ (`/device/[id]/schedule` route).
  - Chọn giờ (TimePicker)
  - Chọn ngày lặp lại Mon–Sun (multi-select)
  - Toggle bật/tắt lịch
  - Header nút Lưu
  - List các schedule đang có + toggle bật/tắt từng cái
- [x] Tích hợp `DeviceActionBar` vào `SwitchDetailScreen`, `CurtainDetailScreen`, `LightDetailScreen`, `ClimateDetailScreen`.

### 3. API Contract (đã verify hoạt động)

```json
POST /v1/automation/timers
{
  "targetType": "DEVICE_ENTITY",
  "targetId": "entity-uuid",
  "service": "device-control",
  "executeAt": "2026-04-05T03:00:00.000Z",
  "actions": [{ "value": 0 }]
}

POST /v1/automation/schedules
{
  "name": "Tắt đèn hằng đêm",
  "targetType": "DEVICE_ENTITY",
  "targetId": "entity-uuid",
  "service": "device-control",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "timeOfDay": "22:00",
  "timezone": "Asia/Ho_Chi_Minh",
  "actions": [{ "value": 0 }]
}

GET  /v1/automation/timers
GET  /v1/automation/schedules
DELETE /v1/automation/timers/:id
DELETE /v1/automation/schedules/:id
PATCH  /v1/automation/schedules/:id/toggle   { "isActive": true/false }
```

## Tính năng 5: Update User Profile (Cập nhật thông tin cá nhân)

**Trạng thái**: ✅ Đã hoàn thành (Cả Server và Mobile).

### 1. Mô tả tổng quan

Cho phép người dùng thay đổi thông tin định danh cá nhân như Tên (First Name), Họ (Last Name) và ảnh đại diện (Avatar). Đây là bước cơ bản để cá nhân hóa trải nghiệm người dùng trong hệ thống nhà thông minh.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api)**

- [x] Phát triển API Endpoint `PUT /v1/user`: Cập nhật thông tin `firstName`, `lastName`, `avatar`.
- [x] Tích hợp xử lý Upload ảnh Avatar: Chuyển sang upload qua Cloudinary trên App, BE chỉ nhận link.
- [x] Validation nâng cao: Kiểm tra độ dài, ký tự đặc biệt cho tên người dùng.
- [x] Thực hiện Manual Verify (Kiểm tra thực tế luồng upload avatar, update state, UI phản hồi) trên thiết bị thật / simulator.

👉 **Phía Mobile App (new-app)**: Chuyển sang theo dõi tại repo `new-app` ở đường dẫn `../../new-app/.agents/smarthome_todo.md`

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Có nên cho phép đổi Số điện thoại / Email tại đây không? (Thường cần qua luồng OTP riêng để đảm bảo bảo mật).
- Kích thước ảnh tối đa cho Avatar là bao nhiêu để tối ưu dung lượng lưu trữ?

---

## ⚙️ Scalability Engine Refactor (50k–200k devices)

**Trạng thái**: ✅ Hoàn thành — Score: **9.5/10**.
**Last phase**: Thực hiện Phase 4 (Redis Caching) & Phase 5 (Any Type Elimination, Code Quality). Đã pass toàn bộ 200+ Unit Tests.

### Đã hoàn thành ✅

| Item                | Mô tả                                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Single Consumer     | Xóa `core-api/device-control.processor.ts` (450 dòng dead code). Worker là consumer duy nhất. |
| socket:emit notify  | Merge realtime notify vào worker: `COMMAND_SENT`/`COMMAND_ERROR` cho cả 3 handlers            |
| Cursor batch cron   | `ScheduleCronService`: 500 records/page, bulk raw SQL UPDATE, không còn OOM                   |
| Optimistic payload  | `AutomationProcessor`: 0 DB reads trên hot path, full payload từ cron                         |
| Redis Reverse-Index | `SceneTriggerIndexService` tạo và export từ `@app/common`                                     |
| SceneService index  | `createScene`/`updateScene`/`deleteScene` gọi `rebuildIndex`/`removeIndex`                    |
| Scene cron → worker | `SceneScheduleCronService` + distributed Redis lock chống duplicate fire                      |
| Redis Cache Layers  | Giải quyết nghẽn DB bằng Cache-aside 5min TTL cho `getCachedDevice` & `EmqxAuth`              |
| Unit Tests Mocks    | Kiểm soát các dependency injection `RedisService` & xử lý mock implementation độc lập         |
| P0.1 - P0.3         | Tích hợp `SceneTriggerIndexService`, Rebuild Redis Index on Startup, thêm DB Performance idx  |
| P1.1 - P1.3         | Áp dụng Rate Limiting (minIntervalSeconds), Quota Control (maxScenes..), Timer Job Canceling  |
| P2.1 - P2.2         | Gắn Dead-letter Queue alerts cho Worker và Retry 3 attempt khi Socket `emitToDevice` bị lỗi   |

---

### P3 — Nice to have (Đã hoàn thành ✅)

#### Task P3.1: API — Execution Logs
- [x] `GET /v1/automation/stats` →  Đã trả về `successCount`, `failCount` sử dụng `ScheduleExecutionLog` model.

#### Task P3.2: API — Queue Metrics (admin)
- [x] `GET /v1/admin/metrics/queues` → Đã khai thác BullMQ `getJobCounts()`.

---


### Technical Context (không được quên khi làm tiếp)

**Redis key schema:**

```
scene_trigger:device:{deviceToken}   → Set<sceneId>   (reverse index)
scene_trigger:tracked:{sceneId}      → Set<deviceToken> (cleanup tracking)
scene_cooldown:{sceneId}             → "1" EX 60       (dedup per minute)
lock:schedule_cron                   → "1" EX 55        (distributed lock)
lock:scene_schedule                  → "1" EX 55        (distributed lock)
device:{deviceId}:entity:{code}      → JSON state       (existing)
cmd_user:{token}:{entityCode}        → Set<userId> EX 10 (existing)
```

**Cron-parser version:** v3 → dùng `CronExpressionParser.parse()`, không phải `parseExpression()`

```typescript
import { CronExpressionParser } from 'cron-parser';
const interval = CronExpressionParser.parse(expr, { tz, currentDate: from });
```

**Pattern typed payload (không dùng any):**

```typescript
interface MyPayload {
  token: string;
  value: string | number | boolean;
}
const data = job.data as MyPayload;
```

**BullMQ Queue names:**

```
APP_BULLMQ_QUEUES.DEVICE_CONTROL     = "device-control"
APP_BULLMQ_QUEUES.AUTOMATION         = "automation"
APP_BULLMQ_QUEUES.PUSH_NOTIFICATION  = "push-notification"
```

**Score hiện tại: 47.5/50 (9.5/10) 🏆 | Nhiệm vụ Scalability đã kết thúc!**
P0 → +2.0 điểm | P1 → +1.5 điểm | P2 → +1.0 điểm | P3 → +2.0 điểm

---

## Tính năng 6: System Monitoring & Alert (Hệ thống Cảnh báo Sức khoẻ Server)

**Trạng thái**: ✅ Đã hoàn thành (SA Grade).

### 1. Mô tả tổng quan
Xây dựng lớp giám sát liên tục tình trạng tài nguyên (CPU, RAM, Disk, Swap) của Server vật lý và trạng thái các Docker container. Tách biệt hoàn toàn với Docker (chạy OS-level Crontab) để đảm bảo giám sát hoạt động ngay cả khi hệ sinh thái Docker sập. Hỗ trợ đa kênh (Email + Telegram) cho nhiều người nhận, tự động khởi động lại container bị chết, và chống nhiễu (Strike + Cooldown).

### 2. Checklist (To-Do)
- [x] Giải pháp đo tài nguyên: Script Bash `server-health.sh` chạy OS-level Crontab hoàn toàn độc lập.
- [x] Thiết lập logic ngưỡng: Threshold (CPU 85-95%, RAM 85-95%) với Strike counter (vượt ngưỡng 3 lần liên tiếp) & Cooldown (30 phút) để chống spam.
- [x] Đa kênh cảnh báo: Gửi đồng thời Telegram Bot & Mail Template HTML chuyên nghiệp xử lý bằng Python `smtplib` (Zero pip dependency).
- [x] Theo dõi Healthcheck: Giám sát toàn bộ container thông qua `docker inspect` + `docker exec` test trực tiếp endpoint API `core-api/health`.
- [x] Cơ chế phục hồi: Tự động restart container (tối đa 2 lần/giờ) và bắn thông báo Recovery khi tài nguyên cân bằng trở lại.
- [x] Tích hợp Triển khai: Tự động crontab injection & logrotate qua Tool `setup-server.sh`.
- [x] **Consolidated Alert**: Gom tất cả metrics vào 1 tin nhắn duy nhất (bảng Dashboard) thay vì spam riêng lẻ từng metric.
- [x] **Safe .env parser**: Dùng `grep + eval` thay vì `source .env` để tránh crash khi `MAIL_FROM` có dấu `<>`.

---

## Tính năng 7: Daily Automated Backup (Cronjob sao lưu dữ liệu)

**Trạng thái**: ✅ Đã hoàn thành.

### 1. Mô tả tổng quan
Mỗi 3 giờ sáng hàng ngày, hệ thống sẽ tự động trích xuất toàn bộ dữ liệu từ PostgreSQL (TimescaleDB) và Redis, nén lại thành file zip an toàn và gửi lên một bên thứ ba (Third-party Storage) như AWS S3, Google Drive, hoặc Backblaze B2. Điều này đảm bảo an toàn tuyệt đối khi Server vật lý hỏng ổ cứng hoặc nhà cung cấp VPS bị chập cháy rớt mạng vĩnh viễn.

### 2. Checklist (To-Do)
- [x] Viết `daily-backup.sh`: Dùng lệnh `docker exec pg_dump` và `redis-cli save` để lấy DB dump + Cache RDB.
- [x] Nén toàn bộ file `.sql` và `.rdb` kèm timestamp ra file `tar.gz`.
- [x] Tích hợp Upload Đa hệ: Mặc định gửi **cả 2 kênh** (Telegram Bot + Cloudflare R2/S3). Nếu chưa có S3 key thì chỉ gửi Telegram. Thêm key vào GitHub Secret → redeploy → tự kích hoạt.
- [x] Gắn `daily-backup.sh` vào Crontab tại khung giờ `0 3 * * *` qua `setup-server.sh`.
- [x] Tự dọn dẹp backup cũ trên SSD cục bộ quá 7 ngày.
- [x] **Telegram file-size guard**: Nếu file > 50MB, gửi tin nhắn cảnh báo thay vì gửi file. Caption hiển thị trạng thái R2.
- [x] **Error resilience**: Kiểm tra file tồn tại trước khi nén, hỗ trợ Redis password, cảnh báo nếu không kênh nào upload thành công.

---

## Tính năng 8: MCP Server (Admin Chatbox & AI Context Assistant)

**Trạng thái**: ⏳ Lên Kế Hoạch (Planning) - **Xem kế hoạch chi tiết + task tại: [feature_8_mcp_chatbox.md](./feature_8_mcp_chatbox.md)**

### 1. Mô tả tổng quan
Xây dựng một MCP (Model Context Protocol) Server kết nối trực tiếp vào CSDL của Euro Smart Server để hỗ trợ xây dựng **Chatbox Quản trị viên** trên Admin Dashboard React mới.
Hệ thống giúp quy tụ mọi thao tác quản lý phức tạp (Tra cứu user, cấp phép license cho model thiết bị, theo dõi trạng thái partner) về chung một cửa sổ giao tiếp tự nhiên. Tương lai sẽ mở rộng tính năng Assistant này cho cả người dùng cuối nếu phù hợp.

### 2. Checklist (To-Do)
*Toàn bộ task checklist chi tiết (bao gồm chia 3 Phase và các nhóm chức năng Tool) đã được lưu vào file [feature_8_mcp_chatbox.md](./feature_8_mcp_chatbox.md).*

