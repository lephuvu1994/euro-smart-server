# Tài liệu Hệ thống: Smart Home Server (sensa-smart-server)

## 1. Tổng quan
Đây là hệ thống Backend trung tâm dạng Microservices quản trị theo nguyên tắc NX Monorepo. Nền tảng đảm nhiệm việc định tuyến người dùng, xử lý các tín hiệu IoT, lập lịch sự kiện, thực thi hàng đợi tin nhắn và cung cấp khả năng High Availability (HA) trải dài trên 2 máy chủ gốc (VPS) qua kết nối mã hóa Tailscale VPN.

## 2. Kiến trúc Monorepo (Apps & Libs)
Cấu trúc NX được cô lập logic kỹ càng giữa 3 Apps có khả năng tự Deploy và 3 bộ Shared Libraries chia sẻ tài nguyên.

### Deployable Apps:
- **`core-api` (Port 3001)**: Đóng vai trò REST API xử lý Business Entities (Tài khoản, Tổ ấm, Thiết bị, Ngữ cảnh automation). Ngoài ra nó chi phối quyền hạn bảo mật Authentication & ACL cho phép thiết bị nào được join vào Broker EMQX.
- **`iot-gateway` (Port 3003)**: Trụ cầu giao tiếp MQTT Broker. Gắn listeners lắng nghe message realtime, decode payload sau đó phát hành sang BullMQ để xử lý bất đồng bộ.
- **`worker-service` (Port 3004)**: Worker pool xử lý BullMQ Job Processes (Chạy các cron schedule, điều khiển device background, gửi Email hay SMS OTP/Cảnh báo).

### Shared Libraries:
- **`@app/common`**: Kho Utils, DTOs, Enums v.v. Chứa các Modules lớn hỗ trợ kết nối Mqtt gốc, tích hợp Vietguys Service, Mailer (Handlebar template). Tất cả file chung phải được export thông qua thùng barrel `index.ts`.
- **`@app/database`**: Adapter đóng gói Prisma ORM Module (`DatabaseService`).
- **`@app/redis-cache`**: Kết xuất xử lý liên quan in-memory store dùng thư viện `ioredis`.

## 3. Storage & Công cụ tích hợp (Tech Stack)
- **Runtime Core**: Node.js 22 (Alpine) & NestJS 11 framework chạy thông qua Webpack của NX. Sử dụng Yarn 4.9 Corepack.
- **Data Persistence**: Prisma v6 thao tác trên CSDL PostgreSQL kèm mở rộng TimescaleDB cho time-series (đo nhiệt độ, lịch sử di chuyển).
- **Messaging/Queue**: BullMQ vận hành qua Redis quản lý Email/Action Device queue.
- **Real-time IoT**: MQTT Broker là phần mềm EMQX. Tự động bảo chứng luồng xác thực bằng mã hóa HMAC.
- **Quy trình DevOps**: Phân phối CI/CD thông qua `docker-compose.prod.yml`, gộp cùng với Deploy HA Topology (HAProxy Layer 4 và Nginx SSL termination) chia cho "VPS1 Hậu cung" và "VPS2 Mặt tiền".

## 4. Chuẩn mực & Coding Code (Conventions & Rules)
1. **Naming & Typing**:
    - Chuẩn tên File: Kebab-case. Class & Object tuân theo PascalCase. DTO cần hậu tố `Dto`, Controller là `Controller`.
    - Không import tuyệt đối theo physical path để tránh rác Node resolution. Luôn sử dụng NX Alias (Vd: `@app/common`, `@app/database`).
2. **Quy tắc Phản hồi API REST**:
    - Trả về đối tượng Response thống nhất qua Interceptors: `{ statusCode, message, timestamp, data }`.
    - Lọc dữ liệu Output Response bằng class-transformer qua `@Expose` và `@Exclude` (vd che dấu hiệu Password hash).
3. **Database Domain Grouping**:
    - Tên bảng map sang định dạng `snake_case` (ví dụ `@@map("t_user")`). Sử dụng Uuid.
    - Entities chia nhóm: Catalog (Phần cứng), Device (Kiến trúc HA-style: Device → DeviceEntity → EntityAttribute), Home/Room (Cấu trúc phòng), Quota Control (License).
4. **Luồng Tương tác chéo App (Cross-app Communication)**:
    - Không import code chéo giữa các App. Phải liên kết qua hạ tầng System (Redis Pub/Sub hoặc BullMQ Queue), hoặc TCP Socket nếu có gateway.

## 5. Các Tính năng (Features) Hiện Có

Hệ thống hiện tại đang triển khai các modules nghiệp vụ và tác vụ chạy ngầm như sau:

**A. Về phía API (Core-API Modules)**
- **Admin**: Module quản lý tổng quát dành cho Quản trị viên hệ thống. Bao gồm quản lý Công ty/Đối tác (Partner), Khuôn mẫu thiết bị (Device Model), Sổ cái phần cứng (Hardware Registry), và đặc biệt là thiết lập hạn mức giấy phép (License Quota) cấp phát độc lập theo từng Model thiết bị của mỗi Đối tác/Công ty khác nhau.
- **User**: Module chứng thực tài khoản (Auth), quản lý người dùng và hồ sơ cá nhân.
- **Home & Room**: Quản trị cấu trúc "Tổ ấm" (cấp quyền thành viên, quản trị địa lý) và quản lý phân vùng các "Phòng" trong nhà.
- **Device**: Quản trị toàn bộ vòng đời thiết bị với kiến trúc 3-tier HA-style (Device → Entity → Attribute). Bao gồm Provisioning (Thêm mới và cấp phát), lưu trữ đa dạng các Entity đại diện (chứ không còn là feature đơn thuần), lưu trữ thuộc tính con/lịch sử thông qua EntityAttribute và EntityStateHistory, và giao thức chia sẻ quyền.
- **Scene**: Module quản trị cấp độ logic (Smart Automations) thiết lập hệ hành vi nhóm các hành động và kịch bản (Automation Scenes) tùy theo ngữ cảnh.
- **EMQX-Auth**: Chức năng trọng tâm quản lý bảo mật ACL trực tiếp và chứng thực động cho Broker EMQX (Chỉ cấp phép cho những thiết bị hợp lệ mới được kết nối).

**B. Về phía tiến trình nền (Worker-Service & Processors)**
- **Device-Control Processor**: Hàng đợi BullMQ chuyên thực thi và điều tiết lưu lượng lệnh điều khiển (Control Commands) gửi xuống thiết bị phần cứng thực.
- **Device-Status Processor**: Hook lắng nghe, bóc tách và đồng bộ các thay đổi trạng thái (Status/Telemetry) báo cáo về Database.
- **Email & Notification Processors**: Quản trị hàng đợi dịch vụ ngoài, lo việc gửi SMS/Push Notification hay Email (như mã OTP, cảnh báo lỗi thiết bị, hết hạn bản quyền).
- **Midnight Scheduler**: CronJob hệ thống khởi chạy tự động lúc nửa đêm để bảo trì dữ liệu, dọn dẹp hoặc quét các thiết bị có trạng thái offline bất thường/hết hạn quota.

## 6. Cơ chế Quản lý Bản quyền (License Quota Flow)

Hệ thống thiết lập một vòng đời quản lý License độc lập kết nối giữa Server và Thiết bị phần cứng:
- **Khởi tạo và Cấp phát API**: Admin quản lý số hạn mức (`licenseDays` mặc định, vd: 90 ngày) trong Database `LicenseQuota`. Khi Mobile App thực hiện Provisioning thiết bị mới qua API, Backend sẽ rà soát Quota hợp đồng và kéo `licenseDays` xuống đẩy thẳng vào JSON payload cài đặt gốc.
- **Backend gia hạn Mqtt**: Thông qua Mqtt, Server có quyền chủ động bắn một payload `{"license_days": <days>}` trực tiếp xuống một thiết bị IoT đang chết/hết hạn bất cứ lúc nào để hồi sinh hoặc gia tăng thêm thời hạn hợp đồng.

## 7. Các Core Module Mở rộng (History, Config & Notification)

Hệ thống Backend (BE) còn đi kèm các cơ chế bổ trợ cực kỳ quan trọng giúp định hình một nền tảng Smart Home vững chắc:

- **Cơ chế Thông báo Đa kênh (Async Notification)**:
  Mảng gửi tin được vận hành hoàn toàn bất đồng bộ để tránh nghẽn tải. BE sử dụng hàng đợi BullMQ (Redis) thông qua các Worker như `notification.processor.ts` và `email.processor.ts`. Cơ chế này chịu trách nhiệm push song song các luồng thông báo Push Notification (App iOS/Android), tin nhắn SMS (từ Modules SIM vật lý/Vietguys API) hoặc Email OTP/Cảnh báo tự động về trạng thái lỗi/hết hạn của thiết bị.
- **Lưu trữ Lịch sử (History & Audit Log với TimescaleDB)**:
  Sơ đồ cơ sở dữ liệu tích hợp TimescaleDB để giải quyết bài toán Time-series Data chuyên biệt. Hai bảng chính `EntityStateHistory` và `DeviceConnectionLog` vận hành dưới dạng Hypertable. Ưu điểm nổi bật là nó truy vết chéo chính xác **Nguồn sự kiện (Source)**: Hành động đó đến từ đâu (Siri, bấm vật trên App, do Automation Scene, MQTT ngoài) và do **Ai** (`actionByUserId`) thực thi.
- **Cấu hình Động dạng JSON (Dynamic Component Blueprint)**:
  - Lớp khuôn mẫu (`DeviceModel`) duy trì một bảng mạch Blueprint định dạng JSONB (`config`) quyết định tập hợp Entities + Attributes chuẩn cho toàn nhóm.
  - Hệ thống cho cấp quyền "Overrides" linh động trên cấp thiết bị riêng lẻ (`Device`). Cột `customConfig` (JSON) cho phép quản trị viên lưu chèn thông số tùy biến truyền xuống chip mà không cần sửa code hệ điều hành Firmware. (Ví dụ: Định danh Modbus Slave ID riêng, hay tần số phát riêng dùng cho 1 nhà duy nhất).

## 8. Cơ chế Thông báo Theo từng Người dùng (Per-User Notification)

Hệ thống được thiết lập để hỗ trợ nhận thông báo cá nhân hóa cho từng tài khoản, đảm bảo tính linh động trong môi trường gia đình có nhiều thành viên:

- **Quản lý Mã thông báo (Push Token) qua Phiên (Session)**:
  - Một người dùng có thể đăng nhập trên nhiều thiết bị vật lý khác nhau (ví dụ: một điện thoại cá nhân và một máy tính bảng dùng chung). 
  - Thay vì lưu token trực tiếp trong bảng `User`, mã `pushToken` được lưu trong bảng `Session`. Khi hệ thống cần gửi thông báo cho "Tài khoản A", nó sẽ truy vấn tất cả các phiên hoạt động có token hợp lệ của tài khoản đó để đẩy tin đi đồng thời.
- **Phân luồng Gửi tin (Routing Logic)**:
  - Khi một sự kiện thiết bị xảy ra (ví dụ: rèm cửa bị kẹt), hệ thống sẽ tự động xác định các đối tượng cần nhận tin bao gồm: **Chủ sở hữu (Owner)**, **Thành viên trong nhà (Home Members)** và những **Người được chia sẻ (Shared Users)**. 
  - Cơ chế này cho phép các thành viên khác nhau trong cùng một "Tổ ấm" đều có thể nhận được cảnh báo kịp thời.
- **Tùy chỉnh Thông báo (User Preferences - Planned/Extensible)**:
  - Hiện tại, tính năng bật/tắt thông báo đang được thiết lập ở mức độ thiết bị (`Device.customConfig.notify`). 
  - Tuy nhiên, kiến trúc hệ thống cho phép mở rộng dễ dàng sang cấu hình riêng cho từng cá nhân (ví dụ: Người dùng A muốn nhận tin báo cửa mở, nhưng người dùng B thì không). Điều này có thể được hiện thực hóa thông qua việc lưu cấu hình JSON vào cột `sortOrder` hoặc mở rộng bảng `DeviceShare` để lưu các cờ (flag) thông báo riêng biệt cho từng người được chia sẻ.
- **Loại trừ Người thực hiện (Excluding Initiator)**:
  - Hệ thống hỗ trợ logic thông minh để tránh gửi thông báo phiền hà. Ví dụ, nếu bạn là người trực tiếp bấm nút "Mở cửa" trên App, hệ thống sẽ tự động loại trừ bạn khỏi danh sách nhận thông báo "Cửa đã mở", trong khi các thành viên khác vẫn nhận được tin để đảm bảo an ninh.

## 9. Cơ chế Tối ưu Hiệu năng (Scalability & 200k Devices)

Hệ thống được thiết kế để mở rộng và chịu tải cao (Scalability) lên tới 200,000 thiết bị kết nối đồng thời, cấu trúc tối ưu ở các khía cạnh sau:

- **Redis Caching & Reverse Indexing**: Việc tiêu thụ CPU và kết nối Database được giảm thiểu tối đa bằng Cache. `DeviceStateService` caching 5 phút bằng phương pháp Cache-aside. Automations/Scenes áp dụng kiến trúc O(1) Lookup qua `SceneTriggerIndexService`, thiết bị gửi status lên sẽ không cần Full Scan bảng tính mà chỉ dùng Redis Reverse-Index.
- **BullMQ Distributed Locking & Dead Letter Queue (DLQ)**: Quá trình lập lịch (Worker Cron) có tích hợp Distributed Lock để tránh tình trạng nhiều Node cùng kích hoạt một Scene. Nếu lệnh fail, BullMQ hỗ trợ DLQ để retry (3 attempts với socket `emitToDevice`) nhằm tăng tính bền bỉ.
- **Quota & Rate Limiting**: Triển khai trực tiếp `minIntervalSeconds` cho mỗi Scene và `maxSchedules / maxTimers` trên Users ở ranh giới Schema để giới hạn lưu lượng rác ngập lụt hệ thống.
- **Database Performance Indexes**: Lắp ráp `CONCURRENTLY INDEX` cực nhẹ trên Postgres như GIN index đối với JSON `triggers`, đảm bảo các thao tác đọc và check điều kiện được giảm tải OOM triệt để.
