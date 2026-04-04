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

**Trạng thái**: Đang chờ (Hiện tại chưa có cả UI và API).

### 1. Mô tả tổng quan

Tính năng cho phép chủ sở hữu thiết bị (Owner) có thể chia sẻ quyền điều khiển và quản lý thiết bị cho các thành viên khác trong gia đình hoặc khách. Hệ thống cần đảm bảo tính phân quyền (Admin, Editor, Viewer) và bảo mật khi thu hồi quyền truy cập.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api)**

- [ ] Phát triển API tạo lời mời chia sẻ (Share Invitation): Sinh mã token hoặc QR code có thời hạn.
- [ ] Phát triển API chấp nhận chia sẻ: Người được chia sẻ xác nhận và lưu vào bảng `DeviceShare`.
- [ ] Quản lý phân quyền (Permissions): Xây dựng logic kiểm tra quyền (Guard/Interceptor) để đảm bảo Viewer không thể đổi tên thiết bị hay Editor không thể xóa thiết bị.
- [ ] Logic thu hồi (Revoke): Chủ sở hữu có thể ngắt kết nối bất kỳ người dùng nào đang được chia sẻ.
- [ ] Notification: Gửi thông báo cho người nhận khi có lời mời mới và thông báo cho chủ sở hữu khi lời mời được chấp nhận.

👉 **Phía Mobile App (new-app)**: Chuyển sang theo dõi tại repo `new-app` ở đường dẫn `../../new-app/.agents/smarthome_todo.md`

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Cơ chế mời qua cái gì là tối ưu nhất? (Email link, QR Code quét trực tiếp, hay nhập số điện thoại ID người dùng).
- Có giới hạn số lượng người được chia sẻ trên một thiết bị không?
- Khi chủ sở hữu xóa thiết bị (Unbind), tất cả các liên kết chia sẻ có tự động bị xóa sạch không? (Dự kiến là có).

---

## Tính năng 3: Timer & Schedule (Hẹn giờ và Lịch trình)

**Trạng thái**: ✅ Backend đã triển khai. 🔄 **Đang làm UI App**.

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

- [ ] `automationService.ts` — API client cho timers + schedules (CRUD).
- [ ] `DeviceActionBar` — Bottom action bar dùng chung cho **tất cả** detail screens.
  - Single entity: 2 button (Đếm ngược, Hẹn giờ)
  - Group entity (nhiều switch): 4 button (Bật tất, Tắt tất, Đếm ngược, Hẹn giờ)
- [ ] `CountdownModal` — Bottom sheet chọn giờ/phút/giây (wheel) + toggle trạng thái BẬT/TẮT.
  - Group: thêm TabView chọn switch cụ thể phía trên wheel.
- [ ] `SelectEntitySheet` — Bottom sheet chọn switch (dùng cho group trước khi vào Schedule Editor).
- [ ] `ScheduleEditorScreen` — Màn hình hẹn giờ (`/device/[id]/schedule` route).
  - Chọn giờ (TimePicker)
  - Chọn ngày lặp lại Mon–Sun (multi-select)
  - Toggle thông báo push
  - Toggle bật/tắt lịch
  - Header nút Lưu
  - List các schedule đang có + toggle bật/tắt từng cái
- [ ] Tích hợp `DeviceActionBar` vào `SwitchDetailScreen`, `CurtainDetailScreen`, `LightDetailScreen`, `ClimateDetailScreen`.

### 3. API Contract (đã verify hoạt động)

```
POST /v1/automation/timers
{
  "targetType": "DEVICE",
  "targetId": "device-uuid",
  "service": "device-control",
  "executeAt": "2026-04-05T03:00:00.000Z",
  "actions": [{ "entityCode": "main", "value": 0 }]
}

POST /v1/automation/schedules
{
  "name": "Tắt đèn hằng đêm",
  "targetType": "DEVICE",
  "targetId": "device-uuid",
  "service": "device-control",
  "daysOfWeek": [1, 2, 3, 4, 5],
  "timeOfDay": "22:00",
  "timezone": "Asia/Ho_Chi_Minh",
  "actions": [{ "entityCode": "main", "value": 0 }]
}

GET  /v1/automation/timers
GET  /v1/automation/schedules
DELETE /v1/automation/timers/:id
DELETE /v1/automation/schedules/:id
PATCH  /v1/automation/schedules/:id/toggle   { "isActive": true/false }
```

## Tính năng 5: Update User Profile (Cập nhật thông tin cá nhân)

**Trạng thái**: Đang triển khai (BE đã có API cơ bản).

### 1. Mô tả tổng quan

Cho phép người dùng thay đổi thông tin định danh cá nhân như Tên (First Name), Họ (Last Name) và ảnh đại diện (Avatar). Đây là bước cơ bản để cá nhân hóa trải nghiệm người dùng trong hệ thống nhà thông minh.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api)**

- [x] Phát triển API Endpoint `PUT /v1/user`: Cập nhật thông tin `firstName`, `lastName`, `avatar`.
- [x] Tích hợp xử lý Upload ảnh Avatar: Chuyển sang upload qua Cloudinary trên App, BE chỉ nhận link.
- [ ] Validation nâng cao: Kiểm tra độ dài, ký tự đặc biệt cho tên người dùng.
- [ ] Thực hiện Manual Verify (Kiểm tra thực tế luồng upload avatar, update state, UI phản hồi) trên thiết bị thật / simulator.

👉 **Phía Mobile App (new-app)**: Chuyển sang theo dõi tại repo `new-app` ở đường dẫn `../../new-app/.agents/smarthome_todo.md`

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Có nên cho phép đổi Số điện thoại / Email tại đây không? (Thường cần qua luồng OTP riêng để đảm bảo bảo mật).
- Kích thước ảnh tối đa cho Avatar là bao nhiêu để tối ưu dung lượng lưu trữ?

---

## ⚙️ Scalability Engine Refactor (50k–200k devices)

**Trạng thái**: 🔄 Đang thực hiện — 8.2/10. Mục tiêu: **9.5/10**.
**Last commit**: `cce4835` — `feat(scalability): refactor automation & scene engine`

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
| Shared util         | `calculateNextExecution()` trong `libs/common/src/utils/schedule-next-calculator.ts`          |
| New API endpoints   | DELETE timer, DELETE schedule, PATCH schedule/toggle, DELETE scene                            |
| Zero `any` types    | Tất cả file đã dùng typed interfaces, Prisma.InputJsonValue, type guards                      |

---

### P0 — Critical (làm đầu session tiếp theo)

#### Task P0.1: Kết nối Redis Index vào DeviceControlProcessor

**File**: `apps/worker-service/src/processors/device-control.processor.ts`

Thêm `SceneTriggerIndexService` vào constructor và thay `handleCheckDeviceStateTriggers`:

```typescript
// THAY: full scan
const scenes = await this.databaseService.scene.findMany({ where: { active: true } });

// BẰNG: O(1) Redis index
const sceneIds = await this.sceneTriggerIndexService.getSceneIdsForDevice(deviceToken);
if (sceneIds.length === 0) return { ok: true };
const scenes = await this.databaseService.scene.findMany({
  where: { id: { in: sceneIds }, active: true },
  select: { id: true, name: true, triggers: true },
});
```

Cũng cần inject `SceneTriggerIndexService` vào provider trong `app.module.ts` (hoặc qua `CommonModule`).

#### Task P0.2: Rebuild Index on Worker Startup

**File mới**: `apps/worker-service/src/startup/index-rebuild.service.ts`

```typescript
@Injectable()
export class IndexRebuildService implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.indexService.rebuildAllIndexes(async () => this.prisma.scene.findMany({ where: { active: true }, select: { id: true, triggers: true } }));
  }
}
```

Thêm vào `apps/worker-service/src/app.module.ts` providers.

#### Task P0.3: DB Performance Indexes

**File mới**: `prisma/migrations/XXXX_add_performance_indexes/migration.sql`

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_schedule_active_next
  ON t_device_schedule (is_active, next_execute_at) WHERE is_active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scene_active
  ON t_scene (active) WHERE active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_scene_triggers_gin
  ON t_scene USING GIN (triggers);
```

---

### P1 — Important (sau P0)

#### Task P1.1: Schema — Scene Rate Limiting

**File**: `prisma/schema.prisma`

```prisma
model Scene {
  minIntervalSeconds Int?     @default(60)
  lastFiredAt        DateTime?
}
```

Sau migrate: check `elapsed < minIntervalSeconds` trong `handleCheckDeviceStateTriggers` trước khi fire.

#### Task P1.2: Schema — User Automation Quota

**File**: `prisma/schema.prisma`

```prisma
model User {
  maxTimers    Int @default(50)
  maxSchedules Int @default(50)
  maxScenes    Int @default(100)
}
```

Guard trong `AutomationService.createTimer`, `createSchedule` và `SceneService.createScene`.

#### Task P1.3: Timer Job Cancellation

**File**: `prisma/schema.prisma` → thêm `jobId String?` vào `DeviceTimer`
**File**: `apps/core-api/src/modules/automation/services/automation.service.ts`

- Sau `automationQueue.add(...)` → store `job.id` vào `timer.jobId`
- Trong `deleteTimer()` → `automationQueue.getJob(jobId).then(j => j?.remove())`

---

### P2 — Reliability (sau P1)

#### Task P2.1: Dead Letter Queue Alerts

**File**: `apps/worker-service/src/processors/device-control.processor.ts`

```typescript
this.deviceQueue.on('failed', (job, error) => {
  this.logger.error(`Job ${job.name} failed: ${error.message}`, job.data);
});
```

#### Task P2.2: socket:emit Retry (3 attempts)

**File**: `libs/common/src/events/socket-event.publisher.ts` (kiểm tra file này trước)
Nếu chưa có retry: thêm vòng lặp 3 lần với backoff 100ms.

---

### P3 — Nice to have

#### Task P3.1: API — Execution Logs

`GET /v1/automation/stats` → timerCount, scheduleCount, recentLogs (10 gần nhất)

#### Task P3.2: API — Queue Metrics (admin)

`GET /v1/admin/metrics/queues` → job counts cho DEVICE_CONTROL và AUTOMATION queues

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

**Score hiện tại: 41/50 (8.2/10) | Mục tiêu: 47.5/50 (9.5/10)**
P0 → +2.0 điểm | P1 → +1.5 điểm | P2 → +1.0 điểm | P3 → +2.0 điểm
