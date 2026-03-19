# 🏗️ Infrastructure Guide — Aurathink Server

## Architecture Overview

```
                     Internet
            HTTPS (443) │  MQTTS (8883)
              ┌─────────▼──────────────┐
              │  VPS2 — "Mặt tiền"    │
              │  Tailscale: 100.85.73.41│
              │                        │
              │  Nginx (TLS) → HAProxy │
              │   ├─ core-api (:3001)  │
              │   ├─ socket-gw (:3002) │
              │   └─ EMQX Node 1      │
              └──────────┬─────────────┘
                         │ Tailscale VPN
              ┌──────────▼─────────────┐
              │  VPS1 — "Hậu cung"    │
              │  Tailscale: 100.117.220.15│
              │                        │
              │  PostgreSQL + Timescale│
              │  Redis                 │
              │  iot-gateway (:3003)   │
              │  worker-service (:3004)│
              │  EMQX Node 2 (cluster) │
              └────────────────────────┘
```

---

## Deployment Phases

### GĐ1: Single Node (hiện tại ✅)

VPS1 chạy **tất cả** services. VPS2 chưa kích hoạt.

```bash
docker compose -f docker-compose.prod.yml up -d
```

**CI/CD**: Dùng secret `ENV_PRODUCTION` → deploy VPS1 only.

### GĐ2: HA Split (2 VPS)

> Xem [Checklist chuyển sang GĐ2](#checklist-chuyển-sang-gđ2) bên dưới.

```bash
# VPS1 (Hậu cung)
docker compose -f docker-compose.prod.yml -f docker-compose.vps1.yml up -d

# VPS2 (Mặt tiền)
docker compose -f docker-compose.prod.yml -f docker-compose.vps2.yml --profile loadbalancer up -d
```

---

## File Structure

```
├── docker-compose.prod.yml       # Base config (all services)
├── docker-compose.vps1.yml       # Override: VPS1 Hậu cung
├── docker-compose.vps2.yml       # Override: VPS2 Mặt tiền
├── .env.vps1.example             # Template: VPS1_ENV secret
├── .env.vps2.example             # Template: VPS2_ENV secret
├── .env.production.example       # Template: GĐ1 single-node ENV_PRODUCTION
├── deploy/
│   ├── haproxy/
│   │   └── haproxy.cfg           # HAProxy: MQTTS 8883, WS sticky, API LB
│   └── docker/
│       ├── nginx.conf            # Nginx reverse proxy
│       └── ssl/                  # TLS certificates
│           └── mqtt.pem          # MQTT TLS cert (HAProxy)
└── .github/workflows/
    ├── deploy.yml                # CI/CD: production deploy
    └── dev-build.yml             # CI: lint, test, format
```

---

## Tailscale VPN

Private mesh network connecting VPS1 ↔ VPS2.

| Node | Public IP | Tailscale IP | Hostname |
|------|-----------|-------------|----------|
| VPS1 | 157.66.27.91 | 100.117.220.15 | aurathink-vps1 |
| VPS2 | 42.96.13.60 | 100.85.73.41 | aurathink-vps2 |

```bash
# Check status
tailscale status

# Ping other node
tailscale ping aurathink-vps1   # from VPS2
```

---

## EMQX Cluster

2-node cluster via Tailscale. IoT devices connect to either node, messages sync automatically.

```bash
# Check cluster status
docker exec aurathink-emqx-prod emqx ctl cluster status

# Dashboard: http://VPS_IP:18083
# Default: admin / (EMQX_DASHBOARD_PASS)
```

**MQTT Flow:**
```
Device → mqtts://domain:8883 → HAProxy (TLS termination) → EMQX:1883 (cluster)
```

---

## HAProxy Load Balancer

Runs on **VPS2** only. Handles:

| Frontend | Port | Backend | Mode |
|----------|------|---------|------|
| HTTP API | 8080 | core-api:3001 | HTTP round-robin |
| WebSocket | 8082 | socket-gw:3002 | HTTP sticky (cookie) |
| IoT Gateway | 8083 | iot-gw:3003 (VPS1) | HTTP round-robin |
| **MQTTS** | **8883** | emqx:1883 (cluster) | **TCP + TLS** |
| Stats | 8404 | - | Dashboard |

```bash
# Stats dashboard
curl http://localhost:8404/stats

# Start HAProxy
docker compose --profile loadbalancer up -d haproxy
```

### MQTTS Certificate

HAProxy needs a combined PEM file at `deploy/docker/ssl/mqtt.pem`:

```bash
# Generate or combine existing certs:
cat cert.pem privkey.pem > deploy/docker/ssl/mqtt.pem
```

---

## CI/CD Pipeline

### GĐ1 (hiện tại)
```
git push main
    ├─ Build Docker image → push ghcr.io
    └─ Deploy VPS1 (ALL services)
```

### GĐ2
```
git push main
    ├─ Build Docker image → push ghcr.io
    ├─ Deploy VPS1 (postgres, redis, emqx, iot-gateway, worker-service)
    └─ Deploy VPS2 (core-api, socket-gateway, emqx, nginx, haproxy)  ← after VPS1
```

---

## GitHub Secrets

### GĐ1 (hiện tại)

| Secret | Description |
|--------|-------------|
| `GH_PAT` | GitHub PAT (repo + read:packages) |
| `ENV_PRODUCTION` | .env content (single-node, xem `.env.production.example`) |
| `VPS1_HOST` | 157.66.27.91 |
| `VPS1_USER` | root |
| `VPS1_SSH_KEY` | SSH private key for VPS1 |
| `VPS1_PORT` | 22 |

### GĐ2 (cần thêm)

| Secret | Description |
|--------|-------------|
| `VPS1_ENV` | .env content cho VPS1 (xem `.env.vps1.example`) |
| `VPS2_ENV` | .env content cho VPS2 (xem `.env.vps2.example`) |
| `VPS2_HOST` | 42.96.13.60 |
| `VPS2_USER` | root |
| `VPS2_SSH_KEY` | SSH private key for VPS2 |
| `VPS2_PORT` | 26266 |

---

## Environment Variables — Key Differences

| Biến | VPS1 (Hậu cung) | VPS2 (Mặt tiền) |
|------|-----------------|-----------------|
| `DATABASE_URL` | `...@postgres:5432/...` (local) | `...@100.117.220.15:5432/...` (Tailscale) |
| `REDIS_HOST` | `redis` (local) | `100.117.220.15` (Tailscale) |
| `MQTT_HOST` | `mqtt://emqx` (local) | `mqtt://localhost` (local EMQX node) |
| `EMQX_NODE_NAME` | `emqx@100.117.220.15` | `emqx@100.85.73.41` |
| `TAILSCALE_IP` | `100.117.220.15` | không cần |

> ⚠️ Các secret chung (JWT, DB password, Redis password, MQTT password...) PHẢI GIỐNG NHAU giữa 2 VPS.

---

## Checklist chuyển sang GĐ2

### 1. Chuẩn bị VPS2
- [ ] Cài Docker + Docker Compose trên VPS2
- [ ] Cài Tailscale, join cùng tailnet với VPS1
- [ ] Verify kết nối: `tailscale ping aurathink-vps1` → OK
- [ ] Clone repo: `git clone https://github.com/lephuvu1994/euro-smart-server.git ~/aurathink-server`

### 2. Verify network
- [ ] Từ VPS2, kết nối được Postgres VPS1: `psql -h 100.117.220.15 -U postgres -d aurathink`
- [ ] Từ VPS2, kết nối được Redis VPS1: `redis-cli -h 100.117.220.15 -a <password> ping`
- [ ] Từ VPS2, kết nối được EMQX VPS1: `nc -zv 100.117.220.15 4370` (cluster port)

### 3. SSL / TLS
- [ ] Copy SSL cert lên VPS2: `deploy/docker/ssl/`
- [ ] Tạo MQTTS PEM: `cat cert.pem privkey.pem > deploy/docker/ssl/mqtt.pem`
- [ ] Cấu hình DNS trỏ domain về VPS2 public IP (42.96.13.60)

### 4. GitHub Secrets
- [ ] Tạo `VPS1_ENV` — copy nội dung từ `.env.vps1.example`, điền giá trị thật
- [ ] Tạo `VPS2_ENV` — copy nội dung từ `.env.vps2.example`, điền giá trị thật
- [ ] Tạo `VPS2_HOST` = `42.96.13.60`
- [ ] Tạo `VPS2_USER` = `root`
- [ ] Tạo `VPS2_SSH_KEY` = SSH private key VPS2
- [ ] Tạo `VPS2_PORT` = `26266`

### 5. Merge & Deploy
- [ ] Merge branch `feature/phase2-ha-split` vào `main`
- [ ] CI/CD sẽ tự động deploy cả 2 VPS
- [ ] Verify VPS1: containers postgres, redis, emqx, iot-gateway, worker-service đang chạy
- [ ] Verify VPS2: containers core-api, socket-gateway, emqx, nginx, haproxy đang chạy

### 6. Post-deploy checks
- [ ] EMQX cluster đã join: `docker exec aurathink-emqx-prod emqx ctl cluster status`
- [ ] Health check VPS2: `curl https://aurathink.ddns.net/health`
- [ ] MQTTS test: `mosquitto_pub -h aurathink.ddns.net -p 8883 --cafile ca.crt -t test -m "hello"`
- [ ] App kết nối bình thường (API + WebSocket + MQTT)

---

## Monitoring

```bash
# All containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Logs
docker compose logs -f --tail=50 core-api

# EMQX cluster
docker exec aurathink-emqx-prod emqx ctl cluster status

# HAProxy stats
curl http://localhost:8404/stats

# Tailscale
tailscale status
```

---

## Troubleshooting

### EMQX cluster not forming
```bash
# Check ports 4370/5370 reachable via Tailscale
nc -zv 100.117.220.15 4370
nc -zv 100.85.73.41 4370

# Verify EMQX_NODE_NAME matches Tailscale IP
docker exec aurathink-emqx-prod emqx ctl cluster status
```

### VPS2 can't connect to Postgres/Redis
```bash
# Verify Tailscale connectivity
ping 100.117.220.15

# Check ports are bound to Tailscale IP
docker port aurathink-postgres-prod
# Should show: 100.117.220.15:5432->5432/tcp
```

### HAProxy MQTTS not working
```bash
# Check cert file exists
ls -la deploy/docker/ssl/mqtt.pem

# Test MQTTS
mosquitto_pub -h domain -p 8883 --cafile ca.crt -t test -m "hello"

# Check HAProxy config
docker exec aurathink-haproxy-prod haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
```
