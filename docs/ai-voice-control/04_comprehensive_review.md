# 4. Comprehensive Code Review — AI Agent & MCP Server

> Reviewed: 2026-04-17  
> Scope: `core-api/modules/ai/*`, `mcp-server/src/*`

---

## TL;DR — Tổng kết nhanh

| Hạng mục                      | Đánh giá         | Ghi chú                                              |
| ----------------------------- | ---------------- | ---------------------------------------------------- |
| Kiến trúc tổng thể (Admin AI) | ✅ Tốt           | SSE streaming, tool calling, BullMQ đều đúng pattern |
| Kiến trúc mới (User AI)       | ⚠️ Cần sửa 5 lỗi | Xem chi tiết bên dưới                                |
| MCP Server security           | ✅ Tốt           | userId injection + ownerId filter đúng               |
| System Instruction            | ⚠️ Cần cải thiện | Chưa tối ưu cho Voice/TTS                            |
| Legacy `chat()` method        | ⚠️ Thiếu userId  | Không có injection → chỉ dùng cho Admin              |
| Docs architecture             | ✅ Đúng hướng    | Cần cập nhật 1 vài chi tiết                          |

---

## PHẦN 1: CÁC LỖI CẦN SỬA NGAY

### 🔴 Bug 1: Escaped newline trong System Instruction (ai.service.ts:304)

```typescript
// HIỆN TẠI (SAI) — double-escaped \\n sẽ render literal "\n" thay vì xuống dòng
const userContextStr = userId ? `\\\\nYou are assisting...` : '';

// ĐÚNG — dùng \n bình thường
const userContextStr = userId ? `\nYou are assisting End-User ID: ${userId}. ...` : '';
```

**Tại sao quan trọng:** Gemini sẽ nhận được literal text `\n` thay vì xuống dòng thật, làm instruction bị dính vào câu trước → AI có thể hiểu sai context.

---

### 🔴 Bug 2: `chatStream` gọi Gemini 2 lần khi không có tool calls (ai.service.ts:307→333)

Khi Gemini trả về response mà **không có function calls**, code hiện tại:

1. Gọi `generateContent()` (L307) — **non-streaming**, tốn thời gian chờ full response
2. Phát hiện không có tool calls → Gọi lại `generateContentStream()` (L333) — **streaming**

**Vấn đề:** Lãng phí 1 request Gemini API hoàn toàn (và tiền API). Response đầu tiên bị bỏ đi.

**Giải pháp đề xuất:** Dùng `generateContentStream()` ngay từ đầu. Nếu chunk đầu tiên chứa `functionCall`, collect lại để xử lý tools. Nếu không, stream thẳng.

> _Lưu ý: Đây là lỗi từ code CŨ, không phải code mới. Nhưng cần lưu ý khi tối ưu._

---

### 🔴 Bug 3: Legacy `chat()` method thiếu userId injection (ai.service.ts:190-254)

Method `chat()` (sync, legacy) **hoàn toàn không có userId injection**. Nếu Admin endpoint (`AiController`) gọi `chat()`, MCP tools sẽ không có `userId` → đúng behavior (Admin thấy tất cả).

Tuy nhiên: **không ai nên gọi `chat()` cho End-User**. Hiện tại `AiAppController` gọi `chatStream()` nên OK. Nhưng cần đánh dấu `chat()` là `@deprecated` để tránh nhầm lẫn sau này.

---

### 🟡 Bug 4: `FunctionCallingConfigMode.ANY` ép Gemini luôn gọi tool (ai.service.ts:318)

```typescript
toolConfig: {
  functionCallingConfig: {
    mode: FunctionCallingConfigMode.ANY, // ← Bắt buộc gọi tool
  },
},
```

`ANY` mode = Gemini **bắt buộc phải gọi ít nhất 1 tool** trong mọi response. Điều này có nghĩa:

- User hỏi "Hôm nay thời tiết thế nào?" → Gemini vẫn **phải** gọi 1 MCP tool (ví dụ `list_devices`) dù không liên quan.
- User hỏi "Cảm ơn bạn" → Gemini vẫn phải gọi tool.

**Đề xuất:** Đổi sang `FunctionCallingConfigMode.AUTO` để Gemini tự quyết định có cần gọi tool hay không.

---

### 🟡 Bug 5: `req: any` trong AiAppController (ai.app.controller.ts:37)

```typescript
@Req() req: any, // ← Thiếu type safety
```

Nên dùng type chuẩn của project (ví dụ `Request & { user: { id: string } }`) hoặc decorator `@GetUser()` nếu có.

---

## PHẦN 2: ĐÁNH GIÁ CODE CŨ (Trước khi sửa)

### 2.1 `ai.service.ts` — Kiến trúc gốc

| Thành phần                              | Đánh giá                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| MCP Connection + Retry                  | ✅ Tốt. Exponential backoff, max 10 retries, lazy init                                                                                 |
| `connectionPromise` singleton           | ✅ Tốt. Tránh race condition khi nhiều request cùng lúc                                                                                |
| `refreshTools()` — JSON Schema → Gemini | ⚠️ Chấp nhận được nhưng **mất thông tin**. Zod enum, union, default đều bị bỏ qua khi convert. Gemini chỉ nhận `type` + `description`. |
| Conditional googleSearch exclusion      | ✅ Đúng. Fix lỗi Gemini 400 khi mix built-in tools + custom tools                                                                      |
| `chat()` legacy method                  | ⚠️ Hoạt động nhưng thiếu streaming, thiếu history, thiếu userId                                                                        |
| `chatStream()` method                   | ✅ SSE events pattern tốt: `tool_start → tool_call → tool_result → stream_start → delta → done`                                        |

### 2.2 `ai.controller.ts` — Admin Controller

| Thành phần                           | Đánh giá                                                                      |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| Route prefix `/admin/ai`             | ✅ Đúng namespace                                                             |
| `@AllowedRoles([UserRole.ADMIN])`    | ✅ Đúng, chỉ Admin truy cập                                                   |
| `getTools()` endpoint                | ⚠️ Dùng `(this.aiService as any)` → type-unsafe. Nên expose qua public getter |
| `chatStream()` không truyền `userId` | ✅ Đúng — Admin không cần scoped                                              |

### 2.3 MCP Server `main.ts`

| Thành phần                              | Đánh giá                                 |
| --------------------------------------- | ---------------------------------------- |
| `createMcpServerInstance()` per session | ✅ Đúng pattern 1:1 Server:Transport     |
| `transport.sessionId` as Map key        | ✅ Fix đúng bug UUID routing             |
| `MCP_SECRET` header auth                | ✅ Cơ bản nhưng đủ cho internal service  |
| `confirm_action` tool                   | ✅ Pattern tốt. MUTATION luôn qua 2 bước |

### 2.4 MCP Tools (Code gốc trước khi sửa)

| Tool                      | Vấn đề gốc                                                            |
| ------------------------- | --------------------------------------------------------------------- |
| `list_devices`            | ❌ Không có ownership filter → End-user thấy toàn bộ hệ thống         |
| `get_device_status`       | ❌ Không check ownership → Redis fallback cho phép query bất kỳ token |
| `set_device_entity_value` | ❌ `userId: 'admin-ai'` hardcode → Không biết ai thực sự ra lệnh      |
| `list_scenes`             | ❌ `findMany({})` → Trả về scene của mọi Home                         |
| `run_scene`               | ❌ `findUnique` không check Home ownership                            |
| `delete_scene`            | ❌ Tương tự                                                           |

**Kết luận code gốc:** Hoàn toàn phù hợp cho Admin dashboard, nhưng **không thể dùng trực tiếp cho End-User** vì thiếu multi-tenant isolation.

---

## PHẦN 3: ĐÁNH GIÁ CODE MỚI (Sau khi sửa)

### 3.1 `ai.app.controller.ts` — ✅ Đúng hướng

- Route `/app/ai` tách biệt hoàn toàn với `/admin/ai`
- `@AllowedRoles([UserRole.USER])` đúng
- Extract `userId = req.user.id` từ JWT → truyền vào service
- **Cần sửa:** `req: any` → Dùng typed request

### 3.2 AiService userId injection — ✅ Đúng cốt lõi

```typescript
if (userId) {
  args['userId'] = userId; // 🛡 INJECTION FILTER
}
```

**Điểm mạnh:**

- Force-override: Dù Gemini có cố tình truyền `userId` khác, server sẽ ghi đè bằng giá trị thật
- Áp dụng cho MỌI tool call, không cần AI "nhớ" phải truyền userId

**Điểm yếu:**

- Chỉ inject trong `chatStream()`, không inject trong `chat()` → OK vì `chat()` chỉ Admin dùng, nhưng nên đánh dấu `@deprecated`

### 3.3 MCP Tools userId filtering — ✅ Đúng pattern

| Tool                       | Cách filter                              | Đánh giá                 |
| -------------------------- | ---------------------------------------- | ------------------------ |
| `list_devices`             | `ownerId: userId`                        | ✅ Trực tiếp trên Device |
| `get_device_status`        | `ownerId: userId` + block Redis fallback | ✅ An toàn               |
| `get_device_detail`        | `ownerId: userId`                        | ✅                       |
| `set_device_entity_value`  | `ownerId: userId` + BullMQ log userId    | ✅ Audit trail đúng      |
| `list_scenes`              | `home: { ownerId: userId }`              | ✅ Qua relation          |
| `get_scene_detail`         | `home: { ownerId: userId }`              | ✅                       |
| `run_scene`                | `home: { ownerId: userId }`              | ✅                       |
| `toggle_scene_active`      | `home: { ownerId: userId }`              | ✅                       |
| `delete_scene`             | `home: { ownerId: userId }`              | ✅                       |
| `count_devices_by_partner` | Block if userId present                  | ✅ Admin-only            |
| `list_hardware`            | Block if userId present                  | ✅ Admin-only            |
| `update_firmware_version`  | Block if userId present                  | ✅ Admin-only            |

---

## PHẦN 4: KHUYẾN NGHỊ CẢI THIỆN

### 4.1 System Instruction cho Voice/TTS

Hiện tại system instruction quá dài và hướng text. Cho End-User voice, cần instruction ngắn gọn hơn:

```
You are Sena, a friendly AI assistant for Sensa Smart Home.
Respond in short, natural spoken language suitable for Text-to-Speech.
Do NOT use markdown, tables, code blocks, or bullet points.
Keep responses under 2 sentences when possible.
Always call tools to get real data — never make up device names or states.
Reply in language: ${lang}.
```

### 4.2 Tách Redis connection ra shared module (MCP Server)

Hiện tại `device-control.tools.ts` và `scene.tools.ts` đều tạo riêng `new Redis()` và `new Queue()`:

```
// device-control.tools.ts  →  const redis = new Redis({...}); const deviceQueue = new Queue(...)
// scene.tools.ts            →  const redis = new Redis({...}); const deviceQueue = new Queue(...)
```

**Vấn đề:** 2 Redis connections + 2 BullMQ Queue instances cho cùng 1 queue `device_controll`.  
**Đề xuất:** Tạo `shared/redis.ts` export singleton.

### 4.3 Xem xét `userId` visible trong Gemini tool schema

Hiện tại `userId` xuất hiện trong Zod schema → Gemini **thấy** parameter này trong tool definition. Gemini có thể:

- Tự điền `userId` sai (bị ghi đè bởi interceptor, nên OK)
- Hỏi user "userId của bạn là gì?" (gây confuse)

**Đề xuất:** Thêm `.describe('INTERNAL. Do NOT ask user for this value. It is auto-injected by the system.')` vào tất cả `userId` fields.

### 4.4 Pending Action (confirm_action) cho End-User

Hiện tại `createPendingAction()` trả về mã xác nhận 8 ký tự. Với End-User voice flow:

- AI trả về "Mã xác nhận: ABC12345. Hãy nói 'xác nhận ABC12345' để thực hiện."
- User phải đọc lại mã bằng giọng nói → trải nghiệm kém

**Đề xuất cho Voice:** Bypass confirmation cho End-User, hoặc dùng simple "yes/no" thay vì mã 8 ký tự. Có thể kiểm tra bằng `userId` presence: nếu có userId thì auto-execute, vì đã xác thực JWT rồi.

---

## PHẦN 5: CHECKLIST SỬA LỖI

| #   | File                      | Lỗi                                | Mức độ      | Action                     |
| --- | ------------------------- | ---------------------------------- | ----------- | -------------------------- |
| 1   | `ai.service.ts:304`       | `\\\\n` escaped sai                | 🔴 Critical | Sửa thành `\n`             |
| 2   | `ai.service.ts:307-333`   | Double API call khi không có tools | 🟡 Optimize | Refactor sang stream-first |
| 3   | `ai.service.ts:318`       | `FunctionCallingConfigMode.ANY`    | 🟡 UX       | Đổi sang `AUTO`            |
| 4   | `ai.app.controller.ts:37` | `req: any`                         | 🟢 Minor    | Add type                   |
| 5   | `ai.service.ts:190`       | `chat()` thiếu userId              | 🟢 Info     | Mark `@deprecated`         |
| 6   | MCP tools                 | `userId` description               | 🟢 Minor    | Add "INTERNAL" prefix      |
| 7   | MCP tools                 | Duplicate Redis instances          | 🟢 Refactor | Extract shared module      |
