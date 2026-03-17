# 🚀 Hướng Dẫn Deploy – Euro Smart Server

Tài liệu này hướng dẫn deploy toàn bộ hệ thống **euro-smart-server** lên các nền tảng khác nhau.

## 📋 Tổng Quan Hệ Thống

| Service | Port | Mô tả |
|---------|------|--------|
| **core-api** | 3001 | REST API chính (HTTP) |
| **socket-gateway** | 3002 | WebSocket server (real-time) |
| **iot-gateway** | 3003 | MQTT bridge (IoT devices) |
| **worker-service** | 3004 | BullMQ job processor (background tasks) |

**Hạ tầng bên ngoài** (không deploy chung):
- PostgreSQL — Database
- Redis — Cache + BullMQ + Pub/Sub
- EMQX — MQTT Broker

---

## 🔧 Bước Chung (Tất Cả Nền Tảng)

### 1. Chuẩn bị source code

```bash
git clone https://github.com/lephuvu1994/euro-smart-server.git
cd euro-smart-server
cp .env.example .env
# ✏️ Chỉnh sửa .env với thông tin thật (DB, Redis, MQTT, JWT, Mail...)
```

### 2. Cài đặt & Build

```bash
# Cài Yarn 4
corepack enable && corepack prepare yarn@4.9.2 --activate

# Cài dependencies
yarn install --immutable

# Generate Prisma client
yarn generate

# Build tất cả services
yarn build

# Chạy database migration
yarn migrate:prod
```

---

## 🟢 Option 1: Deploy bằng PM2

> **Phù hợp**: VPS đơn lẻ, dễ quản lý, hỗ trợ zero-downtime reload.

### Cài đặt PM2

```bash
npm install -g pm2
```

### Khởi động

```bash
# Start tất cả services
pm2 start ecosystem.config.js --env production

# Auto-start khi reboot
pm2 save
pm2 startup
```

### Các lệnh thường dùng

```bash
pm2 status                       # Xem trạng thái
pm2 logs                         # Xem log tất cả
pm2 logs core-api                # Xem log 1 service
pm2 reload all                   # Reload zero-downtime
pm2 restart core-api             # Restart 1 service
pm2 monit                        # Dashboard real-time
pm2 stop all && pm2 delete all   # Dừng & xoá tất cả
```

### Cập nhật code

```bash
git pull origin main
yarn install --immutable
yarn generate && yarn build
yarn migrate:prod
pm2 reload ecosystem.config.js --env production
```

### Log rotation

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

📖 Chi tiết: [deploy/pm2/README.md](pm2/README.md)

---

## 🐳 Option 2: Deploy bằng Docker

> **Phù hợp**: Môi trường cần container isolation, CI/CD pipelines.

### Development (có cả infrastructure)

```bash
# Khởi chạy Postgres + Redis + EMQX + Server
docker compose up -d
```

### Production (chỉ 4 services, infrastructure bên ngoài)

```bash
# Build image
docker build -t euro-smart-server:latest .

# Chạy tất cả services
docker compose -f docker-compose.prod.yml --env-file .env up -d

# Xem logs
docker compose -f docker-compose.prod.yml logs -f

# Dừng
docker compose -f docker-compose.prod.yml down
```

### Chạy từng service riêng lẻ

```bash
# Chỉ chạy core-api
docker run -d --name core-api \
  --env-file .env \
  -e NODE_ENV=production \
  -p 3001:3001 \
  euro-smart-server:latest \
  node dist/apps/core-api/main.js

# Chỉ chạy socket-gateway
docker run -d --name socket-gateway \
  --env-file .env \
  -e NODE_ENV=production \
  -p 3002:3002 \
  euro-smart-server:latest \
  node dist/apps/socket-gateway/main.js
```

### Cập nhật

```bash
docker compose -f docker-compose.prod.yml down
docker build -t euro-smart-server:latest .
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

---

## ☸️ Option 3: Deploy bằng Kubernetes (K8s)

> **Phù hợp**: Hệ thống lớn, cần auto-scaling, high availability.

### Chuẩn bị

```bash
# Build & push Docker image lên registry
docker build -t your-registry/euro-smart-server:latest .
docker push your-registry/euro-smart-server:latest

# ✏️ Sửa image name trong các file deploy/k8s/*.yaml
```

### Deploy toàn bộ

```bash
# Tạo namespace
kubectl apply -f deploy/k8s/namespace.yaml

# Tạo secrets (⚠️ chỉnh sửa secret.yaml trước!)
kubectl apply -f deploy/k8s/secret.yaml

# Tạo config
kubectl apply -f deploy/k8s/configmap.yaml

# Deploy 4 services
kubectl apply -f deploy/k8s/core-api.yaml
kubectl apply -f deploy/k8s/socket-gateway.yaml
kubectl apply -f deploy/k8s/iot-gateway.yaml
kubectl apply -f deploy/k8s/worker-service.yaml

# Setup Ingress (⚠️ chỉnh sửa domain trước!)
kubectl apply -f deploy/k8s/ingress.yaml
```

Hoặc deploy một lệnh:
```bash
kubectl apply -f deploy/k8s/
```

### Kiểm tra

```bash
kubectl get pods -n euro-smart          # Xem pods
kubectl get svc -n euro-smart           # Xem services
kubectl get hpa -n euro-smart           # Xem auto-scaling
kubectl logs -f deploy/core-api -n euro-smart  # Xem logs
```

### Chạy migration

```bash
kubectl run db-migrate --rm -it \
  --image=your-registry/euro-smart-server:latest \
  --namespace=euro-smart \
  --env="DATABASE_URL=postgresql://user:pass@host:5432/db" \
  -- npx prisma migrate deploy
```

### Cập nhật

```bash
docker build -t your-registry/euro-smart-server:v2 .
docker push your-registry/euro-smart-server:v2

# Rolling update (zero-downtime)
kubectl set image deployment/core-api \
  core-api=your-registry/euro-smart-server:v2 -n euro-smart
kubectl set image deployment/socket-gateway \
  socket-gateway=your-registry/euro-smart-server:v2 -n euro-smart
kubectl set image deployment/iot-gateway \
  iot-gateway=your-registry/euro-smart-server:v2 -n euro-smart
kubectl set image deployment/worker-service \
  worker-service=your-registry/euro-smart-server:v2 -n euro-smart
```

### Tính năng K8s

- ✅ **HPA Auto-scaling**: `core-api` tự scale 2→10 pods theo CPU/Memory
- ✅ **Health probes**: Liveness + Readiness cho mỗi service
- ✅ **Rolling updates**: Deploy không downtime
- ✅ **Ingress**: Nginx routing cho API + WebSocket

📖 Chi tiết: [deploy/k8s/README.md](k8s/README.md)

---

## 🖥️ Option 4: Deploy trên VPS (systemd + Nginx)

> **Phù hợp**: VPS truyền thống, không cần Docker/K8s, quản lý bằng systemd.

### Setup tự động

```bash
chmod +x deploy/vps/setup.sh
sudo ./deploy/vps/setup.sh
```

Script sẽ tự động:
- Cài Node.js 22, Nginx
- Tạo user `node` cho app
- Copy systemd service files
- Cấu hình Nginx reverse proxy

### Setup thủ công

#### Bước 1: Cài đặt

```bash
# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx

# Yarn 4
sudo corepack enable && corepack prepare yarn@4.9.2 --activate
```

#### Bước 2: Clone & Build

```bash
sudo git clone <repo-url> /opt/euro-smart-server
cd /opt/euro-smart-server
sudo cp .env.example .env
sudo nano .env  # Chỉnh sửa
sudo yarn install --immutable
sudo yarn generate && sudo yarn build
sudo yarn migrate:prod
```

#### Bước 3: Cài systemd services

```bash
sudo cp deploy/vps/euro-*.service /etc/systemd/system/
sudo systemctl daemon-reload

# Bật & khởi động tất cả services
sudo systemctl enable --now euro-core-api
sudo systemctl enable --now euro-socket-gateway
sudo systemctl enable --now euro-iot-gateway
sudo systemctl enable --now euro-worker-service
```

#### Bước 4: Cấu hình Nginx

```bash
sudo cp deploy/vps/nginx.conf /etc/nginx/sites-available/euro-smart
sudo ln -s /etc/nginx/sites-available/euro-smart /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
# ✏️ Chỉnh server_name trong nginx config
sudo nginx -t && sudo systemctl reload nginx
```

#### Bước 5: SSL (Let's Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com -d ws.yourdomain.com
```

### Quản lý services

```bash
sudo systemctl status euro-core-api       # Xem trạng thái
sudo systemctl restart euro-core-api      # Restart
sudo systemctl stop euro-core-api         # Dừng
journalctl -u euro-core-api -f            # Xem live logs
journalctl -u euro-core-api --since "1h ago"  # Logs 1 giờ gần nhất
```

### Cập nhật

```bash
cd /opt/euro-smart-server
git pull origin main
yarn install --immutable
yarn generate && yarn build
yarn migrate:prod
sudo systemctl restart euro-core-api euro-socket-gateway euro-iot-gateway euro-worker-service
```

📖 Chi tiết: [deploy/vps/README.md](vps/README.md)

---

## 🌐 Option 5: Deploy trên Render

> **Phù hợp**: PaaS managed, không cần quản lý server, auto-deploy từ Git.

### Bước thực hiện

1. Push code lên GitHub
2. Vào [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**
3. Chọn repo → Render tự detect `render.yaml`
4. Tạo **Environment Group** tên `euro-smart-env` và điền các biến:

```
DATABASE_URL          = postgresql://user:pass@host:5432/db
REDIS_HOST            = your-redis-host
REDIS_PORT            = 6379
REDIS_PASSWORD        = your-redis-password
MQTT_BROKER_URL       = mqtt://your-emqx-host:1883
MQTT_USERNAME         = admin
MQTT_PASSWORD         = password
JWT_SECRET            = your-jwt-secret
JWT_REFRESH_SECRET    = your-jwt-refresh-secret
APP_PORT              = 10000
```

5. Deploy! Render sẽ auto-build và deploy 4 services.

📖 Config file: [render.yaml](../render.yaml)

---

## ⚙️ Cấu Hình Scale – Các Giá Trị Có Thể Điều Chỉnh

Khi hệ thống cần nâng cấp (nhiều user, nhiều device, traffic cao hơn), các giá trị sau có thể điều chỉnh.

### 1. PM2 (`ecosystem.config.js`)

| Giá trị | Mặc định | Mô tả | Khi nào tăng |
|---------|----------|-------|-------------|
| `instances` (core-api) | `'max'` | Số process chạy song song. `'max'` = số CPU cores. Đặt số cụ thể như `4` nếu muốn giới hạn | Khi API chịu nhiều request đồng thời, tăng thêm CPU cores cho server |
| `instances` (socket-gateway) | `1` | Chỉ chạy 1 instance vì WebSocket giữ state per-process | **Không nên tăng** trừ khi dùng Redis adapter cho Socket.IO |
| `instances` (iot-gateway) | `1` | Chỉ chạy 1 instance vì MQTT client là single connection | **Không nên tăng** — mỗi instance tạo 1 MQTT connection riêng |
| `instances` (worker-service) | `1` | Số worker xử lý BullMQ jobs | Khi queue bị backlog (jobs chờ xử lý quá nhiều), tăng lên 2-4 |
| `max_memory_restart` | `512M` / `384M` | Tự restart khi process dùng quá nhiều RAM | Tăng lên `1G` nếu xử lý payload lớn hoặc nhiều connections |
| `kill_timeout` | `5000` / `10000` | Thời gian chờ (ms) để process shutdown gracefully | Tăng nếu có long-running requests hoặc jobs cần hoàn thành |
| `listen_timeout` | `10000` | Thời gian chờ (ms) app sẵn sàng sau khi start | Tăng nếu app khởi động chậm (kết nối DB xa, migrations) |
| `exec_mode` | `cluster` / `fork` | `cluster` = multi-process load balancing; `fork` = single process | `core-api` dùng cluster; socket/iot/worker dùng fork |

**Ví dụ scale cho server 8 CPU, 16GB RAM:**

```js
// ecosystem.config.js
{
  name: 'core-api',
  instances: 6,               // Dùng 6/8 cores (để lại 2 cho OS + services khác)
  max_memory_restart: '1G',   // Tăng RAM limit
  kill_timeout: 10000,
},
{
  name: 'worker-service',
  instances: 2,               // 2 workers xử lý song song
  max_memory_restart: '512M',
}
```

---

### 2. Docker (`docker-compose.prod.yml`)

| Giá trị | Mặc định | Mô tả | Khi nào tăng |
|---------|----------|-------|-------------|
| `deploy.resources.limits.memory` | `512M` / `384M` | Giới hạn RAM tối đa container được dùng. Vượt quá → bị kill | Tăng khi service cần xử lý data lớn hoặc nhiều concurrent connections |
| `deploy.resources.limits.cpus` | `'1.0'` / `'0.5'` | Giới hạn CPU cores. `'1.0'` = 1 core, `'0.5'` = nửa core | Tăng cho `core-api` khi traffic cao |
| `deploy.resources.reservations.memory` | `256M` / `128M` | RAM tối thiểu được đảm bảo cho container | Tăng khi cần đảm bảo performance ổn định |
| `deploy.resources.reservations.cpus` | `'0.25'` | CPU tối thiểu được đảm bảo | Tăng cho services quan trọng |
| `deploy.replicas` (thêm mới) | `1` | Số container chạy song song (cần thêm load balancer) | Tăng `core-api` replicas khi cần horizontal scaling |
| `healthcheck.interval` | `30s` | Tần suất kiểm tra health | Giảm xuống `10s` nếu cần phát hiện lỗi nhanh hơn |
| `healthcheck.timeout` | `10s` | Thời gian chờ health check response | Tăng nếu service response chậm dưới load |
| `healthcheck.retries` | `3` | Số lần fail liên tiếp trước khi restart | Tăng lên `5` để tránh restart nhầm khi load spike |

**Ví dụ scale cho production:**

```yaml
# docker-compose.prod.yml
core-api:
  deploy:
    replicas: 3                    # 3 instances + load balancer
    resources:
      limits:
        memory: 1G                 # Tăng RAM
        cpus: '2.0'               # Tăng CPU
      reservations:
        memory: 512M
        cpus: '0.5'
```

---

### 3. Kubernetes (`deploy/k8s/*.yaml`)

#### Deployment

| Giá trị | File | Mặc định | Mô tả | Khi nào tăng |
|---------|------|----------|-------|-------------|
| `spec.replicas` | core-api | `2` | Số pods chạy đồng thời. Load được chia đều qua Service | Tăng lên `3-5` khi traffic tăng |
| `spec.replicas` | socket-gw | `1` | WebSocket cần sticky sessions | Cần cấu hình thêm sticky session trước khi scale |
| `spec.replicas` | worker-svc | `1` | Số worker pods | Tăng lên `2-3` khi BullMQ queue bị backlog |
| `resources.requests.memory` | tất cả | `128Mi-256Mi` | RAM tối thiểu scheduler cần đảm bảo khi đặt pod lên node | Tăng nếu pods bị OOMKilled thường xuyên |
| `resources.limits.memory` | tất cả | `384Mi-512Mi` | RAM tối đa pod được dùng. Vượt → OOMKilled | Tăng khi xử lý payload lớn |
| `resources.requests.cpu` | tất cả | `100m-250m` | CPU tối thiểu (1000m = 1 core) | Tăng cho services xử lý nặng |
| `resources.limits.cpu` | tất cả | `500m-1000m` | CPU tối đa pod được dùng | Tăng khi cần burst performance |
| `terminationGracePeriodSeconds` | tất cả | `30` / `60` | Thời gian (giây) K8s chờ pod shutdown trước khi force kill | Tăng nếu có long-running requests/jobs |
| `strategy.rollingUpdate.maxSurge` | tất cả | `1` | Số pods dư ra khi rolling update | Tăng để update nhanh hơn |
| `strategy.rollingUpdate.maxUnavailable` | tất cả | `0` | Số pods được phép unavailable khi update. `0` = zero downtime | Giữ `0` cho production |

#### HPA (Horizontal Pod Autoscaler) — `core-api.yaml`

| Giá trị | Mặc định | Mô tả | Khi nào điều chỉnh |
|---------|----------|-------|-------------------|
| `minReplicas` | `2` | Số pods tối thiểu luôn chạy | Tăng lên `3` nếu cần high availability (chịu được 1 node down) |
| `maxReplicas` | `10` | Số pods tối đa khi auto-scale | Tăng lên `20-50` cho traffic lớn (đảm bảo cluster đủ resources) |
| `cpu.averageUtilization` | `70` | Ngưỡng CPU trung bình (%). Vượt qua → thêm pods | Giảm xuống `50` nếu muốn scale sớm hơn (reactive), tăng `80` nếu muốn tiết kiệm |
| `memory.averageUtilization` | `80` | Ngưỡng Memory trung bình (%). Vượt qua → thêm pods | Giảm nếu app bị OOM khi memory spike |

#### Probes (Health checks)

| Giá trị | Mặc định | Mô tả | Khi nào điều chỉnh |
|---------|----------|-------|-------------------|
| `livenessProbe.initialDelaySeconds` | `15-30` | Thời gian chờ trước khi bắt đầu kiểm tra liveness | Tăng nếu app mất thời gian khởi động (migrations, warmup) |
| `livenessProbe.periodSeconds` | `30` | Tần suất kiểm tra (giây) | Giảm xuống `10` nếu cần phát hiện crash nhanh |
| `livenessProbe.failureThreshold` | `3` | Số lần fail trước khi restart pod | Tăng lên `5` để tránh restart nhầm |
| `readinessProbe.initialDelaySeconds` | `10` | Thời gian chờ trước khi nhận traffic | Tăng nếu app cần warmup cache |
| `readinessProbe.periodSeconds` | `10` | Tần suất kiểm tra readiness | Giữ nhỏ (`5-10`) để traffic routing nhanh |

**Ví dụ scale cho 100K+ devices:**

```yaml
# core-api.yaml
spec:
  replicas: 5
  template:
    spec:
      containers:
        - resources:
            requests:
              memory: '512Mi'
              cpu: '500m'
            limits:
              memory: '1Gi'
              cpu: '2000m'
---
# HPA
spec:
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60    # Scale sớm hơn
```

---

### 4. VPS systemd (`deploy/vps/*.service`)

| Giá trị | Mặc định | Mô tả | Khi nào điều chỉnh |
|---------|----------|-------|-------------------|
| `MemoryMax` | `512M` / `384M` | Giới hạn RAM tối đa cho process. Vượt quá → bị kill bởi systemd | Tăng lên `1G` - `2G` khi cần xử lý nhiều connections |
| `CPUQuota` | `100%` / `50%` | Giới hạn CPU. `100%` = 1 core, `200%` = 2 cores | Tăng cho `core-api` khi chịu nhiều request |
| `RestartSec` | `5` | Thời gian chờ (giây) trước khi restart sau crash | Tăng lên `10-30` nếu muốn tránh restart loop khi DB chưa sẵn sàng |
| `TimeoutStopSec` | `30` / `60` | Thời gian chờ (giây) cho graceful shutdown | Tăng nếu có long-running requests/jobs |
| `LimitNOFILE` (thêm mới) | `65536` | Số file descriptors tối đa (mỗi connection = 1 fd) | Thêm khi có >10K concurrent connections |

**Ví dụ thêm config cho high-traffic:**

```ini
# euro-core-api.service - thêm vào [Service]
MemoryMax=2G
CPUQuota=200%
LimitNOFILE=65536
LimitNPROC=4096
```

---

### 5. Nginx (`deploy/vps/nginx.conf`)

| Giá trị | Mặc định | Mô tả | Khi nào điều chỉnh |
|---------|----------|-------|-------------------|
| `limit_req_zone rate` | `30r/s` | Rate limit: số request/giây mỗi IP | Tăng lên `100r/s` - `500r/s` cho API có nhiều client |
| `limit_req burst` | `50` | Cho phép burst thêm N request vượt rate limit | Tăng lên `100-200` cho API có traffic spike |
| `keepalive` (upstream) | `32` | Số connections giữ sẵn đến backend | Tăng lên `64-128` khi traffic cao |
| `client_max_body_size` | `10m` | Kích thước tối đa request body | Tăng lên `50m` nếu cho phép upload file lớn |
| `proxy_read_timeout` | `60s` | Thời gian chờ response từ backend | Tăng cho API xử lý lâu (report, export) |
| `proxy_read_timeout` (WS) | `86400s` | Timeout cho WebSocket connections (24h) | Giữ nguyên hoặc tăng cho long-lived connections |
| `worker_processes` (thêm) | `auto` | Số Nginx worker processes | Thêm vào đầu nginx.conf: `worker_processes auto;` |
| `worker_connections` (thêm) | `1024` | Số connections mỗi worker | Thêm: `events { worker_connections 4096; }` cho >10K connections |

**Ví dụ Nginx config cho high-traffic:**

```nginx
# Thêm vào đầu nginx.conf
worker_processes auto;
events {
    worker_connections 4096;
    multi_accept on;
}

# Tăng rate limit
limit_req_zone $binary_remote_addr zone=api_limit:20m rate=100r/s;

# Tăng upstream keepalive
upstream core_api {
    server 127.0.0.1:3001;
    keepalive 128;
}
```

---

### 📋 Bảng Tham Chiếu Nhanh Theo Quy Mô

| Quy mô | Devices | Users | core-api instances | Memory/instance | Worker instances |
|---------|---------|-------|--------------------|-----------------|-----------------|
| **Nhỏ** | <1K | <100 | 1-2 | 256M-512M | 1 |
| **Vừa** | 1K-10K | 100-1K | 2-4 | 512M-1G | 1-2 |
| **Lớn** | 10K-100K | 1K-10K | 4-8 | 1G-2G | 2-4 |
| **Rất lớn** | 100K+ | 10K+ | 8-20 (K8s HPA) | 2G-4G | 4-8 |

> **Lưu ý**: Khi scale ngang (nhiều instances), cần đảm bảo:
> - Redis dùng làm session store nếu `core-api` cluster mode
> - Socket.IO dùng Redis Adapter khi scale `socket-gateway`
> - BullMQ tự phân phối jobs — chỉ cần tăng `worker-service` instances

---

## 📊 So Sánh Các Phương Pháp Deploy

| Tiêu chí | PM2 | Docker | K8s | VPS (systemd) | Render |
|-----------|-----|--------|-----|----------------|--------|
| **Độ phức tạp** | ⭐ Thấp | ⭐⭐ TB | ⭐⭐⭐ Cao | ⭐ Thấp | ⭐ Thấp |
| **Auto-scaling** | ❌ | ❌ | ✅ | ❌ | ✅ (trả phí) |
| **Zero-downtime** | ✅ | ✅ | ✅ | ⚠️ Thủ công | ✅ |
| **Monitoring** | ✅ PM2 | ⚠️ Cần thêm | ✅ Built-in | ⚠️ journalctl | ✅ Built-in |
| **Chi phí** | 💰 VPS | 💰 VPS | 💰💰 Cluster | 💰 VPS | 💰💰 PaaS |
| **Phù hợp** | Dev nhỏ | MVP/Startup | Enterprise | Server cá nhân | Quick deploy |

---

## 🔐 Lưu Ý Bảo Mật

1. **Không commit `.env`** — luôn dùng `.env.example` làm template
2. **Đổi JWT secrets** — tạo mới bằng `openssl rand -base64 32`
3. **Hạn chế CORS** — thay `*` bằng domain thật trong production
4. **SSL/TLS** — luôn dùng HTTPS cho production
5. **Firewall** — chỉ mở ports cần thiết (80, 443)
