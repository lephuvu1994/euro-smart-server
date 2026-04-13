# 🚀 Hướng Dẫn Deploy – Aurathink Server

Hệ thống deploy HA trên **2 VPS** qua **Docker Compose + Tailscale VPN + CI/CD GitHub Actions**.

---

## 📋 Kiến Trúc Deployment

```
                     Internet
            HTTPS (443) │  MQTTS (8883)
              ┌─────────▼──────────────┐
              │  VPS2 "Mặt tiền"      │
              │  sensasmart.ddns.net    │
              │                        │
              │  Nginx (TLS termination)│
              │       ↓                │
              │  HAProxy (Load Balancer)│
              │   ├─ core-api :3001   │
              │   ├─ socket-gw :3002  │
              │   ├─ MQTTS:8883→1883  │
              │   └─ EMQX Node 1     │
              └──────────┬─────────────┘
                         │ Tailscale VPN
              ┌──────────▼─────────────┐
              │  VPS1 "Hậu cung"      │
              │                        │
              │  PostgreSQL + Timescale│
              │  Redis (master)        │
              │  iot-gateway :3003     │
              │  worker-service :3004  │
              │  EMQX Node 2 (cluster) │
              └────────────────────────┘
```

| Thành phần | VPS2 (Mặt tiền) | VPS1 (Hậu cung) |
|---|---|---|
| **Proxy** | HAProxy + Nginx | ❌ đóng kín |
| **App** | core-api, socket-gateway | iot-gateway, worker-service |
| **Data** | ❌ (→ VPS1 qua Tailscale) | PostgreSQL, Redis |
| **MQTT** | EMQX Node 1 | EMQX Node 2 (cluster) |
| **Port** | 80, 443, 8883 | Chỉ Tailscale |

---

## 📁 Files Deployment

```
├── docker-compose.prod.yml       # Base config (all services)
├── docker-compose.vps1.yml       # Override: VPS1 Hậu cung
├── docker-compose.vps2.yml       # Override: VPS2 Mặt tiền
├── deploy/
│   ├── docker/
│   │   ├── nginx.conf            # Nginx reverse proxy
│   │   ├── init-emqx-auth.sh     # EMQX MQTT user provisioning
│   │   └── ssl/                  # TLS certs
│   │       └── mqtt.pem          # MQTT TLS (HAProxy)
│   ├── haproxy/
│   │   └── haproxy.cfg           # HAProxy: MQTTS, WS sticky, API LB
│   ├── scripts/
│   │   └── setup-mqtt-cert.sh    # Script tạo mqtt.pem từ Let's Encrypt
│   └── k8s/                      # (Future) Kubernetes configs
├── .env.production.example       # Template env
└── .github/workflows/
    ├── deploy.yml                # CI/CD: build → ghcr.io → deploy 2 VPS
    └── dev-build.yml             # CI: lint, test, format
```

---

## 🟢 CI/CD Pipeline

```
git push main
    │
    ├─ build-and-push:
    │    Build Docker image → push ghcr.io/lephuvu1994/sensa-smart-server
    │
    ├─ deploy-vps1 (Hậu cung): parallel
    │    Pull image → migrate → restart iot-gateway, worker, emqx
    │
    └─ deploy-vps2 (Mặt tiền): parallel
         Pull image → restart core-api, socket, emqx, nginx, haproxy
```

### GitHub Secrets cần tạo

| Secret | Mô tả |
|--------|-------|
| `GH_PAT` | GitHub PAT (repo + read:packages) |
| `VPS1_HOST` | IP VPS1 |
| `VPS1_USER` | root |
| `VPS1_SSH_KEY` | SSH private key VPS1 |
| `VPS1_PORT` | 22 |
| `VPS1_ENV` | Nội dung .env cho VPS1 |
| `VPS2_HOST` | IP VPS2 |
| `VPS2_USER` | root |
| `VPS2_SSH_KEY` | SSH private key VPS2 |
| `VPS2_PORT` | 26266 |
| `VPS2_ENV` | Nội dung .env cho VPS2 |

---

## 🐳 Deploy Thủ Công

### Single Node (1 VPS)

```bash
# Clone & cấu hình
git clone https://github.com/lephuvu1994/sensa-smart-server.git sensa-smart-server
cd sensa-smart-server
cp .env.production.example .env
nano .env

# Build & Deploy
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

### HA Split (2 VPS)

```bash
# VPS1 (Hậu cung) — DB, Redis, IoT, Worker
docker compose -f docker-compose.prod.yml -f docker-compose.vps1.yml up -d

# VPS2 (Mặt tiền) — API, Socket, HAProxy, Nginx
docker compose -f docker-compose.prod.yml -f docker-compose.vps2.yml --profile loadbalancer up -d
```

---

## 🔐 SSL / MQTT Certificates

### HTTPS (Nginx)

```bash
# Let's Encrypt
certbot --nginx -d sensasmart.ddns.net
```

### MQTTS (HAProxy port 8883)

```bash
# Chạy script setup (VPS2)
bash deploy/scripts/setup-mqtt-cert.sh
```

Script sẽ:
1. Combine Let's Encrypt cert → `deploy/docker/ssl/mqtt.pem`
2. Setup cron auto-renew mỗi ngày 3h sáng

---

## 🌐 Tailscale VPN

Mạng LAN ảo kết nối 2 VPS qua IP riêng:

| Node | Tailscale IP | Hostname |
|------|-------------|----------|
| VPS1 | 100.117.220.15 | sensa-smart-vps1 |
| VPS2 | 100.85.73.41 | sensa-smart-vps2 |

```bash
# Kiểm tra
tailscale status
tailscale ping sensa-smart-vps1
```

---

## ⚙️ Environment Variables

### VPS1 (.env) — Hậu cung

```env
EMQX_NODE_NAME=emqx@100.117.220.15
TAILSCALE_IP=100.117.220.15
DATABASE_URL=postgresql://postgres:PASSWORD@postgres:5432/sensa_smart?schema=public
REDIS_HOST=redis
MQTT_HOST=mqtt://emqx
```

### VPS2 (.env) — Mặt tiền

```env
EMQX_NODE_NAME=emqx@100.85.73.41
DATABASE_URL=postgresql://postgres:PASSWORD@100.117.220.15:5432/sensa_smart?schema=public
REDIS_HOST=100.117.220.15
MQTT_HOST=mqtt://localhost
```

> **Quan trọng**: VPS2 kết nối DB/Redis qua **Tailscale IP** (100.117.220.15), không qua public IP.

---

## 📊 HAProxy Load Balancer

Chạy trên **VPS2** (Mặt tiền):

| Frontend | Port | Backend | Mode |
|----------|------|---------|------|
| HTTP API | 8080 | core-api:3001 | HTTP round-robin |
| WebSocket | 8082 | socket-gw:3002 | HTTP sticky (cookie) |
| IoT Gateway | 8083 | iot-gw:3003 (VPS1) | HTTP round-robin |
| **MQTTS** | **8883** | emqx:1883 (cluster) | **TCP + TLS** |
| Stats | 8404 | - | Dashboard |

```bash
# Bật HAProxy
docker compose --profile loadbalancer up -d haproxy

# Stats dashboard
curl http://localhost:8404/stats
```

---

## 🔧 Monitoring & Quản Lý

```bash
# Container status
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Logs
docker compose -f docker-compose.prod.yml logs -f core-api

# EMQX cluster
docker exec sensa-smart-emqx-prod emqx ctl cluster status

# Resource usage
docker stats --no-stream

# Backup Database
docker exec sensa-smart-postgres-prod pg_dump \
  -U $POSTGRES_USER $POSTGRES_DB \
  > backup-$(date +%Y%m%d).sql
```

---

## 🔐 Bảo Mật Checklist

- [ ] Thay toàn bộ passwords/secrets trong `.env`
- [ ] Firewall: chỉ mở 80, 443, 8883 (MQTTS)
- [ ] Port 18083 (EMQX Dashboard): chỉ mở cho IP admin
- [ ] Port 5432, 6379: chỉ Tailscale (không public)
- [ ] SSL/HTTPS: Let's Encrypt + auto-renew
- [x] EMQX: auto-provision user MQTT (emqx-init service)
- [ ] `.env` không commit vào Git (đã .gitignore)

---

## 🆘 Troubleshooting

### Container không start
```bash
docker compose -f docker-compose.prod.yml logs --tail=50 SERVICE_NAME
docker events --since 5m
```

### VPS2 không kết nối được DB/Redis
```bash
# Verify Tailscale
ping 100.117.220.15

# Check port binding VPS1
docker port sensa-smart-postgres-prod
# Expected: 100.117.220.15:5432->5432/tcp
```

### EMQX cluster không join
```bash
nc -zv 100.117.220.15 4370    # Erlang dist port
nc -zv 100.85.73.41 4370
docker exec sensa-smart-emqx-prod emqx ctl cluster status
```

### MQTTS 8883 không hoạt động
```bash
ls -la deploy/docker/ssl/mqtt.pem   # Cert tồn tại?
docker exec sensa-smart-haproxy-prod haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
```

---

## 📚 Tham Khảo

| File | Mô tả |
|------|-------|
| [INFRASTRUCTURE.md](../INFRASTRUCTURE.md) | Full infra documentation |
| [docker-compose.prod.yml](../docker-compose.prod.yml) | Production base config |
| [docker-compose.vps1.yml](../docker-compose.vps1.yml) | VPS1 Hậu cung override |
| [docker-compose.vps2.yml](../docker-compose.vps2.yml) | VPS2 Mặt tiền override |
| [haproxy.cfg](haproxy/haproxy.cfg) | HAProxy load balancer config |
| [nginx.conf](docker/nginx.conf) | Nginx reverse proxy |
| [deploy.yml](../.github/workflows/deploy.yml) | CI/CD workflow |
| [.env.production.example](../.env.production.example) | Template env |
