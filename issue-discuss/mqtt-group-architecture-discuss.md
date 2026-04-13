# Phân tích & Thay đổi Kiến trúc: Khai tử MQTT Auto-Grouping cho WiFi

> Document này lưu trữ lại quá trình thảo luận và chốt phương án kiến trúc cho bài toán Scale 300,000 hành động đồng thời của Sensa-Smart Server (Ngày 13/04/2026).

## 1. Bài toán ban đầu: Giảm tải bằng MQTT Group

- **Kế hoạch Cũ:** Sử dụng MQTT Group Topic (`group/{groupCode}/set`) để gom nhóm các thiết bị. Server gọi 1 API tạo Group ngầm, sau đó chỉ cần gửi 1 gói tin MQTT vào Group là N thiết bị sẽ cùng nhận lệnh chạy.
- **Vấn đề phát sinh (Giới hạn phần cứng RAM):** Chip WiFi (Ai-WB2/BL602) chỉ lưu được `MAX_GROUPS = 10` (hoặc nâng lên 40). Nếu 1 thiết bị tham gia quá nhiều kịch bản hẹn giờ (Scene), nó sẽ cạn kiệt slot nhớ.

## 2. Nút thắt thật sự: Bản chất truyền dẫn MQTT qua WiFi vs Zigbee

Sự thật về MQTT Group qua Cloud Broker:

- **Với Zigbee/BLE Mesh:** Cấu trúc mạng Mesh coi Group Command là "Chân Lý". 1 gói lệnh từ Gateway phát ra dưới dạng sóng vô tuyến (RF Broadcast), 50 thiết bị bắt sóng và chạy cùng 1 lúc (Zero-delay, hoàn toàn không nghẽn sóng).
- **Với WiFi Cloud (Ai-WB2):** Thiết bị giao tiếp TCP/IP với EMQX Broker. Chuẩn Router WiFi ở nhà khách hàng KHÔNG hỗ trợ "Broadcast TCP/IP" cho mạng Internet ngoài. Khi EMQX nhận 1 tin nhắn vào Group, nó vẫn phải chia nhỏ thành 50 bản sao TCP Packets riêng biệt gửi xuống 50 Router nhà khách hàng.
  > => **Kết luận nền tảng:** Dùng MQTT Group trên Cloud không giảm được gánh nặng mạng WIFI vật lý của khách hàng. Nó chỉ giảm băng thông nội bộ Datacenter giữa NodeJS <-> EMQX.

_Mà sức mạnh của NodeJS dư sức đẩy 50,000 MQTT packet/giây. Việc Sensa-Smart từng bị "sập" là do nghẽn cổ chai PostgreSQL (N+1 Query) và BullMQ (Bloated Redis). Cả hai thứ này đều đã được khắc phục triệt để bằng **Compiled Actions** và **Zero-delay Inline Execution**, nên MQTT Group Topic vô tình trở thành một "Nợ Kỹ Thuật" rườm rà không cần thiết!_

## 3. Best Practice: Tách biệt Mạch Trigger và Mạch Action

Hệ thống Automation chuẩn công nghiệp (như Tuya, Home Assistant) cần tách biệt làm 2 tầng hoàn toàn độc lập với nhau (The Rule Engine Pipeline):

1. **Tầng The Trigger (Automation Rule / Tác nhân phân tích logic):**
   - Chịu trách nhiệm theo dõi lịch (Cronjob 11h), Thời tiết (Mưa), Báo thức, Chạm bằng tay (Tap-to-run), hoặc Device Event (Rèm mở thì -> ...).
   - Đây là "Não bộ". Nhiệm vụ duy nhất của bộ não là đánh giá TẤT CẢ điệu kiện. Nếu ra kết quả True => Nó chốt hạ bằng cách gọi bóp cò hàm `executeScene(sceneId)`.
2. **Tầng The Action (Scene / Khối chấp hành cơ bắp):**
   - Vô cùng đơn giản, mù quáng và trâu bò.
   - Nó không quan tâm ai gọi nó. Cứ nhận được tín hiệu `executeScene`, nó lôi mảng `compiledActions` ra khỏi ổ cứng và cắm đầu gửi thẳng hàng chục gói tin MQTT xuống cấp độ Device theo đúng thông số delay đã lưu. (Đây là nơi diễn ra Auto-grouping nếu có, nhưng đã bị bãi bỏ cho WiFi).

## 4. Quyết định Kiến trúc Tối hậu

Thống nhất **HỦY BỎ hoàn toàn tính năng MQTT Group Topic** rườm rà cho dàn thiết bị WiFi. Quy trình E2E (End-to-End) chốt lại cực kỳ tối giản và hiệu năng cao nhất:

1. **Lúc Tạo/Lưu Scene:** App gửi 30 hành động. Server tính toán `compiledActions` (1 chuỗi JSON tĩnh chứa sẵn mọi Command/Token), lưu thẳng vào Postgres. Độc lập, không dính líu thiết bị khác.
2. **Lúc Rule Engine kích hoạt:** Cronjob hoặc Cảm biến bóp cò gọi `runScene()`.
3. **Thực thi thần tốc:** Worker đọc khối `compiledActions`. Chạy thẳng dòng lệnh `Promise.all(actions.map(action => mqtt.publish(deviceTopic)))`.
   - Gánh nặng RAM Firmware: = 0.
   - Code Garbage Cleanup lúc mảng Backend: = 0.
   - Độ chịu tải: Vượt hàng chục nghìn thao tác/s (Zero-delay MQ).

## 5. Tầm nhìn Tương Lai (Bảo lưu cho IoT Zigbee Gateway)

Chiến lược **Sử dụng MQTT Group Topic** hoàn toàn không sai, nó chỉ sai thời điểm đối với chip WiFi. Bản nháp thuật toán này sẽ được giữ lại làm di sản cho Phase **Tích hợp Zigbee/BLE Gateway**. Lúc EMQX bắn 1 gói MQTT Group xuống Gateway, Gateway sẽ đổi nó thành sóng Radio Multicast vật lý -> Đó mới là đỉnh cao tốc độ thực thụ của IoT.

## 6. Tham chiếu: Cách Tuya xử lý Group cho WiFi

Tuya Cloud cũng fan-out N MQTT messages riêng lẻ cho WiFi devices. Firmware Tuya **KHÔNG biết Group tồn tại** — chỉ subscribe topic riêng (`tylink/{deviceId}/thing/property/set`). Cloud quản lý Group mapping và tự dispatch.

→ Xác nhận hướng đi: loại bỏ DeviceGroup infrastructure trên Server + Firmware, giữ Compiled Actions + inline fan-out (`Promise.all`).

## 7. Hành động đã thực hiện (13/04/2026)

- Xóa toàn bộ DeviceGroup module, schema, migration (dead code cho WiFi)
- Fix `needsRecompile` logic: sử dụng `versionSnapshot` thay vì logic `!compiledAt` bị hỏng
- Fix inline execution error handling: chỉ report success khi MQTT publish thật sự OK
- Bỏ fallback vô nghĩa trong `handleSceneDeviceActions` (let BullMQ retry)
- Giữ `configVersion` làm cơ chế bảo hiểm cho tương lai (OTA firmware thay đổi entity config)
