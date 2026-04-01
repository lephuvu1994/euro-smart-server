# Smart Home - To Do List Tính Năng Mới

Tài liệu này dùng để theo dõi, phân tích và lên kế hoạch (To-Do) cho các tính năng hệ thống chuẩn bị phát triển, giúp duy trì ngữ cảnh cho AI và team.

---

## Tính năng 1: Smart Scene (Ngữ cảnh / Tự động hóa)

**Trạng thái**: Chuẩn bị triển khai / Đang lên kế hoạch.

### 1. Mô tả tổng quan

Tính năng "Scene" cho phép người dùng nhóm nhiều hành động điều khiển thiết bị lại với nhau và tự động hóa chúng dựa trên các sự kiện hoặc thời gian (If - Then).
Thay vì điều khiển thủ công, hệ thống tự động nhận diện **Nguồn kích hoạt (Trigger)** và phát lệnh đồng thời hàng loạt **Hành động (Action)** xuống mạch phần cứng.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api & worker-service)**

- [ ] Cấu trúc lại Database Schema cho `Scene`: Cần làm rõ cấu trúc lưu trữ `triggers (JSON)` và `actions (JSON)`. Hệ thống cần parse JSON này một cách sạch nhất và dễ mở rộng các phép logic (AND / OR).
- [ ] Phát triển **Scene Rule Engine**: Service đọc các điều kiện từ Database (ví dụ "Nhiệt độ > 30°C") liên tục mỗi khi `Device-Status Processor` nhận telemetry mới từ MQTT.
- [ ] Phát triển Scheduler Worker: Tích hợp Node-cron hoặc BullMQ Repeatable Jobs trong `worker-service` để xử lý các Trigger hẹn giờ thời gian thực (Time-based triggers).
- [ ] Phát triển **Action Executor**: Dịch JSON các hành động cần làm thành các bản payload MQTT (Ví dụ: `{"state": 1}`, `{"position": 100}`) và bắn xuống các device cụ thể.

**B. Phía Mobile App (App: new-app)**

- [ ] Khởi tạo thư mục và Route mới: `src/features/scene` hoặc mở rộng trên trang Smart-Screen hiện thời.
- [ ] Thiết kế UI/UX "Danh sách ngữ cảnh": Hiển thị các Scene cơ bản (Ra khỏi nhà, Về nhà, Đi ngủ...), có nút Kích hoạt nhanh bằng tay.
- [ ] Thiết kế UI/UX "Trình tạo Builder ngữ cảnh": Trải nghiệm kéo-thả hoặc danh sách luồng công việc chọn **IF** (Time, Device changes, Cảnh báo) và **THEN** (On/Off công tắc, Delay n phút).
- [ ] Tích hợp API và State Management (Zustand + React Query) để đồng bộ thông tin cấu hình này lên Server.

**C. Phía Thiết bị Nhúng (Firmware: switch_door)**

- [ ] Tối ưu hóa MQTT Receiver: Khi một Scene kích hoạt nhiều thiết bị cùng lúc trong 1 khoảng thời gian cực ngắn (Milliseconds), thiết bị nhận cần chịu tải và đáp ứng lập tức không bị miss (rơi bản tin).
- [ ] Tối ưu hóa hiệu năng đo báo trạng thái: Rút ngắn thời gian trễ khi công tắc chuyển trạng thái để báo về Server làm Trigger mồi (Event Trigger) cho các Scene tiếp theo.

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Engine chạy trên đám mây (Cloud) hoàn toàn hay hỗ trợ Local Scene (Offline)? Nếu offline thì Gateway cục bộ hay Tự thân các MQTT Device liên lạc được với nhau qua mạng LAN (LAN Broadcasting)?
- Việc thực thi Scene Actions có hỗ trợ Delay không? (VD: Đóng rèm, 10 giây sau tắt đèn). Nếu có, backend BullMQ sẽ phải vận hành tiến trình Queue bị tạm ngưng (Delayed jobs).
- Xử lý xung đột (Collision): Chuyện gì xảy ra khi Scene 1 ra lệnh mở công tắc, trùng thời điểm Scene 2 ra lệnh tắt công tắc? Ràng buộc tính ưu tiên ra sao?

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

**B. Phía Mobile App (App: new-app)**

- [ ] Thiết kế UI trang "Quản lý thành viên/Chia sẻ": Hiển thị danh sách những người đang có quyền truy cập thiết bị.
- [ ] Thiết kế UI trang "Mời thành viên": Nhập ID, Email hoặc quét mã QR của người nhận.
- [ ] Tích hợp API chia sẻ: Gọi các endpoint mới để thực hiện luồng mời và chấp nhận.
- [ ] Xử lý Trạng thái hiển thị (UI logic): Ẩn các nút "Setting" hoặc "Delete" nếu người dùng hiện tại chỉ có quyền Viewer/Editor.

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)

- Cơ chế mời qua cái gì là tối ưu nhất? (Email link, QR Code quét trực tiếp, hay nhập số điện thoại ID người dùng).
- Có giới hạn số lượng người được chia sẻ trên một thiết bị không?
- Khi chủ sở hữu xóa thiết bị (Unbind), tất cả các liên kết chia sẻ có tự động bị xóa sạch không? (Dự kiến là có).

---

## Tính năng 3: Timer & Schedule (Hẹn giờ và Lịch trình)

**Trạng thái**: Đang lên kế hoạch.

### 1. Mô tả tổng quan

Cho phép người dùng đặt lịch bật/tắt thiết bị theo thời gian cố định, đếm ngược hoặc lặp lại theo các ngày trong tuần.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: worker-service)**

- [ ] Xây dựng bảng `DeviceTimer` và `DeviceSchedule`.
- [ ] Tích hợp BullMQ để quản lý các Jobs đếm ngược (Countdown).
- [ ] Xây dựng Scheduler (Cron) để quét và thực thi các lịch trình lặp lại hàng ngày/hàng tuần.

**B. Phía Mobile App (App: new-app)**

- [ ] UI thiết lập thời gian (Time picker).
- [ ] UI chọn ngày lặp lại trong tuần.

---

## Tính năng 5: Update User Profile (Cập nhật thông tin cá nhân)

**Trạng thái**: Đang triển khai (BE đã có API cơ bản).

### 1. Mô tả tổng quan
Cho phép người dùng thay đổi thông tin định danh cá nhân như Tên (First Name), Họ (Last Name) và ảnh đại diện (Avatar). Đây là bước cơ bản để cá nhân hóa trải nghiệm người dùng trong hệ thống nhà thông minh.

### 2. Checklist Triển khai (To-Do)

**A. Phía Server (Backend: core-api)**
- [x] Phát triển API Endpoint `PUT /v1/user`: Cập nhật thông tin `firstName`, `lastName`, `avatar`.
- [ ] Tích hợp xử lý Upload ảnh Avatar: Sử dụng S3 hoặc Local Storage để lưu trữ ảnh thực tế thay vì chỉ lưu chuỗi string.
- [ ] Validation nâng cao: Kiểm tra độ dài, ký tự đặc biệt cho tên người dùng.

**B. Phía Mobile App (App: new-app)**
- [ ] Thiết kế UI màn hình "Hồ sơ cá nhân" (Profile): Hiển thị thông tin hiện tại và các trường cho phép chỉnh sửa.
- [ ] Tích hợp API Update: Gọi endpoint `PUT /v1/user` khi người dùng nhấn "Lưu".
- [ ] Chức năng đổi Avatar: Tích hợp `expo-image-picker` để chọn ảnh từ thư viện hoặc chụp ảnh mới.
- [ ] Đồng bộ State: Cập nhật thông tin mới vào Zustand store ngay sau khi update thành công để hiển thị đồng bộ trên toàn app.

### 3. Những câu hỏi Mở / Thảo luận kiến trúc (Open Issues)
- Có nên cho phép đổi Số điện thoại / Email tại đây không? (Thường cần qua luồng OTP riêng để đảm bảo bảo mật).
- Kích thước ảnh tối đa cho Avatar là bao nhiêu để tối ưu dung lượng lưu trữ?
