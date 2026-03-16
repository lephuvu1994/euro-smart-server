# API – HTTP request files (REST Client)

Thư mục này chứa các file `.http` để gọi API Smart Home (dùng với extension **REST Client** trong VS Code / Cursor).

## Cấu trúc

| File | Mô tả |
|------|--------|
| **api/auth.http** | Đăng ký (signup), đăng nhập (login admin/user) |
| **api/admin.http** | Partner, Device Model, Quota, MQTT Config (cần token admin) |
| **api/home.http** | Nhà (homes), tầng (floors), phòng (rooms), thành viên (members) |
| **api/device.http** | Đăng ký thiết bị, danh sách, chi tiết, điều khiển (setValue / setFeatureValue) |
| **api/scene.http** | Scene: CRUD (GET/POST/PATCH), chạy tay, trigger LOCATION / SCHEDULE / DEVICE_STATE, API báo vị trí. Hiện chưa có DELETE scene. |
| **api/_env.http** | Biến dùng chung (baseUrl, email, password, …) – tham khảo khi cần |

File gốc **api.http** ở root: chứa login nhanh và gợi ý dẫn tới các file trong `api/`.

## Cách dùng

1. Mở file `.http` (vd: `api/scene.http`).
2. Chạy request **Login** trước (request có `# @name loginUser` hoặc `loginAdmin`) để lấy token.
3. Các request sau sẽ dùng `{{loginUser.response.body.data.accessToken}}` (REST Client lưu response trong session).
4. Đổi `@baseUrl` ở đầu file nếu server chạy host/port khác (vd: `http://192.168.0.108:3001/v1`).

## Base URL & version

- Mặc định: `http://localhost:3001/v1`
- API version: `v1` (prefix trong path)

## Gợi ý

- Mỗi file có thể chạy độc lập; trong file cần token thì nên có 1 request login với `# @name` tương ứng.
- Id động (homeId, sceneId, deviceToken, …): sau khi tạo hoặc gọi GET list, copy id từ response rồi điền vào biến `@homeId`, `@sceneId`, … ở đầu file.
