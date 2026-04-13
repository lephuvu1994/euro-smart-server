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

## Quick Start

### GĐ1: Single Node (VPS1 only)

```bash
# Deploy everything on VPS1
docker compose -f docker-compose.prod.yml up -d
```

### GĐ2: HA Split (2 VPS)

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
├── deploy/
│   ├── haproxy/
│   │   └── haproxy.cfg           # HAProxy: MQTTS 8883, API LB
│   └── docker/
│       ├── nginx.conf            # Nginx reverse proxy
│       ├── init-emqx-auth.sh     # EMQX MQTT user provisioning
│       └── ssl/                  # TLS certificates
│           └── mqtt.pem          # MQTT TLS cert (HAProxy)
└── .github/workflows/
    ├── deploy.yml                # CI/CD: dual VPS deploy
    └── dev-build.yml             # CI: lint, test, format
```

---

## Tailscale VPN

Private mesh network connecting VPS1 ↔ VPS2.

| Node | Public IP | Tailscale IP | Hostname |
|------|-----------|-------------|----------|
| VPS1 | 157.66.27.91 | 100.117.220.15 | sensa-smart-vps1 |
| VPS2 | 42.96.13.60 | 100.85.73.41 | sensa-smart-vps2 |

```bash
# Check status
tailscale status

# Ping other node
tailscale ping sensa-smart-vps1   # from VPS2
```

---

## EMQX Cluster

2-node cluster via Tailscale. IoT devices connect to either node, messages sync automatically.

```bash
# Check cluster status
docker exec sensa-smart-emqx-prod emqx ctl cluster status

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

```
git push main
    ├─ Build Docker image → push ghcr.io
    ├─ Deploy VPS1 (iot-gateway, worker-service, emqx)
    └─ Deploy VPS2 (core-api, emqx, nginx, haproxy)
```

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `GH_PAT` | GitHub PAT (repo + read:packages) |
| `VPS1_HOST` | 157.66.27.91 |
| `VPS1_USER` | root |
| `VPS1_SSH_KEY` | SSH private key for VPS1 |
| `VPS1_PORT` | 22 |
| `VPS1_ENV` | .env content for VPS1 |
| `VPS2_HOST` | 42.96.13.60 |
| `VPS2_USER` | root |
| `VPS2_SSH_KEY` | SSH private key for VPS2 |
| `VPS2_PORT` | 26266 |
| `VPS2_ENV` | .env content for VPS2 |

---

## Environment Variables

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

---

## EMQX Authentication

EMQX uses **HTTP Auth** backed by `core-api`:

- **Auth**: `POST http://core-api:3001/internal/emqx/auth` — HMAC-SHA256 verification (stateless)
- **ACL**: `POST http://core-api:3001/internal/emqx/acl` — Device ownership + shared check

Server services (iot-gateway, worker) authenticate with `MQTT_USER`/`MQTT_PASS`. App users authenticate with HMAC credentials from `GET /v1/devices/mqtt-credentials`.

```bash
# Verify MQTT clients
docker exec sensa-smart-emqx-prod emqx_ctl clients list
```

---

## Monitoring

```bash
# All containers
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Logs
docker compose logs -f --tail=50 core-api

# EMQX cluster
docker exec sensa-smart-emqx-prod emqx ctl cluster status

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
docker exec sensa-smart-emqx-prod emqx ctl cluster status
```

### VPS2 can't connect to Postgres/Redis
```bash
# Verify Tailscale connectivity
ping 100.117.220.15

# Check ports are bound to Tailscale IP
docker port sensa-smart-postgres-prod
# Should show: 100.117.220.15:5432->5432/tcp
```

### HAProxy MQTTS not working
```bash
# Check cert file exists
ls -la deploy/docker/ssl/mqtt.pem

# Test MQTTS
mosquitto_pub -h domain -p 8883 --cafile ca.crt -t test -m "hello"

# Check HAProxy config
docker exec sensa-smart-haproxy-prod haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg
```
