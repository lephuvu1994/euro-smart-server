# 🚀 Cẩm Nang Vận Hành Server Cơ Bản Đến Chuyên Sâu (SA Deployment Guide)

Tài liệu này được soạn thảo theo tiêu chuẩn System Administrator (SA) dành cho Aurathink/Euro Smart Server. Bất kỳ ai không có kiến thức sâu về Docker hoặc System đều có thể đọc, copy-paste và chạy thành công 100%.

> [!WARNING]
> Nếu bạn mới chuyển sang một máy chủ hoàn toàn mới (Clean Server), hãy dùng **Cách 1: Tự động hoá 1-Click**. Nó sẽ gỡ bỏ toàn bộ lỗi lo về cấu hình, SSL và Database.

---

## Cách 1: TỰ ĐỘNG HOÁ 1-CLICK (Khuyên Dùng Nhất)

### 1. Yêu cầu phần cứng
- VPS hệ điều hành **Ubuntu 20.04 LTS** hoặc **Ubuntu 22.04 LTS**.
- Mở tất cả các Port sau trên tường lửa (Firewall) của nhà cung cấp VPS: `80` (HTTP), `443` (HTTPS), `1883` (Mqtt TCP), `8883` (Mqtt TLS). Cổng `18083` (EMQX Dashboard) chỉ nên cho phép IP nhà bạn truy cập vào.

### 2. Trỏ Tên Miền (Domain)
Vào nhà cung cấp Tên miền (Cloudflare, Tenten, Mắt Bão), trỏ 1 Record `A` từ Domain dự định dùng (vd: `aurathink.ddns.net`) về **IP của VPS**. Đảm bảo (Ping) thấy Domain trả về đúng IP trước khi làm bước tiếp theo.

### 3. Thực Hiện Lệnh
Chạy 3 dòng lệnh sau trên VPS:

```bash
# 1. Klon Source Code
git clone https://github.com/your-org/euro-smart-server.git
cd euro-smart-server

# 2. Cấp quyền chạy cho Tool cài đặt
chmod +x setup-server.sh

# 3. Kích hoạt Auto Bootstrap (Phải có sudo/root)
sudo ./setup-server.sh
```

Tool sẽ tự động: Cài Docker, làm chứng chỉ SSL, gen Password ngầm, khởi tạo DB Prisma và bật lên toàn bộ. Bạn chỉ cần nhập đúng Domain và Email khi được hỏi. Chấm hết!

---

## Cách 2: Setup Thủ Công Dành Cho Dân Dev (Học & Hiểu Hệ Thống)

Nếu bạn không muốn chạy tool auto mà tự mình "tái tạo" lại quá trình trên Server, đây là giải phẫu cấu trúc thực sự:

### Bước 1: Clone và Môi trường
Bắt buộc bạn phải có file `.env`. Trong Source code chỉ có `.env.example`.
```bash
cp .env.example .env
nano .env  # Tự điền các mật khẩu, đặc biệt chú ý DATABASE_URL và Secret JWT.
```

### Bước 2: Bài Toán SSL (Cực kỳ quan trọng)
File `docker-compose.prod.yml` chạy Nginx qua cấu hình `nginx.conf`, nhưng ngặt nghèo là `nginx.conf` đòi phải có file SSL (Chứng chỉ bảo mật HTTPS) ngay lúc bật máy. Nếu bạn mới tậu VPS, lấy đâu ra SSL? Container Nginx sẽ "Rơi vào vòng lặp tử thần" (Crash-loop)!
Cách giải bằng tay:
```bash
# 1. Cài Certbot
sudo apt install certbot -y

# 2. Lấy chứng nhận bằng mode Standalone (Nginx máy host phải đang tắt 100%)
sudo certbot certonly --standalone -d your-domain.com

# 3. Kéo chứng chỉ về nơi lưu trữ của DOCKER
mkdir -p ./deploy/docker/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./deploy/docker/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem ./deploy/docker/ssl/

# 4. Gom chứng chỉ cho HAProxy/MQTT (vì Mqtt bắt buộc phải gộp 2 file lại thành 1 cục)
cat ./deploy/docker/ssl/fullchain.pem ./deploy/docker/ssl/privkey.pem > ./deploy/docker/ssl/mqtt.pem
chmod 644 ./deploy/docker/ssl/mqtt.pem
```

### Bước 3: Tạo Khung xương Cơ Sở Dữ Liệu
Chớ vội Up toàn bộ lên liền vì DB chưa có cọc.
```bash
# Dựng lõi Postgres & Redis nền
docker compose -f docker-compose.prod.yml up -d postgres redis
sleep 15  # Đợi DB khởi động cái đã

# Chạy lõi rớt dữ liệu (Migration & TimescaleDB setup)
docker compose -f docker-compose.prod.yml up migrate
```

### Bước 4: Launching System (Thả hệ thống)
Khi Database đã yên vị, dội toàn bộ App, Nginx, EMQX vào:
```bash
docker compose -f docker-compose.prod.yml up -d
```

### Bước 5: Bơm User "Sếp" vào EMQX (Webhook Fix)
Hệ thống Gateway IoT cần một **Tài khoản Root** siêu cấp (Global User) để thu lượm dữ liệu tất cả thiết bị trên đời. Kể từ bản EMQX V5, bạn không thể nhét thông tin này bằng file Text dể cài đặt mà phải châm bằng API.
Phải chạy File cài:
```bash
export EMQX_API_URL="http://127.0.0.1:18083" # Host IP EMQX Dashboard
export EMQX_DASHBOARD_PASS="mypassword_trong_.env"
export MQTT_USER="admin_mqtt_username"
export MQTT_PASS="passquamon"

# File bash này sẽ chọc vô DB của con EMQX đang chạy, và cấy 1 acc Super User
sh ./deploy/docker/init-emqx-auth.sh
```

Đến đây, bạn gõ `docker ps`, tất cả Container ping `Up`, `iot-gateway` không lỗi vàng đỏ. Server hoàn hảo.

---

## 🛠️ Bảo Trì, Nâng Cấp Sau Này

### Kéo Code Mới (Deploy Cập Nhật)
> [!TIP]
> Bạn đã cấu hình Docker Load Balancing động (`127.0.0.11` dns buster), nên khi kéo code mới, Mạng hầm đằng sau lưng sẽ tự khôi phục không bao giờ lỗi DNS Cache như lúc đầu.

Cách Deploy chuẩn nhất:
```bash
git fetch && git reset --hard origin/main
docker compose -f docker-compose.prod.yml build
# `--no-deps` Giữ cho DB/EMQX/Nginx không bị khởi động lại, chỉ dập chớp chớp Core, Mqtt worker để update tính năng
docker compose -f docker-compose.prod.yml up -d --no-deps core-api iot-gateway worker-service
```

### Tracing Lỗi
Nếu có một Container chết hoặc nghi vấn app chạy lỗi. Hãy soi Log tức thì bằng:
```bash
# Soi Error của Core Server:
docker logs --tail 200 -f aurathink-core-api-prod

# Xem Webhook IoT chập chờn:
docker logs --tail 100 -f aurathink-iot-gateway-prod

# Khởi động ép (Kẹt ram hụt bộ nhớ):
docker restart aurathink-core-api-prod
```

---

## 🚨 Hệ thống Giám sát & Cảnh báo (System Monitoring)

Hệ thống này chạy **độc lập hoàn toàn với Docker** — ngay cả khi toàn bộ Container sập, nó vẫn gửi cảnh báo tới Telegram + Email.

### Cài đặt tự động (Nếu đã chạy `setup-server.sh`)
Nếu bạn đã dùng **Cách 1: 1-Click Deploy**, hệ thống monitoring đã được cài tự động. Bạn chỉ cần cấu hình thêm Telegram Bot Token và Email trong file `.env`.

### Cài đặt thủ công (Manual)

#### Bước 1: Tạo Telegram Bot (Nhận cảnh báo tức thì)

1. Mở Telegram, tìm **@BotFather** và gõ `/newbot`.
2. Đặt tên Bot (VD: `AurathinkAlert`) → BotFather sẽ trả về **Token**.
3. Copy Token đó vào `.env`:
   ```
   TELEGRAM_BOT_TOKEN="7012345678:AAHxxxxxxxxxxxxxxxxx"
   ```
4. Lấy Chat ID: Tìm **@userinfobot** trên Telegram, gõ `/start` → nó sẽ trả về Chat ID của bạn.
5. Muốn nhiều người nhận: Mỗi Admin làm bước 4, sau đó gom tất cả Chat ID vào `.env` (ngăn bằng dấu phẩy):
   ```
   TELEGRAM_CHAT_IDS="123456789,987654321,555666777"
   ```

#### Bước 2: Cấu hình Gmail App Password (Nhận cảnh báo qua Email)

1. Vào **Google Account** → **Security** → Bật **Xác minh 2 bước (2-Step Verification)**.
2. Sau khi bật 2FA, quay lại **Security** → **App Passwords** → Chọn "Mail" + "Linux" → Nhấn **Generate**.
3. Copy mật khẩu 16 ký tự (không có khoảng trắng) vào `.env`:
   ```
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=587
   MAIL_USER=your-email@gmail.com
   MAIL_PASSWORD=abcdefghijklmnop
   ```
4. Danh sách email nhận cảnh báo (ngăn bằng dấu phẩy):
   ```
   ALERT_EMAILS="cto@company.com,devops@company.com,admin@company.com"
   ```

#### Bước 3: Kích hoạt Crontab

```bash
# Tạo thư mục state (giữ trạng thái qua reboot)
sudo mkdir -p /var/lib/aurathink-monitor

# Cấp quyền chạy
chmod +x deploy/monitoring/server-health.sh

# Gắn vào Crontab (chạy mỗi 3 phút)
(crontab -l 2>/dev/null; echo "*/3 * * * * /bin/bash $(pwd)/deploy/monitoring/server-health.sh >> /var/log/aurathink-monitor-cron.log 2>&1") | crontab -

# Cài logrotate (tự xoá log cũ sau 7 ngày)
sudo cp deploy/monitoring/logrotate-monitor.conf /etc/logrotate.d/aurathink-monitor
```

### Kiểm tra hoạt động

```bash
# Xem log giám sát real-time:
tail -f /var/log/aurathink-monitor.log

# Test thủ công (chạy 1 lần ngay):
bash deploy/monitoring/server-health.sh

# Xem crontab đã gắn chưa:
crontab -l | grep server-health
```

