# Euro Smart Server

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

NX Monorepo cho hệ thống Smart Home — gồm 4 microservices chạy trên NestJS.

## 📋 Kiến Trúc

| Service | Port | Mô tả |
|---------|------|--------|
| **core-api** | 3001 | REST API chính |
| **socket-gateway** | 3002 | WebSocket server (real-time) |
| **iot-gateway** | 3003 | MQTT bridge (IoT devices) |
| **worker-service** | 3004 | BullMQ job processor |

**Shared Libraries**: `@euro-smart-server/common`, `@euro-smart-server/database`, `@euro-smart-server/redis-cache`

## 🚀 Quick Start

```bash
# Cài dependencies
corepack enable && corepack prepare yarn@4.9.2 --activate
yarn install --immutable

# Cấu hình
cp .env.example .env   # Chỉnh sửa .env

# Generate Prisma client
yarn generate

# Chạy development (tất cả services)
yarn dev

# Chạy từng service
yarn dev:core-api
yarn dev:iot-gateway
yarn dev:socket-gateway
yarn dev:worker-service
```

## 🔨 Build

```bash
yarn build                    # Build tất cả
yarn build:core-api           # Build 1 service
```

## 🧪 Test & Lint

```bash
yarn test                     # Chạy tests
yarn lint                     # Lint
yarn format                   # Format code
```

## 🗃️ Database

```bash
yarn generate                 # Generate Prisma client
yarn migrate                  # Tạo migration (dev)
yarn migrate:prod             # Apply migration (production)
yarn studio                   # Prisma Studio GUI
yarn seed:admin               # Seed admin user
```

## 🚀 Deployment

Hỗ trợ deploy trên nhiều nền tảng:

| Nền tảng | Config file | Hướng dẫn |
|----------|-------------|-----------|
| **PM2** | `ecosystem.config.js` | [deploy/pm2/README.md](deploy/pm2/README.md) |
| **Docker** | `docker-compose.prod.yml` | [deploy/README.md](deploy/README.md) |
| **Kubernetes** | `deploy/k8s/*.yaml` | [deploy/k8s/README.md](deploy/k8s/README.md) |
| **VPS (systemd)** | `deploy/vps/*.service` | [deploy/vps/README.md](deploy/vps/README.md) |
| **Render** | `render.yaml` | [deploy/README.md](deploy/README.md) |

👉 **Xem hướng dẫn đầy đủ**: [deploy/README.md](deploy/README.md)

## 📁 Cấu Trúc Dự Án

```
euro-smart-server/
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
├── deploy/                 # Deployment configs
│   ├── k8s/                # Kubernetes manifests
│   ├── pm2/                # PM2 guide
│   └── vps/                # systemd + nginx
├── ecosystem.config.js     # PM2 config
├── docker-compose.yml      # Docker dev
├── docker-compose.prod.yml # Docker production
├── render.yaml             # Render Blueprint
└── Dockerfile              # Multi-stage build
```
