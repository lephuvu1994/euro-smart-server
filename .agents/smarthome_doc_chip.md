# Tài liệu Hệ thống: Smart Home Chip/Nhúng (switch_door)

## 1. Tổng quan
Dự án firmware lập trình trên mô-đun vi điều khiển C/C++ thuộc nhánh Ai-WB2 Series cho "Công tắc Đóng/Mở cửa thông minh". Hệ thống vận hành trên môi trường RTOS, kết nối điều khiển lai (Hybrid) thông qua Wi-Fi (MQTT cho lệnh điều khiển xa), Bluetooth Low Energy (BLE) và Sáu bước điều khiển vô tuyến RF 433MHz. Hệ thống hoạt động theo chính sách License check thời gian thực.

## 2. Hệ máy trạng thái (State Diagram)
Firmware được thiết kế chịu lỗi liên tục, chuyển trạng thái vòng lặp thông minh đối phó sự cố mất mạng:
- **`NORMAL`**: Trạng thái chuẩn, LED xanh sáng cố định. Bộ thu nhận MQTT / Wi-Fi vận hành mở.
- **`CONFIG_BLE` & `CONFIG_AP`**: Chế độ nạp tham số ban đầu bằng Local. Nhấn giữ Stop+Open 10s. Ban đầu quảng bá mạng BLE, App kết nối nạp SSID, Password... Nếu kiệt thời gian (2 phút) fallback sang mở SoftAP tự thân cấp TCP Server cổng `8080` (IP: 192.168.4.1).
- **`OFFLINE_BLE` & `OFFLINE_AP`**: Trạng thái tái kích hoạt Wi-Fi khi định tuyến lỗi. Nó thử lại 20 vòng WiFi, nếu thất bại tiến hành phát vòng đời bảo hộ Offline Mode hỗ trợ điều khiển offline không qua server máy chủ đám mây, tự thoát về `NORMAL` khi có internet lai.
- **`LEARNING_RF`**: Vào ngưỡng dò RF bằng cách nhấn `RF_LEARN`. Chip chờ 4 xung nút từ Remote ngoài (Open > Close > Stop > Lock) qua GPIO để lưu mã mã hóa vào VFS Flash.
- **`LEARNING_TRAVEL`**: Chức năng học hành trình cuộn kéo vật lý cửa. Bộ đếm thời gian bắt đầu khi chạy Open và kết thúc khi click Stop (trong giới hạn 1~120s) rồi lưu cứng Flash, nhằm kiểm soát độ dừng tự động và % mở trên giao diện smartphone.
- **`EXPIRED`**: Quá trình SNTP check sau 15s bật. Nếu hết hạn tính năng từ Server, nháy LED cảnh báo đỏ tía. Không nhận lệnh nút/RF nhưng giữ MQTT chờ message gia hạn gửi thông số `license_days`.

## 3. Tương tác và Cảnh báo Vật lý
Sử dụng đa dạng tín hiệu:
- **Buzzer GPIO (Tít phát tiếng)**:
  - 1 dài: Chuyển môi trường chức năng (Vào config, vào dò).
  - 2 ngắn liên tiếp: Xác nhận khớp 1 lệnh từ remote.
  - 3 phát ngắn liên tục: Ghi đè cấu hình hoặc dò khớp mã xong hoàn tất thành công.
  - Vô cùng dài: Reset cạn thiết lập nhà máy hoặc Data RF.
- **Button Policy (Bảo mật thời gian ban đêm)**: Để chống rủi ro, thời điểm 22h-6h sáng các công tắc cơ ấn đơn sẽ vô hiệu (trừ RF) nhằm tránh vật va chạm/trẻ nhỏ tác động. Phải ấn Triple-click (3 chạm nhanh) hệ thống Relay mới trả lệnh.

## 4. Luồng khởi chạy phần cứng (Boot Pipeline)
1. Hàm `main()` truy xuất `proc_main_entry`.
2. Khởi tạo filesystem `EasyFlash` để nạp cài đặt cũ. Sleep delay 5 giây ổn định xung áp dòng diện.
3. Chạy độc lập `xTaskCreate` cho Switch Relay, RF 433 Polling Task, Buzzer, Button Watcher.
4. Gán Callbacks cho Event Handlers: MQTT, BLE Adapter. Lên mạng `lwIP stack`, Feed Watchdog Token.
5. Giải phóng con trỏ khởi tạo ban đầu để chừa trống bộ nhớ 16KB duy trì cho app loop.

## 5. Ánh xạ chân vi điều khiển (GPIO Setup)
Hỗ trợ ánh xạ qua bo Dev hoặc mạch in Production thông qua Marco:
- Nút nhấn dạng Input Pull-up: Mở/Đóng/Dừng bằng chân 7, 12, 4. Nút Học RF (16). Antenna RF 433MHz.
- Relay xuất điện cao Actuation `HIGH`: Đầu ra Open/Close/Stop tương tác qua GPIO (như chân 17, 11).
- Notification LED và Loa Tít đều hỗ trợ xuất I/O ra độc lập.

## 6. Cơ chế Đếm ngược Bản quyền (License Aging & Locking)

Phía phần cứng thực thi việc khóa (Locking) thông minh dựa theo State qua 3 giai đoạn độc lập Server:
1. **Lưu trữ bảo mật**: Ở trạng thái Config lần đầu (mạng BLE/SoftAP), payload App đẩy xuống có chứa `{"license_days": 180}` sẽ được lưu định hình vào mã EasyFlash. Giá trị thời điểm này là `activation_time = 0`.
2. **Kích hoạt & SNTP Sync**: Khi WiFi truy cập Internet thành công, chip sẽ lấy đồng bộ thời gian thực SNTP. Lúc này nếu xét `activation_time = 0`, chip tự ấn định lấy `Unix timestamp` của hệ thống tại điểm đó làm gốc.
3. **Theo dõi trạng thái EXPIRED**:
   Định kỳ quá trình quét hàm sẽ đếm theo công thức `Thời gian hiện tại > (Ngày kích hoạt + license_days * 86400 giây)`.
   - Nếu thỏa mãn thời gian hết hạn, thiết bị tự kích hoạt mode `EXPIRED`. Còi Beep 2 tiếng cảnh báo, ghim LED báo lỗi chớp tắt báo hiệu liên tục 3 lần / 3 giây.
   - Hệ thống thẳng tay `Reject` mọi thao tác ngắt mạch Relay từ công tắc bấm nút vật lý, lệnh nội bộ, BLE, RF và cả lệnh Mqtt bật rèm bình thường. Đóng băng các thiết bị.
   - Tuy nhiên chip vẫn duy trì kết nối mạng MQTT để chờ 1 kịch bản duy nhất là Server trả về lệnh JSON update `license_days` nhằm tái thiết vòng lặp và vượt chế độ này đưa máy trở lại `NORMAL`.
