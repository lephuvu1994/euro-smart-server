# 🚀 Hướng Dẫn Deploy – Aurathink Server (Docker Compose)

Hệ thống **aurathink-server** là một IoT smarthome backend dạng microservices, được deploy hoàn toàn bằng **Docker Compose**.

> **Lộ trình**: Docker Compose → Kubernetes (khi cần scale lớn hơn)

---

## 📋 Tổng Quan Hệ Thống

```
Internet
   │
   ▼
[Nginx :80/:443]  ← Reverse proxy, SSL termination, rate limiting
   │
   ├─► /api/        → [core-api :3001]        REST API chính
   ├─► /socket.io/  → [socket-gateway :3002]  WebSocket real-time
   └─► /iot/        → [iot-gateway :3003]     HTTP endpoint IoT
                                ↓
                       [worker-service :3004]  BullMQ jobs (no HTTP)

Infrastructure (chạy trong cùng compose):
   ├── PostgreSQL :5432    Database
   ├── Redis :6379         Cache + BullMQ + Pub/Sub (không expose ra ngoài)
   └── EMQX :1883/:8883   MQTT Broker (IoT devices kết nối trực tiếp)
```

| Service | Port (internal) | Expose ra ngoài |
|---------|----------------|-----------------|
| **core-api** | 3001 | Qua Nginx `/api/` |
| **socket-gateway** | 3002 | Qua Nginx `/socket.io/` |
| **iot-gateway** | 3003 | Qua Nginx `/iot/` |
| **worker-service** | 3004 | Không |
| **PostgreSQL** | 5432 | ❌ Không |
| **Redis** | 6379 | ❌ Không |
| **EMQX MQTT** | 1883, 8883 | ✅ IoT devices |
| **EMQX Dashboard** | 18083 | ✅ (giới hạn firewall) |
| **Nginx HTTP** | 80 | ✅ (redirect HTTPS) |
| **Nginx HTTPS** | 443 | ✅ |

---

## 📁 Cấu Trúc Files

```
aurathink-server/
├── Dockerfile                    # Multi-stage build image
├── docker-compose.yml            # Dev: full infra + services
├── docker-compose.prod.yml       # Production: full stack
├── .env.example                  # Template biến môi trường
├── deploy/
│   └── docker/
│       ├── nginx.conf            # Nginx reverse proxy config
│       └── ssl/                  # SSL certs (tạo tay hoặc Certbot)
│           ├── fullchain.pem
│           └── privkey.pem
```

---

## 🟢 Development (Local)

### Yêu cầu
- Docker Desktop 4.x+ (hoặc Docker Engine 24+ + Compose v2)
- 4GB RAM trống

### Khởi chạy

```bash
# 1. Clone & chuẩn bị env
git clone https://github.com/lephuvu1994/aurathink-server.git
cd aurathink-server
cp .env.example .env
# ✏️ Chỉnh sửa .env (xem phần Cấu Hình Env bên dưới)

# 2. Build image
docker compose build

# 3. Chạy database migration (lần đầu)
docker compose run --rm migrate

# 4. Start tất cả services
docker compose up -d

# 5. Xem logs
docker compose logs -f
docker compose logs -f core-api   # logs 1 service
```

### Kiểm tra trạng thái

```bash
docker compose ps            # Xem trạng thái tất cả containers
docker compose top           # Xem processes
```

### URLs khi dev

| Endpoint | URL |
|----------|-----|
| REST API | http://localhost:3001/api/v1 |
| Health check | http://localhost:3001/health |
| WebSocket | ws://localhost:3002 |
| IoT Gateway | http://localhost:3003 |
| EMQX Dashboard | http://localhost:18083 |

### Dừng & dọn dẹp

```bash
docker compose down              # Dừng, giữ volumes
docker compose down -v           # Dừng + xoá tất cả data
docker compose down --rmi local  # Dừng + xoá image local
```

---

## 🐳 Production

### Yêu cầu

- VPS/Server tối thiểu: **2 vCPU, 4GB RAM**
- Đề xuất: **4 vCPU, 8GB RAM** cho hệ thống 1K-10K devices
- Docker Engine 24+ và Compose v2
- Domain + DNS đã trỏ về IP server
- Mở ports trên firewall: **80, 443, 1883, 8883, 18083**

### Bước 1: Cài Docker trên VPS

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Đăng xuất & đăng nhập lại để áp dụng group

# Kiểm tra
docker --version
docker compose version
```

### Bước 2: Clone code & cấu hình

```bash
git clone https://github.com/lephuvu1994/aurathink-server.git
cd aurathink-server
cp .env.example .env
nano .env   # Điền tất cả giá trị thật (xem phần Biến Môi Trường bên dưới)
```

### Bước 3: SSL Certificate

**Cách A — Self-signed (test nhanh, không dùng cho production thật):**

```bash
mkdir -p deploy/docker/ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout deploy/docker/ssl/privkey.pem \
  -out deploy/docker/ssl/fullchain.pem \
  -subj "/CN=your-domain.com"
```

**Cách B — Let's Encrypt (recommended, miễn phí):**

```bash
# Cài certbot
sudo apt install -y certbot

# Tạm thời dừng Nginx nếu đang chạy trên port 80
# Lấy cert (standalone mode)
sudo certbot certonly --standalone \
  -d your-domain.com \
  -d api.your-domain.com \
  --email admin@your-domain.com \
  --agree-tos

# Copy certs vào thư mục deploy
mkdir -p deploy/docker/ssl
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem deploy/docker/ssl/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem deploy/docker/ssl/
sudo chown $USER:$USER deploy/docker/ssl/*.pem
```

**Auto-renew Let's Encrypt:**

```bash
# Thêm vào crontab
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && \
  cp /etc/letsencrypt/live/your-domain.com/fullchain.pem /path/to/aurathink-server/deploy/docker/ssl/ && \
  cp /etc/letsencrypt/live/your-domain.com/privkey.pem /path/to/aurathink-server/deploy/docker/ssl/ && \
  docker compose -f /path/to/aurathink-server/docker-compose.prod.yml exec nginx nginx -s reload") | crontab -
```

### Bước 4: Cấu hình Nginx domain

```bash
# ✏️ Mở file và thay "your-domain.com" bằng domain thật
nano deploy/docker/nginx.conf
# Tìm dòng: server_name your-domain.com;
# Sửa thành: server_name api.yourdomain.com;
```

### Bước 5: Build & Deploy

```bash
# Build image
docker compose -f docker-compose.prod.yml build

# Chạy database migration
docker compose -f docker-compose.prod.yml run --rm migrate

# Start toàn bộ stack
docker compose -f docker-compose.prod.yml up -d

# Theo dõi logs khởi động
docker compose -f docker-compose.prod.yml logs -f --tail=50
```

### Bước 6: Kiểm tra

```bash
# Kiểm tra tất cả containers running
docker compose -f docker-compose.prod.yml ps

# Test API
curl https://your-domain.com/health
curl https://your-domain.com/api/v1

# Test MQTT (cần cài mosquitto-clients)
mosquitto_pub -h your-domain.com -p 1883 \
  -u smarthome-server -P your-mqtt-password \
  -t "test/ping" -m "hello"
```

---

## 🔄 Cập Nhật Code

```bash
cd /path/to/aurathink-server
git pull origin main

# Build image mới
docker compose -f docker-compose.prod.yml build

# Chạy migration nếu có thay đổi schema
docker compose -f docker-compose.prod.yml run --rm migrate

# Rolling restart (zero-downtime từng service)
docker compose -f docker-compose.prod.yml up -d --no-deps core-api
docker compose -f docker-compose.prod.yml up -d --no-deps socket-gateway
docker compose -f docker-compose.prod.yml up -d --no-deps iot-gateway
docker compose -f docker-compose.prod.yml up -d --no-deps worker-service

# Hoặc restart tất cả cùng lúc (có ~5s downtime)
docker compose -f docker-compose.prod.yml up -d
```

---

## ⚙️ Biến Môi Trường – Giải Thích

> **Quan trọng**: Trong Docker Compose, các service liên lạc nhau qua **tên service** (không dùng `localhost`).
> - Database: `postgres` (không phải `localhost`)
> - Redis: `redis`
> - MQTT: `mqtt://emqx`

### Bắt buộc thay đổi trước khi chạy production

| Biến | Ví dụ | Mô tả |
|------|-------|-------|
| `POSTGRES_PASSWORD` | `Str0ngP@ss!` | Mật khẩu PostgreSQL |
| `REDIS_PASSWORD` | `R3d!sP@ss` | Mật khẩu Redis |
| `EMQX_DASHBOARD_PASS` | `Em@xP@ss!` | Mật khẩu EMQX Dashboard |
| `MQTT_PASS` | `Mqtt@P@ss!` | Mật khẩu MQTT client |
| `AUTH_ACCESS_TOKEN_SECRET` | `$(openssl rand -base64 32)` | JWT access secret |
| `AUTH_REFRESH_TOKEN_SECRET` | `$(openssl rand -base64 32)` | JWT refresh secret |
| `APP_CORS_ORIGINS` | `https://yourdomain.com` | Domain frontend |
| `ADMIN_EMAIL` | `admin@yourdomain.com` | Email admin |
| `ADMIN_PASSWORD` | `Admin@Secure123!` | Password admin |

### Tạo secrets ngẫu nhiên

```bash
# JWT secrets
echo "AUTH_ACCESS_TOKEN_SECRET=$(openssl rand -base64 32)"
echo "AUTH_REFRESH_TOKEN_SECRET=$(openssl rand -base64 32)"

# Database password
openssl rand -base64 24
```

---

## 📊 Cấu Hình Scale

### Mặc định (2 vCPU, 4GB)

Phù hợp: **< 1,000 devices, < 100 users đồng thời**

| Service | Memory limit | CPU limit |
|---------|-------------|-----------|
| core-api | 512M | 1.0 core |
| socket-gateway | 384M | 0.5 core |
| iot-gateway | 384M | 0.5 core |
| worker-service | 384M | 0.5 core |
| PostgreSQL | 1G | 1.0 core |
| Redis | 384M | 0.5 core |
| EMQX | 512M | 1.0 core |

### Scale up (chỉnh trong `docker-compose.prod.yml`)

```yaml
# Ví dụ: server 8 vCPU, 16GB RAM — 10K devices
core-api:
  deploy:
    resources:
      limits:
        memory: 1G
        cpus: '2.0'
      reservations:
        memory: 512M
        cpus: '0.5'
```

```yaml
# Chạy nhiều worker để xử lý BullMQ jobs song song
worker-service:
  deploy:
    replicas: 2   # ← Thêm dòng này
    resources:
      limits:
        memory: 512M
        cpus: '1.0'
```

### Lộ trình lên Kubernetes

Khi cần scale vượt khả năng 1 server (> 10K devices đồng thời):

1. Đẩy image lên registry: `docker build -t registry.io/aurathink-server:v1 . && docker push ...`
2. Tạo K8s Deployment từ `deploy/k8s/` (xem thêm nếu cần)
3. Điểm khác biệt cần cấu hình thêm:
   - `core-api`: thêm Redis session store
   - `socket-gateway`: thêm Socket.IO Redis Adapter
   - Database: dùng managed DB (Cloud SQL, RDS) thay vì container

---

## 🔧 Quản Lý & Monitoring

### Xem logs

```bash
# Tất cả services
docker compose -f docker-compose.prod.yml logs -f

# Một service cụ thể
docker compose -f docker-compose.prod.yml logs -f core-api

# 100 dòng cuối
docker compose -f docker-compose.prod.yml logs --tail=100 core-api
```

### Truy cập shell container

```bash
# Vào container core-api
docker exec -it euro-core-api-prod sh

# Chạy Prisma Studio (xem DB qua UI)
docker exec -it euro-core-api-prod npx prisma studio
```

### Xem resource usage

```bash
docker stats                        # Real-time CPU/RAM/Network
docker compose -f docker-compose.prod.yml top   # Processes
```

### Restart service

```bash
# Restart một service (giữ container name, không rebuild)
docker compose -f docker-compose.prod.yml restart core-api

# Dùng khi thay đổi config (rebuild container)
docker compose -f docker-compose.prod.yml up -d --force-recreate core-api
```

### Backup & Restore Database

```bash
# Backup
docker exec euro-postgres-prod pg_dump \
  -U $POSTGRES_USER $POSTGRES_DB \
  > backup-$(date +%Y%m%d-%H%M%S).sql

# Restore
cat backup.sql | docker exec -i euro-postgres-prod psql \
  -U $POSTGRES_USER $POSTGRES_DB
```

---

## 🔐 Bảo Mật Production Checklist

- [ ] ❌ Không commit `.env` vào Git (đã có trong `.gitignore`)
- [ ] 🔑 Thay toàn bộ passwords/secrets trong `.env`
- [ ] 🌐 Thay `APP_CORS_ORIGINS=*` bằng domain thật
- [ ] 🔒 Cấu hình Firewall: chỉ mở `80, 443, 1883, 8883`
- [ ] 🔒 Port `18083` (EMQX Dashboard) — chỉ mở cho IP admin
- [ ] 🔒 Port `5432, 6379` — KHÔNG mở ra ngoài (chỉ internal)
- [ ] 🔒 SSL/HTTPS — dùng Let's Encrypt (miễn phí)
- [ ] 📝 EMQX — thêm user MQTT riêng, bật authentication
- [ ] 📝 PostgreSQL — tạo user riêng (không dùng `postgres` superuser)
- [ ] 🔄 Đặt lịch auto-renew SSL cert

### Thiết lập Firewall (Ubuntu/ufw)

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (redirect HTTPS)
sudo ufw allow 443/tcp    # HTTPS
sudo ufw allow 1883/tcp   # MQTT plain (IoT devices)
sudo ufw allow 8883/tcp   # MQTT TLS (IoT devices bảo mật)
# sudo ufw allow 18083/tcp  # EMQX Dashboard (chỉ mở nếu cần)
sudo ufw enable
sudo ufw status
```

### Tạo MQTT User cho IoT Devices (EMQX)

```bash
# Truy cập EMQX Dashboard: http://your-server:18083
# Menu: Authentication → Password-Based → Users → Add

# Hoặc dùng EMQX CLI:
docker exec euro-emqx-prod emqx_ctl users add \
  --username smarthome-device \
  --password DeviceP@ss123
```

---

## 🆘 Troubleshooting

### Container không start

```bash
# Xem log lỗi
docker compose -f docker-compose.prod.yml logs core-api

# Kiểm tra health containers
docker compose -f docker-compose.prod.yml ps

# Xem events
docker events --since 5m
```

### Lỗi kết nối Database

```bash
# Test connection từ core-api đến postgres
docker exec euro-core-api-prod sh -c \
  'wget -qO- http://localhost:3001/health'

# Test postgres trực tiếp
docker exec euro-postgres-prod psql \
  -U $POSTGRES_USER -d $POSTGRES_DB -c "SELECT 1"
```

### Lỗi MQTT connection

```bash
# Xem EMQX logs
docker compose -f docker-compose.prod.yml logs emqx

# Test MQTT từ trong container
docker exec euro-iot-gateway-prod sh -c \
  'nc -zv emqx 1883 && echo "MQTT OK"'
```

### Out of Memory

```bash
# Xem memory usage
docker stats --no-stream

# Tăng limit trong docker-compose.prod.yml
# limits: memory: 1G  ← tăng giá trị này
```

---

## 📚 Tham Khảo

| File | Mô tả |
|------|-------|
| [`docker-compose.yml`](../docker-compose.yml) | Dev compose config |
| [`docker-compose.prod.yml`](../docker-compose.prod.yml) | Production compose config |
| [`deploy/docker/nginx.conf`](docker/nginx.conf) | Nginx reverse proxy |
| [`Dockerfile`](../Dockerfile) | Multi-stage Docker build |
| [`.env.example`](../.env.example) | Template biến môi trường |
