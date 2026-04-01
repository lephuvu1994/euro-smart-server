# Tài liệu Hệ thống: Smart Home Mobile App (new-app)

## 1. Tổng quan
Ứng dụng di động quản lý nhà thông minh (Smart Home) phát triển dựa trên nền tảng Obytes React Native Template. Ứng dụng hỗ trợ kết nối, cấu hình và điều khiển các thiết bị trong nhà thông qua REST API và giao thức thời gian thực MQTT.

## 2. Công nghệ Cốt lõi
- **Framework & Runtime**: React Native 0.81.5 chạy với công cụ phát triển tĩnh Expo SDK 54.
- **Ngôn ngữ lập trình**: TypeScript.
- **Routing**: Expo Router 6 (Luồng điều hướng theo cấu trúc thư mục).
- **UI/Styling**: TailwindCSS được tích hợp bởi NativeWind/Uniwind. Các thành phần kết dính hệ thống giao diện nằm phần lớn trong cấu hình global.css.
- **State Management**:
  - **Zustand**: Quản lý global states cho phần cứng (home, config, notification, device, auth).
  - **React Query**: Tự động cache, fetch dữ liệu từ REST API.
- **Form Validation**: TanStack Form kết hợp Zod.
- **Local Storage**: MMKV (Database Key-value bộ nhớ cục bộ đồng bộ siêu tốc lượng nhỏ).
- **Kết nối/Real-time**:
  - Chạy HTTP API request đến core-api.
  - Chạy MQTT Client (`src/lib/mqtt`) để nhận bản tin báo cáo thay đổi thiết bị và gửi lệnh điều khiển mượt mà.

## 3. Cấu trúc thư mục (Code Structure)
Dự án sử dụng Feature-Driven Development.

```text
src/
├── app/              # Expo Router (Các màn hình mobile, tablet chính)
├── components/       # Các Component View tái sử dụng.
│   ├── ui            # Base UI (Button, Input, Icon...)
│   ├── layout        # Bố cục màn hình
│   └── base          # Scene, Timeline, Header phức hợp
├── constants/        # Tệp lưu hằng số dùng chung
├── features/         # Logic gộp theo Domain cụ thể:
│   ├── auth          # Tích hợp xác thực Access Token định tuyến đăng nhập
│   ├── devices       # Thêm mới thiết bị, giao diện quản lý Device
│   ├── home-screen   # Dashboard nhà thông minh trung tâm
│   ├── room          # Tùy biến vị trí trong phòng
│   ├── smart-screen  # Bảng control panel nhanh
│   ├── scan-qr       # Nhận diện module quét mã kết nối
│   └── settings-screen  # Cài đặt (ví dụ: thông báo)
├── stores/           # Zustand slices (HomeStore, ConfigStore...)
├── hooks/            # Reusable custom hooks phục vụ logic UI
├── lib/              # Modules API call, Config, Authentication core, i18n
├── translations/     # Resource cho đa ngôn ngữ (en.json, vi.json)
└── docs/             # Tài liệu UI guidelines nội bộ
```

## 4. Đặc điểm và Quy định Project (Rules & Fixes)
1. **Kiểm soát Package**: Bắt buộc sử dụng `yarn` (tránh xung đột sinh bộ đệm từ pnpm/npm).
2. **Thiết lập thư viện CLI**: Ứng dụng đã thêm thủ công `@expo/cli` (phiên bản 54.0.22) trong `devDependencies` nhằm bypass lỗi tiền biên dịch (prebuild) nội bộ.
3. **Patch Packages**: Do hệ thống thay đổi Gradle structure trên template Android từ Expo SDK mới (thay thế function cũ bằng `autolinkLibrariesWithApp`), nên plugin module như `react-native-vlc-media-player` đã được fix cứng bằng bộ đệm thông qua `patch-package`. **Quy định**: Phải cập nhật lại regex nếu nâng cấp thư viện này.
4. **Fix lỗi Cache hệ thống Metro**: Áp dụng command tổ hợp xóa bộ nhớ Haste Map, Watchman, `.cache` khi có biến động Native module gây đứng project.
