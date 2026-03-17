# Aurathink Server

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

NX Monorepo cho hệ thống **Smart Home IoT** — 4 microservices NestJS, deploy bằng **Docker Compose**.

---

## 📋 Kiến Trúc

```
Internet
   │
   ▼
[Nginx :80/:443]  ← SSL, reverse proxy, rate limiting
   ├─► /api/        → core-api :3001     REST API chính
   ├─► /socket.io/  → socket-gateway :3002  WebSocket real-time
   └─► /iot/        → iot-gateway :3003  HTTP IoT endpoint
                          ↓
                  worker-service :3004   BullMQ jobs (internal)

Infrastructure (Docker internal):
   ├── PostgreSQL   Database
   ├── Redis        Cache + BullMQ + Pub/Sub
   └── EMQX :1883/:8883  MQTT Broker (IoT devices)
```

**Shared Libraries**: `@aurathink-server/common` · `@aurathink-server/database` · `@aurathink-server/redis-cache`

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

## 🐳 Deployment (Docker Compose)

Hệ thống deploy hoàn toàn bằng **Docker Compose** — phù hợp từ single VPS đến khi cần nâng lên Kubernetes.

| File | Dùng khi |
|------|----------|
| `docker-compose.yml` | Local development (full infra + services) |
| `docker-compose.prod.yml` | Production (Nginx + full stack) |
| `deploy/docker/nginx.conf` | Nginx reverse proxy config |

```bash
# Production — lần đầu
cp .env.example .env && nano .env
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d

# Cập nhật code
git pull && docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d --no-deps core-api
```

👉 **Hướng dẫn đầy đủ**: [deploy/README.md](deploy/README.md)

---

## 📁 Cấu Trúc Dự Án

```
aurathink-server/
├── apps/
│   ├── core-api/           # REST API chính
│   ├── socket-gateway/     # WebSocket server
│   ├── iot-gateway/        # MQTT bridge
│   └── worker-service/     # BullMQ worker
├── libs/
│   ├── common/             # Shared utilities, config, auth, i18n
│   ├── database/           # Prisma database module
│   └── redis-cache/        # Redis cache module
├── prisma/                 # Schema & migrations
├── deploy/
│   ├── docker/             # Nginx config + SSL
│   │   └── nginx.conf
│   └── README.md           # Hướng dẫn deploy Docker Compose
├── docker-compose.yml      # Dev: full infra + 4 services
├── docker-compose.prod.yml # Production: Nginx + full stack
├── Dockerfile              # Multi-stage build
└── .env.example            # Template biến môi trường
```
