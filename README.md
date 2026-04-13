# Aurathink Server

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

NX Monorepo cho hệ thống **Smart Home IoT** — 4 microservices NestJS, deploy HA trên **2 VPS** với Docker Compose + Tailscale VPN.

---

## 📋 Kiến Trúc

```
                     Internet
            HTTPS (443) │  MQTTS (8883)
              ┌─────────▼──────────────┐
              │  VPS2 "Mặt tiền"      │
              │  Nginx (TLS) → HAProxy │
              │   ├─ core-api :3001   │
              │   ├─ socket-gw :3002  │
              │   └─ EMQX Node 1     │
              └──────────┬─────────────┘
                         │ Tailscale VPN
              ┌──────────▼─────────────┐
              │  VPS1 "Hậu cung"      │
              │  PostgreSQL + Timescale│
              │  Redis                 │
              │  iot-gateway :3003     │
              │  worker-service :3004  │
              │  EMQX Node 2 (cluster) │
              └────────────────────────┘
```

**Shared Libraries**: `@sensa-smart/common` · `@sensa-smart/database` · `@sensa-smart/redis-cache`

---

## 🚀 Quick Start (Local Dev)

```bash
# 1. Cài dependencies
corepack enable && corepack prepare yarn@4.9.2 --activate
yarn install --immutable

# 2. Cấu hình
cp .env.example .env   # ✏️ Chỉnh sửa .env

# 3. Generate Prisma client
yarn generate

# 4. Chạy với Docker (recommended — có sẵn Postgres, Redis, EMQX)
docker compose build
docker compose run --rm migrate
docker compose up -d

# Hoặc chạy từng service local (cần infra sẵn)
yarn dev:core-api
yarn dev:socket-gateway
yarn dev:iot-gateway
yarn dev:worker-service
```

---

## 🔨 Build & Test

```bash
yarn build          # Build tất cả services
yarn build:core-api # Build 1 service

yarn test           # Chạy tests
yarn lint           # Lint
yarn format         # Format code
```

---

## 🗃️ Database

```bash
yarn generate       # Generate Prisma client
yarn migrate        # Tạo migration (dev)
yarn migrate:prod   # Apply migration (production)
yarn studio         # Prisma Studio GUI
yarn seed:admin     # Seed admin user
```

---

## 🐳 Deployment

### CI/CD (GitHub Actions)

Push `main` → tự động build Docker image → push `ghcr.io` → deploy song song 2 VPS.

| File | Mục đích |
|------|----------|
| `docker-compose.prod.yml` | Base config (all services) |
| `docker-compose.vps1.yml` | Override: VPS1 Hậu cung (DB + IoT + Worker) |
| `docker-compose.vps2.yml` | Override: VPS2 Mặt tiền (API + Socket + HAProxy) |
| `deploy/haproxy/haproxy.cfg` | HAProxy LB: MQTTS 8883, WS sticky, API round-robin |
| `.github/workflows/deploy.yml` | CI/CD dual VPS deploy |

### Deploy thủ công (Single Node)

```bash
docker compose -f docker-compose.prod.yml up -d
```

### Deploy HA (2 VPS)

```bash
# VPS1 (Hậu cung)
docker compose -f docker-compose.prod.yml -f docker-compose.vps1.yml up -d

# VPS2 (Mặt tiền)
docker compose -f docker-compose.prod.yml -f docker-compose.vps2.yml --profile loadbalancer up -d
```

👉 **Chi tiết đầy đủ**: [INFRASTRUCTURE.md](INFRASTRUCTURE.md) · [deploy/README.md](deploy/README.md)

---

## 📁 Cấu Trúc Dự Án

```
sensa-smart-server/
├── apps/
│   ├── core-api/               # REST API chính
│   ├── socket-gateway/         # WebSocket server + RedisIoAdapter
│   ├── iot-gateway/            # MQTT bridge
│   └── worker-service/         # BullMQ worker
├── libs/
│   ├── common/                 # Shared utilities, config, auth, i18n
│   ├── database/               # Prisma database module
│   └── redis-cache/            # Redis cache module
├── prisma/                     # Schema & migrations
├── deploy/
│   ├── docker/                 # Nginx config + SSL
│   ├── haproxy/                # HAProxy load balancer config
│   └── scripts/                # Deployment scripts (MQTT cert, etc.)
├── docker-compose.yml          # Dev: full infra + 4 services
├── docker-compose.prod.yml     # Production: base config
├── docker-compose.vps1.yml     # HA: VPS1 Hậu cung override
├── docker-compose.vps2.yml     # HA: VPS2 Mặt tiền override
├── Dockerfile                  # Multi-stage build
├── INFRASTRUCTURE.md           # Full infra documentation
└── .env.production.example     # Template biến môi trường production
```
