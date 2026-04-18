# Kế hoạch & Checklist: Admin Chatbox & MCP Server (Tính năng 8)

> Tài liệu gốc định hướng cho các AI Agent hỗ trợ phát triển tính năng **Chatbox Quản trị viên** sử dụng Model Context Protocol (MCP).
> Đọc file này + `smarthome_todo.md` + `prisma/schema.prisma` để có đủ context trước khi code.

---

## 1. Ngữ cảnh & Tầm nhìn

### Mục tiêu gần
Xây dựng một **"Trợ lý AI Quản trị"** (Admin Chatbox) trên một trang Admin Dashboard (React) hoàn toàn mới, dự án biệt lập.
Trợ lý này có khả năng hiểu ngôn ngữ tự nhiên tiếng Việt và thực hiện các tác vụ **quản lý cấp hệ thống** — KHÔNG phải cấp người dùng.

**Ví dụ câu lệnh admin sẽ gõ:**
- *"Hôm nay có bao nhiêu User đăng ký mới?"*
- *"Thiết bị nào đang offline?"*
- *"Cấp 500 license 90 ngày cho công ty COMPANY_A model WIFI_SWITCH_4"*
- *"Thêm loại thiết bị mới mã CURTAIN_3 cho partner ABC"*
- *"Cập nhật firmware v2.1 cho mã thiết bị WIFI_SWITCH_4"*
- *"Partner X còn bao nhiêu quota?"*

### Mục tiêu xa (Vision Roadmap)

> ⚠️ **ĐÂY LÀ MỘT TRONG CÁC TÍNH NĂNG CỰC KỲ QUAN TRỌNG VÀ KHÓ.**
> Kiến trúc ban đầu phải thật tốt vì tất cả các phase sau đều xây trên nền Phase 1.
> Mỗi phase cần discuss kỹ trước khi triển khai.

Nếu Phase 1-3 (Admin Chatbox) triển khai tốt, hệ thống sẽ mở rộng theo lộ trình sau:

**Phase A — AI Assistant cho User (Mobile App)**
- Mở rộng chatbot cho người dùng cuối trên ứng dụng di động.
- Hỏi đáp thông tin cá nhân: *"Nhà tôi có bao nhiêu thiết bị?"*, *"Đèn phòng khách đang bật hay tắt?"*

**Phase B — Điều khiển thiết bị bằng giọng nói / chat**
- User ra lệnh tự nhiên: *"Tắt tất cả đèn tầng 2"*, *"Mở rèm phòng ngủ 50%"*, *"Bật điều hoà 24 độ mode cool"*
- AI Agent map câu nói → gọi MCP Tool → gửi MQTT command → thiết bị thực thi.

**Phase C — Tạo kịch bản (Scene) bằng AI**
- User mô tả kịch bản bằng ngôn ngữ tự nhiên: *"Mỗi tối 10h tắt hết đèn, đóng rèm, bật đèn ngủ"*
- AI Agent tự tạo Scene JSON (triggers + actions) phù hợp schema `t_scene`, lưu vào DB.
- Đây là tính năng **khó nhất** vì đòi hỏi AI hiểu cấu trúc automation, entity mapping, và thời gian.

**Phase D — Trợ lý thông tin chung (General Knowledge)**
- Hỏi thông tin ngoài hệ thống: tin tức, thời tiết, lịch âm, ngày lễ, sự kiện.
- Tích hợp calendar: *"Lịch của tôi tuần này có gì?"*, *"Thêm ghi chú: họp 3h chiều thứ 6"*
- Tra cứu âm lịch: *"Hôm nay ngày bao nhiêu âm lịch?"*, *"Ngày nào là Rằm tháng 7?"*
- Yêu cầu tích hợp external API (weather, news, lunar calendar) thông qua thêm MCP Tools mới.

### Tại sao dùng chuẩn MCP?
Thay vì code functions/tools trực tiếp vào API, ta xây lớp MCP. Lợi ích:
- **Tách biệt hoàn toàn** giữa backend dữ liệu (MCP Server) và LLM (Claude/GPT).
- **Đổi LLM provider = đổi 1 dòng import** — phần MCP Server backend không cần thay đổi một dòng code nào.
- **Tái sử dụng**: Cùng bộ Tools có thể dùng cho Claude Desktop, Cursor IDE, Web Chatbox, hoặc Telegram Bot.

---

## 2. Quyết định Kỹ thuật (Đã xác nhận với Owner)

| Hạng mục | Quyết định | Ghi chú |
|----------|-----------|---------|
| **LLM Provider** | Anthropic Claude (đã có API key) | Có thể swap sang OpenAI bất kỳ lúc nào nhờ Vercel AI SDK |
| **Frontend** | React project mới, riêng biệt | Không gộp vào `named_web_v2` (Next.js hiện tại) |
| **Backend MCP** | Module `apps/mcp-server` trong monorepo `sensa-smart-server` | Dùng chung Prisma schema, PrismaClient |
| **AI SDK** | Vercel AI SDK (`ai`, `@ai-sdk/anthropic`) | Abstract hóa provider, hỗ trợ streaming, tool calling |
| **Mutation Safety** | **Cần xác nhận trước khi thực thi** | LLM phải hỏi lại "Bạn có chắc?" trước create/update/delete |
| **Transport** | Phase 1: Stdio → Phase 2: SSE HTTP | Triển khai tuần tự |

---

## 3. Kiến trúc Hệ thống

### Sơ đồ luồng
```
┌──────────────────────────────────────────────────────┐
│  Admin Dashboard (React - Project mới)               │
│  ┌────────────────────────────────┐                  │
│  │  Chatbox UI (useChat hook)     │                  │
│  │  → Gửi tin nhắn tiếng Việt    │                  │
│  └────────────┬───────────────────┘                  │
└───────────────┼──────────────────────────────────────┘
                │ HTTP POST /api/chat
                ▼
┌──────────────────────────────────────────────────────┐
│  AI Gateway (API Route trong React app hoặc core-api)│
│  ┌────────────────────────────────┐                  │
│  │  Vercel AI SDK                 │                  │
│  │  → Gọi Claude/GPT API         │                  │
│  │  → Truyền MCP Tools vào LLM   │                  │
│  │  → Xử lý tool_call results    │                  │
│  └────────────┬───────────────────┘                  │
└───────────────┼──────────────────────────────────────┘
                │ MCP Protocol (SSE hoặc Stdio)
                ▼
┌──────────────────────────────────────────────────────┐
│  MCP Server (apps/mcp-server trong sensa-smart-server)│
│  ┌────────────────────────────────┐                  │
│  │  Tools: list_partners,         │                  │
│  │    set_license, count_users... │                  │
│  │  → PrismaClient               │                  │
│  │  → PostgreSQL                  │                  │
│  └────────────────────────────────┘                  │
└──────────────────────────────────────────────────────┘
```

### Cấu trúc thư mục MCP Server (trong monorepo)
```
apps/mcp-server/
├── src/
│   ├── index.ts                 ← Entry point + McpServer init
│   ├── prisma.ts                ← Shared PrismaClient instance
│   ├── tools/
│   │   ├── partner.tools.ts     ← Nhóm 1: Partner CRUD
│   │   ├── device-model.tools.ts← Nhóm 2: DeviceModel + gán cho Partner
│   │   ├── license.tools.ts     ← Nhóm 3: License & Quota
│   │   ├── user.tools.ts        ← Nhóm 4: User & System overview
│   │   └── device.tools.ts      ← Nhóm 5: Device & Hardware
│   └── resources/
│       └── schema.resource.ts   ← Expose DB schema cho AI context
├── project.json                 ← Nx project config
└── tsconfig.json
```

---

## 4. Danh sách Tools Chi tiết

> Tham chiếu schema: `prisma/schema.prisma`
> Tham chiếu admin API hiện tại: `apps/core-api/src/modules/admin/admin.controller.ts`

### Nhóm 1: Partner Management (`partner.tools.ts`)
| Tool | Loại | Input | Output | Prisma Model |
|------|------|-------|--------|-------------|
| `list_partners` | Query | filter?: { isActive } | Danh sách partner kèm quota summary | `Partner` + `LicenseQuota` |
| `get_partner` | Query | code: string | Chi tiết 1 partner (tên, code, quotas, số thiết bị) | `Partner` |
| `create_partner` | **Mutation** | code, name | Partner mới | `Partner` |
| `update_partner` | **Mutation** | code, name?, isActive? | Sửa tên hoặc vô hiệu hóa | `Partner` |

### Nhóm 2: Device Model Blueprint (`device-model.tools.ts`)
| Tool | Loại | Input | Output | Prisma Model |
|------|------|-------|--------|-------------|
| `list_device_models` | Query | — | Danh sách khuôn mẫu thiết bị | `DeviceModel` |
| `create_device_model` | **Mutation** | code, name, config? | Tạo loại thiết bị mới | `DeviceModel` |
| `update_device_model` | **Mutation** | code, name?, config? | Cập nhật config/name | `DeviceModel` |
| `assign_model_to_partner` | **Mutation** | partnerCode, modelCode, maxQuantity, licenseDays | Gán loại thiết bị cho partner (tạo/update LicenseQuota) | `LicenseQuota` |

### Nhóm 3: License & Quota (`license.tools.ts`)
| Tool | Loại | Input | Output | Prisma Model |
|------|------|-------|--------|-------------|
| `list_quotas` | Query | filter?: { partnerCode, modelCode } | Toàn bộ quota (partner × model) | `LicenseQuota` |
| `set_license` | **Mutation** | partnerCode, modelCode, maxQuantity, licenseDays | Thêm/cập nhật license cho partner + model | `LicenseQuota` |
| `get_quota_usage` | Query | partnerCode | Tổng hợp: quota đã dùng bao nhiêu %, còn bao nhiêu | `LicenseQuota` |

### Nhóm 4: User & System (`user.tools.ts`)
| Tool | Loại | Input | Output | Prisma Model |
|------|------|-------|--------|-------------|
| `list_users` | Query | page?, search?, role? | Danh sách user (phân trang) | `User` |
| `count_users` | Query | — | Tổng user, user mới hôm nay/tuần/tháng | `User` |
| `get_system_stats` | Query | — | Dashboard: tổng user, device, partner, online/offline | Multiple |
| `get_system_configs` | Query | — | Cấu hình hệ thống (MQTT, OTP...) | `SystemConfig` |
| `update_system_config` | **Mutation** | key, value | Cập nhật 1 config | `SystemConfig` |

### Nhóm 5: Device & Hardware (`device.tools.ts`)
| Tool | Loại | Input | Output | Prisma Model |
|------|------|-------|--------|-------------|
| `list_devices` | Query | filter?: { partnerCode, modelCode } | Danh sách thiết bị đang hoạt động | `Device` |
| `count_devices_by_partner` | Query | — | Thống kê số thiết bị theo từng partner | `Device` + `Partner` |
| `list_hardware` | Query | filter?: { partnerId, modelId, isBanned } | Danh sách chip phần cứng | `HardwareRegistry` |
| `update_firmware_version` | **Mutation** | modelCode, firmwareVersion | Cập nhật firmware cho tất cả hardware thuộc model | `HardwareRegistry` |

> **Lưu ý cho AI Agent**: Mọi tool loại **Mutation** phải trả về message confirmation yêu cầu admin xác nhận trước khi thực thi. Implement bằng cách tool trả response dạng "Bạn có chắc muốn [hành động]? Gõ 'xác nhận' để tiếp tục." và tạo tool `confirm_action` với pending action ID.

---

## 5. Lộ trình Triển khai (Phases) & Checklist

### Phase 1: Core MCP Server (Stdio Transport) — Ưu tiên cao
*Kết quả: Dev có thể test tool bằng Claude Desktop / Cursor ngay trên máy.*

- [x] Tạo thư mục `apps/mcp-server` trong monorepo, cấu hình Nx project.
- [x] Cài đặt dependencies: `@modelcontextprotocol/sdk`, `zod`, `@prisma/client`.
- [x] Tạo `prisma.ts` — khởi tạo PrismaClient dùng chung `DATABASE_URL`.
- [x] Viết `index.ts` (hoặc `main.ts`) — khởi tạo `McpServer`.
- [x] Implement **Nhóm 1**: `partner.tools.ts` (4 tools).
- [x] Implement **Nhóm 2**: `device-model.tools.ts` (4 tools).
- [x] Implement **Nhóm 3**: `license.tools.ts` (3 tools).
- [x] Implement **Nhóm 4**: `user.tools.ts` (5 tools).
- [x] Implement **Nhóm 5**: `device.tools.ts` (4 tools).
- [x] Tạo `resources/schema.resource.ts` — expose schema cho AI context.
- [ ] Viết file config `claude_desktop_config.json` mẫu.
- [x] **Test end-to-end**: Đã viết Unit Test Mock 100% thay cho test tay.

### Phase 2: SSE HTTP Transport — Deploy lên VPS
*Kết quả: MCP Server chạy trên VPS, Admin Dashboard web gọi được từ xa.*

- [x] Thêm `express` + SSE transport vào `mcp-server`.
- [x] Hoặc: Gộp MCP endpoint vào `core-api` module Admin (Đã chọn tách riêng express app trong `mcp-server`).
- [x] Expose endpoint `/sse` (kết nối luồng) + `/message` (tool call).
- [x] Thêm authentication middleware (`x-mcp-secret`).
- [x] Test kết nối từ bên ngoài (Đã cover qua integration testing với supertest/mock).
- [x] Tích hợp vào Docker Compose + CI/CD pipeline (đã có trong docker-compose.prod.yml).

### Phase 3: React Admin Dashboard + Chatbox UI
*Kết quả: Admin mở web, gõ chat tiếng Việt, AI trả lời + thực thi command.*

- [x] Khởi tạo project React mới (Admin-Web Vite App).
- [x] Cài đặt `ai`, `@ai-sdk/react`, `@ai-sdk/anthropic` (Đã cài vào `core-api` backend).
- [x] Thiết kế Chatbox UI (input, message list, loading states, tool call display - đã có trang AiChat.tsx).
- [x] Viết API route `/v1/admin/ai/chat/stream` — Vercel AI SDK gọi Claude + MCP tools (Đã hoàn thiện `ai.controller.ts`).
- [ ] Implement **Confirmation flow**: UI hiện popup xác nhận khi LLM gọi tool Mutation.
- [ ] Test full flow: Admin gõ → LLM hiểu → gọi tool → trả kết quả → hiển thị.
- [ ] Deploy Admin Dashboard (Vercel / Nginx).

---

## 6. Quy ước Code (Cho AI Agent viết code)

1. **Zod Validation**: Mọi MCP Tool phải có `description` cực rõ ràng (tiếng Anh) để LLM hiểu chính xác tool dùng khi nào, input gì. 
2. **Mutation Safety**: Tất cả tool create/update/delete phải có bước xác nhận. Không được tự động ghi DB khi chưa được admin confirm.
3. **Database Access**: Luôn dùng Prisma ORM. Không raw query trừ khi xử lý TimescaleDB hypertable đặc thù.
4. **Error Handling**: Try/catch mọi tool, trả message lỗi rõ ràng (tiếng Việt) cho admin đọc được.
5. **Tiếng Việt**: Tool trả response bằng tiếng Việt (vì admin là người Việt). Nhưng tool name và zod field name giữ tiếng Anh.
6. **Provider Swap**: KHÔNG import trực tiếp `@anthropic-ai/sdk`. Luôn dùng `@ai-sdk/anthropic` của Vercel AI SDK để đảm bảo đổi provider dễ dàng.
