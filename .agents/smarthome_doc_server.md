# Tài liệu Hệ thống: Smart Home Server (sensa-smart-server)

## 1. Tổng quan
Hệ thống Backend trung tâm dạng Microservices quản trị theo nguyên tắc NX Monorepo. Nền tảng đảm nhiệm việc định tuyến người dùng, xử lý tín hiệu IoT, lập lịch tự động hóa, thực thi hàng đợi điều khiển thiết bị và cung cấp AI Assistant thông qua MCP Protocol. Hệ thống được thiết kế High Availability (HA) trải dài trên 2 máy chủ (VPS) qua kết nối mã hóa Tailscale VPN.

## 2. Kiến trúc Monorepo (Apps & Libs)
Cấu trúc NX được cô lập logic giữa **4 Apps** có khả năng tự Deploy và **3 bộ Shared Libraries** chia sẻ tài nguyên.

### Deployable Apps:

| App | Port | Mô tả |
|-----|------|-------|
| **`core-api`** | 3001 | REST API xử lý Business Entities (Tài khoản, Tổ ấm, Thiết bị, Scene, Automation). Quản lý bảo mật Authentication & ACL cho EMQX Broker. |
| **`iot-gateway`** | 3003 | Cầu nối MQTT Broker. Lắng nghe message realtime từ thiết bị, decode payload, phát hành sang BullMQ. Hai listener: `mqtt.listener.ts` (MQTT generic) và `zigbee2mqtt.listener.ts` (Zigbee). Hai driver: `MqttGenericDriver` và `ZigbeeGenericDriver`. |
| **`worker-service`** | 3004 | Worker pool xử lý BullMQ Job Processes — điều khiển device, đồng bộ trạng thái, cron schedule, gửi Email/SMS/Push Notification. |
| **`mcp-server`** | — | MCP (Model Context Protocol) Server cung cấp 22 tools cho AI Chatbox. Transport: Stdio (Phase 1), SSE HTTP (Phase 2). Không chạy port HTTP riêng ở phase hiện tại. |

### Shared Libraries:

| Library | Path Alias | Mô tả |
|---------|-----------|-------|
| **`@app/common`** | `libs/common/src` | Kho Utils, DTOs, Enums, Guards, Decorators. Chứa Modules: MQTT Service, Vietguys SMS, Mailer (Handlebars template), Notification, SceneTriggerIndexService, SMS-SIM (serialport). |
| **`@app/database`** | `libs/database/src` | Adapter đóng gói Prisma ORM Module (`DatabaseService`). |
| **`@app/redis-cache`** | `libs/redis-cache/src` | Xử lý in-memory store dùng `ioredis`. |

## 3. Storage & Công cụ tích hợp (Tech Stack)

| Hạng mục | Công nghệ | Chi tiết |
|----------|-----------|----------|
| **Runtime** | Node.js 22 + NestJS 11 | Webpack bundling qua NX, Yarn 4.9 Corepack |
| **Database** | PostgreSQL + TimescaleDB | Prisma v6, Hypertable cho time-series (EntityStateHistory, DeviceConnectionLog) |
| **Queue** | BullMQ + Redis | 2 queues: `DEVICE_CONTROL`, `NOTIFICATION` |
| **Real-time IoT** | EMQX Broker (Cluster 2-node) | HMAC-SHA256 HTTP Auth, ACL per device/user |
| **AI/MCP** | `@modelcontextprotocol/sdk` + Zod | MCP Server cho Admin Chatbox (Phase 1: Stdio) |
| **DevOps** | Docker Compose + GitHub Actions | HA Topology: HAProxy (Layer 4) + Nginx (SSL termination), dual VPS deploy |

## 4. Chuẩn mực & Coding Conventions

1. **Naming & Typing**:
    - File: kebab-case. Class & Object: PascalCase. DTO hậu tố `Dto`, Controller hậu tố `Controller`.
    - Luôn sử dụng NX Alias (`@app/common`, `@app/database`, `@app/redis-cache`). Không import physical path.
    - Barrel export qua `index.ts` cho mỗi library.
2. **API Response**:
    - Trả về đối tượng thống nhất qua Interceptors: `{ statusCode, message, timestamp, data }`.
    - Lọc output bằng class-transformer (`@Expose`, `@Exclude`).
    - Decorator chuẩn: `@DocResponse({ serialization, httpStatus, messageKey })`.
3. **Database Conventions**:
    - Tên bảng map `snake_case` (`@@map("t_user")`). Primary key: UUID.
    - Entities chia nhóm: Catalog (Hardware), Device (3-tier: Device → DeviceEntity → EntityAttribute), Home/Room/Floor, Quota Control (License).
4. **Cross-app Communication**:
    - Không import code chéo giữa Apps. Liên kết qua BullMQ Queue hoặc Redis Pub/Sub.
    - MCP Server dùng PrismaClient trực tiếp cho Query tools, gọi HTTP tới core-api cho Mutation tools (Phase 4).

## 5. Các Tính năng (Features) Hiện Có

### A. Core-API Modules (`apps/core-api/src/modules/`)

| Module | Files chính | Chức năng |
|--------|------------|-----------|
| **Admin** | `admin.controller.ts`, `admin.service.ts` | CRUD Partner/Company, DeviceModel Blueprint, LicenseQuota (upsert), SystemConfig (MQTT, OTP), Device UI Config (JSON + Redis cache) |
| **User** | `user/` | Authentication (JWT Access/Refresh), quản lý Profile, Session tracking (pushToken per device) |
| **Home** | `home.controller.ts`, `home.service.ts` | CRUD Home/Floor/Room, Member management, thứ tự sắp xếp (reorder), gán Device/Scene vào Room, Home Activity timeline |
| **Device** | `device.controller.ts`, 3 services | **DeviceService**: CRUD device, share (token-based QR/DeepLink), timeline history, Siri Sync, notify config. **DeviceControlService**: điều khiển entity (validate domain → check online Redis → BullMQ queue). **DeviceProvisioningService**: đăng ký + claim thiết bị mới |
| **Scene** | `scene.controller.ts`, `scene.service.ts` | CRUD Scene, **Compiled Actions** (embed MQTT metadata lúc save → zero DB query lúc run), Run Scene (BullMQ), SceneTriggerIndexService (Redis reverse-index cho DEVICE_STATE trigger), Location trigger, Reorder |
| **Automation** | `automation.controller.ts`, `automation.service.ts` | CRUD Timer (one-shot countdown), CRUD Schedule (recurring cron), Toggle active/inactive, Execution stats, BullMQ queue metrics |
| **EMQX-Auth** | `emqx-auth/` | HTTP Auth endpoint cho EMQX Broker (HMAC-SHA256 stateless), ACL check per device ownership/share, Generate MQTT credentials cho mobile app |

### B. Worker-Service (`apps/worker-service/src/`)

| Processor/Scheduler | File | Chức năng |
|---------------------|------|-----------|
| **Device-Control Processor** | `processors/device-control.processor.ts` (34KB) | Thực thi lệnh điều khiển: single entity, bulk entity, **RUN_SCENE** (compiled actions), **CHECK_DEVICE_STATE_TRIGGERS** (Redis index lookup). Gửi MQTT qua MqttGenericDriver/ZigbeeDriver |
| **Device-Status Processor** | `processors/device-status.processor.ts` | Đồng bộ trạng thái thiết bị báo cáo từ MQTT → Database (EntityStateHistory) |
| **Notification Processor** | `processors/notification.processor.ts` | Push Notification qua Expo SDK (iOS/Android), routing logic: Owner + Home Members + Shared Users, loại trừ người thực hiện (initiator) |
| **Email Processor** | `processors/email.processor.ts` | Gửi Email qua NestJS Mailer (Handlebars template): OTP, cảnh báo, thông báo hệ thống |
| **Scene Schedule Cron** | `modules/scene/services/scene-schedule-cron.service.ts` | CronJob mỗi phút scan Scene có SCHEDULE trigger → fire `runSceneByTrigger()` |
| **Automation Cron** | `modules/automation/services/schedule-cron.service.ts` | CronJob mỗi phút scan DeviceSchedule → fire qua BullMQ |
| **Automation Processor** | `modules/automation/processors/automation.processor.ts` | Thực thi Timer/Schedule jobs: điều khiển device hoặc chạy Scene |
| **Midnight Scheduler** | `schedulers/midnight.scheduler.ts` | CronJob 00:00 hàng ngày (placeholder cho bảo trì dữ liệu) |

### C. IoT Gateway (`apps/iot-gateway/src/`)

| Component | File | Chức năng |
|-----------|------|-----------|
| **MQTT Listener** | `listeners/mqtt.listener.ts` | Lắng nghe topic `device/+/status`, decode payload JSON, push job `CHECK_DEVICE_STATUS` vào BullMQ |
| **Zigbee2MQTT Listener** | `listeners/zigbee2mqtt.listener.ts` | Lắng nghe bridge Zigbee2MQTT, transform payload, push job |
| **MQTT Generic Driver** | `drivers/mqtt-generic.driver.ts` | Publish lệnh điều khiển: topic `device/{token}/{suffix}`, payload `{commandKey: value}` |
| **Zigbee Generic Driver** | `drivers/zigbee.generic.driver.ts` | Publish lệnh qua Zigbee2MQTT bridge |
| **Device State Service** | `services/device-state.service.ts` | Shadow State management trong Redis (`device:shadow:{token}`), cache 5 phút |
| **Device Status Service** | `services/device-status.service.ts` | Track online/offline qua Redis key `status:{token}`, lưu DeviceConnectionLog |

### D. MCP Server (`apps/mcp-server/src/`) — *Mới, Phase 1*

| Component | File | Chức năng |
|-----------|------|-----------|
| **Entry Point** | `main.ts` | McpServer + StdioServerTransport, register 22 tools + 1 resource |
| **Prisma** | `prisma.ts` | PrismaClient singleton (standalone, không qua NestJS DI) |
| **Confirm Util** | `utils/confirm.ts` | Mutation Safety: 2-step confirm, in-memory store, TTL 5 phút |
| **Partner Tools** | `tools/partner.tools.ts` | 4 tools: list, get, create*, update* |
| **Device Model Tools** | `tools/device-model.tools.ts` | 4 tools: list, create*, update*, assign_to_partner* |
| **License Tools** | `tools/license.tools.ts` | 3 tools: list_quotas, set_license*, get_usage |
| **User Tools** | `tools/user.tools.ts` | 5 tools: list_users, count_users, system_stats, configs, update_config* |
| **Device Tools** | `tools/device.tools.ts` | 4 tools: list_devices, count_by_partner, list_hardware, update_firmware* |
| **Schema Resource** | `resources/schema.resource.ts` | Expose `prisma/schema.prisma` cho AI đọc cấu trúc DB |

*`*` = Mutation tool, yêu cầu xác nhận 2 bước trước khi ghi DB*

## 6. Cơ chế Điều khiển Thiết bị (Device Control Pipeline)

Luồng điều khiển thiết bị là pipeline phức tạp nhất trong hệ thống, đảm bảo validation, audit, và realtime:

```
User/AI Request
    │
    ▼
DeviceControlService (core-api)
    ├─ Validate entity domain (switch, curtain, light, climate, lock, button, config, update)
    ├─ Check readOnly flag
    ├─ Check online status (Redis: status:{token})
    ├─ Validate position limits (curtain: OPEN when pos=100, CLOSE when pos=0)
    │
    ▼
BullMQ Queue (DEVICE_CONTROL)
    │ Job: CONTROL_CMD / CONTROL_DEVICE_VALUE_CMD
    ▼
Device-Control Processor (worker-service)
    ├─ Resolve DeviceEntity (commandKey, commandSuffix)
    ├─ Build MQTT payload: {commandKey: value}
    ├─ Publish via MqttGenericDriver
    │     Topic: device/{token}/{suffix}
    │     QoS: 1
    ├─ Update Redis Shadow State
    ├─ Write EntityStateHistory (source: "app"/"ai"/"scene"/"schedule")
    └─ Emit Socket.IO realtime event
```

### Entity Domains & Validation:
| Domain | Giá trị hợp lệ | Ví dụ |
|--------|----------------|-------|
| `switch` / `switch_` | `0/1`, `true/false`, `"on"/"off"` | Công tắc bật/tắt |
| `light` | `0-100` (brightness) | Đèn dimmer |
| `curtain` | `"OPEN"`, `"CLOSE"`, `"STOP"`, `"DIR_REV"`, `"DIR_FWD"` | Rèm/cửa cuốn |
| `lock` | `0/1` (child_lock) | Khóa trẻ em |
| `button` | string hoặc `1/true` (trigger) | Nút bấm RF learn |
| `config` | JSON object | Config pass-through |
| `update` | HTTP/HTTPS URL | OTA firmware |
| `sensor` | *(read-only, không điều khiển được)* | Cảm biến nhiệt độ/độ ẩm |

## 7. Cơ chế Scene & Automation

### 7.1 Scene (Kịch bản)
Scene hoạt động phong cách HA (Home Assistant), chia 2 loại:

- **Manual**: `triggers = []` → chỉ chạy qua API `POST /scenes/:id/run`
- **Automation**: có trigger(s) → executor tự động:
  - **SCHEDULE**: Worker CronJob mỗi phút (`SceneScheduleCronService`)
  - **LOCATION**: API `POST /scenes/triggers/location` (geofence enter/leave)
  - **DEVICE_STATE**: MQTT → BullMQ → `CHECK_DEVICE_STATE_TRIGGERS` (Redis O(1) reverse-index lookup)

**Compiled Actions** — Tối ưu hiệu năng:
  - Lúc tạo/sửa Scene, `compileSceneActions()` embed `protocol`, `commandKey`, `commandSuffix` từ DeviceEntity vào `compiledActions` JSONB.
  - Lúc run Scene → executor dùng compiled data, **ZERO DB query**.
  - Version snapshot (`configVersion` per device) detect drift → lazy re-compile khi entity thay đổi.

### 7.2 Automation (Timer & Schedule)
- **Timer (DeviceTimer)**: One-shot countdown, chạy 1 lần rồi xóa.
- **Schedule (DeviceSchedule)**: Recurring cron (daysOfWeek + timeOfDay), toggle active/inactive.
- Cả hai target lên `Device` hoặc `Scene` (`targetType: "DEVICE" | "SCENE"`).

## 8. Cơ chế Quản lý Bản quyền (License Quota Flow)

Vòng đời License kết nối Server ↔ Thiết bị phần cứng:

1. **Admin cấp phát**: Tạo `LicenseQuota` (partnerId × deviceModelId) với `maxQuantity` và `licenseDays` (mặc định 90 ngày).
2. **Provisioning**: Mobile App đăng ký thiết bị → Backend rà soát Quota, đẩy `licenseDays` vào payload cài đặt gốc cho chip.
3. **Gia hạn MQTT**: Server chủ động publish `{"license_days": <days>}` xuống thiết bị qua MQTT bất cứ lúc nào.

## 9. Cơ chế Thông báo (Notification Pipeline)

### Push Token Management:
- `pushToken` lưu trong bảng `Session` (1 user → nhiều session trên nhiều device vật lý).
- Gửi tin: truy vấn tất cả Session có token hợp lệ → push song song.

### Routing Logic:
- Sự kiện thiết bị → xác định recipients: **Owner** + **Home Members** + **Shared Users**.
- **Loại trừ Initiator**: Người bấm nút "Mở cửa" trên App sẽ không nhận thông báo "Cửa đã mở".

### Kênh gửi:
- **Push Notification**: Expo Server SDK (iOS/Android)
- **SMS**: SIM Module vật lý (`serialport-gsm`) hoặc Vietguys API
- **Email**: NestJS Mailer + Handlebars templates (OTP, cảnh báo)

## 10. Cơ chế Lịch sử & Audit Log (TimescaleDB)

Hai bảng Hypertable time-series:
- **`EntityStateHistory`**: Lưu mọi thay đổi trạng thái entity (giá trị cũ → mới), tracking **source** (`"app"`, `"mqtt"`, `"scene"`, `"schedule"`, `"siri"`) và **actionByUserId**.
- **`DeviceConnectionLog`**: Lưu sự kiện connect/disconnect (`"connected"`, `"disconnected"`).

## 11. Cơ chế Tối ưu Hiệu năng (Scalability & 200k Devices)

| Kỹ thuật | Áp dụng | Chi tiết |
|----------|---------|----------|
| **Redis Shadow State** | `device:shadow:{token}` | Cache trạng thái realtime, giảm query DB |
| **Redis Reverse Index** | `SceneTriggerIndexService` | DEVICE_STATE trigger → O(1) lookup, không Full Scan |
| **Redis Online Status** | `status:{token}` | Check online/offline trước khi gửi lệnh |
| **Compiled Actions** | `scene.compiledActions` JSONB | Zero DB query khi run Scene |
| **BullMQ Priority** | `priority: 1` cho control | Lệnh điều khiển ưu tiên cao nhất |
| **No Retry for Control** | `attempts: 1` | Lệnh stale có hại → không retry |
| **Distributed Lock** | Worker Cron | Tránh nhiều Node cùng kích hoạt 1 Scene |
| **Quota/Rate Limit** | Schema level | `minIntervalSeconds` per Scene, `maxSchedules`/`maxTimers`/`maxScenes` per User |
| **DB Indexes** | PostgreSQL | GIN index trên `triggers` JSON, CONCURRENTLY index cho time-series |

## 12. Cấu hình Động (Dynamic Blueprint & Override)

- **DeviceModel.config** (JSONB): Blueprint chuẩn định nghĩa tập Entities + Attributes cho toàn nhóm model.
- **Device.customConfig** (JSON): Override cấp thiết bị riêng lẻ (Modbus Slave ID, tần số, notify flags...) — không cần sửa firmware.
- **Device UI Config**: JSON config cho app rendering (SystemConfig + Redis cache), admin cập nhật qua API → refresh Redis ngay lập tức.

## 13. Cấu trúc AI Admin Chatbox (MCP Phase 2)

Để hỗ trợ quản trị hệ thống bằng trợ lý ảo phản hồi tự nhiên, mô hình AI (LLM) được tích hợp thông qua kiến trúc Model Context Protocol (MCP) sử dụng kết nối mạng Server-Sent Events (SSE). Mục đích của thiết kế này là phân tách rõ rệt vùng bảo mật cơ sở dữ liệu (MCP Server) ra khỏi tầng REST API mặt tiền (Core API) và cung cấp bối cảnh chuẩn theo thời gian thực (realtime context) cho tác tử AI.

### Sơ đồ giao tiếp (Interaction Flow)
```text
[React Admin Dashboard] (Client)
      |
      | (REST / SSE)  <- Gửi câu lệnh (VD: "xóa user X", "thống kê thiết bị") & nhận stream text
      v
[Core API - AiModule] (NestJS Agent)
      | 
      | (1) Khởi tạo `SSEClientTransport` kết nối nội bộ tới `mcp-server:3005`
      | (2) Lấy cấu trúc 22+ Tools thông qua `client.listTools()`
      | (3) Khởi tạo Session với External LLM (Gemini / Claude / OpenAI)
      |
      v
[External AI Model] (LLM Engine)
      | 
      | (4) Phân tích Prompt + Tool definitions -> gọi Tool call
      v
[MCP Server] (Node.js/Express)
      | (Chạy độc lập port 3005)
      | (5) Map Tool name vào Prisma Query/Mutation
      | (6) Trả kết quả (JSON / i18n Markdown) qua mạng nội bộ cho Core API
      |
      v
[Database PostgreSQL]
```

### Các Layer thiết yếu

#### 1. MCP Server - SSE Transport (`apps/mcp-server`)
- Được nâng cấp từ Standard IO sang kết nối HTTP/SSE qua **Express**. Mở cố định cổng nội bộ `3005`.
- **GET `/sse`**: Khởi tạo `SSEServerTransport`, định danh Session Client, ghim Stream open.
- **POST `/message`**: Endpoint nhận JSON-RPC (ví dụ Tool Call request) từ Core API gửi sang, xử lý kết quả và push event ngược về kênh SSE cho Client.
- Tích hợp nội bộ **i18n** (Tiếng Việt & Tiếng Anh) qua tệp cấu hình `libs/common/src/message/languages/.../mcp.json` sử dụng key config cho mọi response trả ra từ tools, giúp AI nhận biết context cực chuẩn mà không cần dịch thuật on-the-fly.
- Sử dụng mô hình kiểm soát an toàn **2-Step Confirm Pattern** đối với các mutate actions (Create, Update, Delete) — yêu cầu LLM xác nhận mã ID ngẫu nhiên.

#### 2. Core API - AI Module (`apps/core-api/src/modules/ai/`)
- Cung cấp API trực tiếp cho Admin Frontend, đóng vai trò là "The Agent".
- **Bảo mật**: Các thao tác chỉ khả dụng khi người gọi (caller) vượt qua JwtAdminGuard. Do đó AI sẽ không bao giờ leak hệ thống ra public frontend app của User.
- **Vận hành**: Abstract hoàn thiện quy trình (Orchestration Loop) giữa người dùng (Prompt) -> LLM Server -> MCP Backend. Nếu LLM yêu cầu gọi `list_users`, AI Module tự động forward cho MCP Server, lấy data JSON trả ngược về cho LLM phân tích, và finally output text string trả lại cho người thiết lập (React Dashboard).
