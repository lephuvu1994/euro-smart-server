# Kế hoạch & Checklist: Admin Chatbox & MCP Server (Tính năng 8)

Đây là tài liệu gốc định hướng cho các AI Agent hỗ trợ sếp phát triển tính năng Chatbox Quản trị viên sử dụng Model Context Protocol (MCP).

## 1. Ngữ cảnh & Tầm nhìn
Mục tiêu là xây dựng một "Trợ lý AI Quản trị" (Admin Chatbox) trên một trang Admin Dashboard (React) hoàn toàn mới. Trợ lý này có khả năng hiểu ngôn ngữ tự nhiên và thực hiện các tác vụ quản lý hệ thống Euro Smart Home thông qua việc gọi các "Công cụ" (Tools).
Ví dụ câu lệnh: *"Hôm nay có bao nhiêu User đăng ký?"*, *"Cấp 500 license 90 ngày cho công ty B model C"*.

**Lợi ích của việc dùng chuẩn MCP**: Thay vì code các functions/tools trực tiếp vào api chung chung, ta xây dựng lớp MCP. Điều này tách biệt cực tốt giữa backend dữ liệu và LLM. Tương lai muốn đổi từ Claude (Anthropic) sang OpenAI (GPT-4) thì phần MCP Server backend **không cần thay đổi một dòng code nào**. Giao diện React chỉ cần thay đổi LLM provider bằng `Vercel AI SDK`.

---

## 2. Kiến trúc Hệ thống

Hệ thống được chia thành 3 cấu phần hoạt động chặt chẽ:

1. **Giao diện (Frontend React Admin Dashboard)**:
   - Một project web biệt lập mới.
   - Quản lý UI Chatbox.
   - Chứa logic gọi API lên LLM độc lập (ví dụ: `Vercel AI SDK` với OpenAI/Anthropic keys).

2. **Cầu nối (AI Gateway / MCP Client)**:
   - Backend web hoặc middleware giữ vai trò xác thực admin.
   - Giao tiếp với LLM.
   - Đóng vai trò là `MCP Client` kết nối qua giao thức SSE (Server-Sent Events) tới MCP Server.

3. **Backend logic (MCP Server)**:
   - Chạy trên node.js trong khối monorepo `euro-smart-server`.
   - Kết nối trực tiếp vào Database PostgreSQL via Prisma.
   - Cung cấp các "Tools" định nghĩa sẵn (kèm validate `zod` schema) cho MCP Client triệu gọi khi LLM cần.

---

## 3. Lộ trình Triển khai (Phases) & Checklist

### Phase 1: Xây dựng Core MCP Server (Stdio Transport)
*Triển khai dưới dạng chạy cục bộ trước. Bất kỳ AI session nào cũng có thể tạo và test logic tool với Claude Desktop của DEV ngay trên Terminal cục bộ.*

- [ ] Tạo module `apps/mcp-server` trong cấu trúc monorepo `euro-smart-server`.
- [ ] Cài đặt core dependencies: `@modelcontextprotocol/sdk`, `zod`.
- [ ] Tích hợp tái sử dụng `PrismaClient` từ monorepo để kết nối DB.
- [ ] **Viết Tools Nhóm 1**: Quản lý Quản trị Đối tác (Partner) - `list_partners`, `get_partner`, `create_partner`, `update_partner`.
- [ ] **Viết Tools Nhóm 2**: Quản lý Loại thiết bị (Device Model) - `list_device_models`, `create_device_model`, `update_device_model`.
- [ ] **Viết Tools Nhóm 3**: Cấp phép & Hạn mức (License/Quota) - `list_quotas`, `set_license`, `get_quota_usage`.
- [ ] **Viết Tools Nhóm 4**: System & User dashboard - `get_system_stats`, `count_users`.
- [ ] Setup File config `claude_desktop_config.json` để dev có thể test tool bằng Claude app của máy tính thông qua Stdio.

### Phase 2: Expose MCP Server qua mạng (SSE HTTP Transport)
*Nâng cấp mcp-server để dashboard web lấy JSON tool và gọi từ xa.*

- [ ] Setup `express` và middleware trong `mcp-server` (Hoặc cân nhắc gộp logic MCP Server thẳng vào module module Admin của `core-api` hiện tại để ăn ké luôn `JwtAccessGuard` có sẵn).
- [ ] Import `SSEServerTransport` của MCP SDK.
- [ ] Map các API `/mcp/sse` (để nhận kết nối luồng) và `/mcp/message` (để nhận webhook tool calls).
- [ ] Test kết nối HTTP Postman / Curl mọc ra từ SSE transport. Cố định tính bảo mật (yêu cầu Admin Token).

### Phase 3: Xây dựng Web Admin Dashboard & Tích hợp (React)
*Sang repository / dự án frontend mới.*

- [ ] Khởi tạo project React (Vite hoặc NextJS).
- [ ] Cài đặt `@ai-sdk/react`, `@ai-sdk/anthropic` hoặc `@ai-sdk/openai`.
- [ ] Viết UI container chatbox cơ bản.
- [ ] Cấu hình Client để wrap các Tools lấy từ SSE của server Euro Smart API vào trong parameter `tools` của function Vercel AI SDK.
- [ ] Chat thử nghiệm ngôn ngữ tự nhiên, quan sát quá trình Agent tự map câu "Tạo đối tác" -> gọi HTTP -> chọc DB.

---

## 4. Quy ước Code (Cho Lập trình viên AI)
1. **Zod Validation**: Mọi MCP Tool phải miêu tả schema rõ ràng cực độ (`description` trong Zod object) để LLM đọc và hiểu trường nào yêu cầu gì.
2. **Read-Only / Safety First**: Cố gắng try catch kỹ ở các hàm `Mutation` (tạo/sửa/xóa). 
3. **Database Access**: Luôn dùng Prisma, không dùng Raw query nếu không phải xử lý TimescaleDB time-series đặc thù. 
