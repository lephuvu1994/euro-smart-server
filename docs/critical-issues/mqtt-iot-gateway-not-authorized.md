# 🚨 CRITICAL ISSUE: IoT Gateway — MQTT "Not Authorized" Permanent Disconnect

**ID:** CI-001  
**Status:** RESOLVED  
**First Occurred:** 2026-04-12  
**Resolved:** 2026-04-13  
**Severity:** Critical (thiết bị phần cứng mất kết nối hoàn toàn)  
**Services:** `iot-gateway`, `emqx`, `core-api`, `nginx`

> [!WARNING]
> **Post-Fix Incident (2026-04-13):** Trong quá trình fix, một sửa đổi sai (`external: true` + `name: sensa-smart-network`) đã gây ra lỗi CI/CD deploy khác. Xem phần **Pitfalls** cuối file.

---

## 🔥 Triệu chứng

```
# docker logs sensa-smart-iot-gateway-prod

{"level":"ERROR","context":"MqttService","message":"MQTT Error: Connection refused: Not authorized"}
{"level":"WARN","context":"MqttService","message":"Auth/Connection error detected — forcing reconnect in 10s..."}
{"level":"WARN","context":"MqttService","message":"MQTT Client is offline"}
{"level":"WARN","context":"MqttService","message":"MQTT offline — queued subscribe for "device/+/status""}
```

- Log **bị đóng băng** tại thời điểm lỗi, không có log mới dù container vẫn running
- `docker exec sensa-smart-emqx-prod emqx_ctl clients list` chỉ thấy `core-api` — **không thấy `iot-gateway`**
- EMQX dashboard stats: `not_authorized` count tăng dần
- Thiết bị phần cứng publish lên EMQX nhưng **không có service nhận** (subscriptions=0)
- Restart `iot-gateway` bằng `docker restart` không có tác dụng vì logs vẫn cũ do `bufferLogs: true`

---

## 🔍 Root Cause Analysis (Đa tầng)

### Tầng 1 — Race Condition (Nguyên nhân chính)

```yaml
# docker-compose.prod.yml — LỖI CŨ
iot-gateway:
  depends_on:
    emqx:
      condition: service_healthy
    redis:
      condition: service_healthy
    # ❌ THIẾU core-api !
```

**Cơ chế lỗi:**
1. Deploy/restart → `emqx` + `redis` healthy → `iot-gateway` start ngay
2. `core-api` vẫn đang chạy Prisma migrations (có thể mất 1-3 phút, `start_period: 180s`)
3. `iot-gateway` kết nối EMQX → EMQX gọi auth webhook `http://nginx:3002/v1/internal/emqx/auth`
4. `core-api` chưa ready → nginx trả 502/timeout → EMQX trả **CONNACK rc=5 (Not Authorized)**
5. **mqtt.js v4+ dừng reconnect HOÀN TOÀN** sau khi nhận CONNACK rc=5 — đây là breaking change từ mqtt.js v3
6. `scheduleReconnect` force lại nhưng EMQX tiếp tục reject → backoff 10s→15s→23s→...→60s (cap)
7. Sau vài lần fail ở 60s backoff, **process bị freeze** — không có log mới dù process vẫn sống

### Tầng 2 — Docker Network Mismatch

```bash
# Khi chạy: docker compose up --no-deps iot-gateway
# Compose tạo NETWORK MỚI thay vì dùng network có sẵn

NETWORK ID     NAME                     DRIVER
d121a17aed6e   sensa-smart-network        bridge   ← network cũ (core-api, worker)
ec48de9164f5   sensa-smart-prod-network   bridge   ← network mới (emqx, nginx, iot-gateway)
```

- Container cũ (`sensa-smart-network`) chứa: `core-api`, `worker-service`
- Container mới (`sensa-smart-prod-network`) chứa: `emqx`, `nginx`, `redis`, `postgres`, `iot-gateway`
- **2 networks hoàn toàn cô lập** → nginx proxy `http://core-api:3001` thất bại silently

### Tầng 3 — EMQX Erlang DNS Cache

- EMQX Erlang HTTP client cache IP resolution của `nginx`
- Sau khi network bị recreate (IP thay đổi), EMQX tiếp tục dùng IP cũ → connection fail
- Giải pháp tạm: `docker restart sensa-smart-emqx-prod` để flush Erlang DNS cache
- **Đây là lý do tại sao nginx config dùng port 3002 riêng** (`enable_pipelining = 1` + `valid=10s` DNS resolver) nhưng Erlang vẫn cache lâu hơn

### Tầng 4 — bufferLogs:true Che Logs

```typescript
// iot-gateway/main.ts — LỖI CŨ
const app = await NestFactory.create(AppModule, { bufferLogs: true });
```

- `bufferLogs: true` → Pino giữ log trong RAM cho đến khi được attach
- Nếu app crash hoặc freeze trước khi Pino attach → **mất toàn bộ logs startup**
- `docker logs sensa-smart-iot-gateway-prod` chỉ hiện log từ lần khởi động trước

---

## ✅ Fix Đã Apply

### Fix 1: `docker-compose.prod.yml` — Thêm `core-api` vào `depends_on`

```yaml
iot-gateway:
  depends_on:
    emqx:
      condition: service_healthy
    redis:
      condition: service_healthy
    # ✅ FIX: Đợi core-api healthy trước khi start
    core-api:
      condition: service_healthy

worker-service:
  depends_on:
    redis:
      condition: service_healthy
    # ✅ FIX: Worker cần DB migration hoàn tất
    core-api:
      condition: service_healthy
```

### Fix 2: `docker-compose.prod.yml` — Network `external: true`

```yaml
networks:
  sensa-internal:
    # ✅ FIX: Dùng network có sẵn, không để compose tạo mới
    external: true
    name: sensa-smart-network
```

### Fix 3: `apps/iot-gateway/src/main.ts` — Tắt bufferLogs

```typescript
// ✅ FIX: bufferLogs: false → logs hiện ngay lập tức
const app = await NestFactory.create(AppModule, { bufferLogs: false });
```

### Fix 4: `libs/common/src/mqtt/mqtt.service.ts` — Cải thiện reconnect

```typescript
// ✅ FIX: Thêm ECONNREFUSED/ETIMEDOUT vào error handler
// ✅ FIX: Guard check `client.connected` trong setTimeout
// ✅ FIX: Log rõ ràng hơn cho mỗi bước reconnect
```

---

## 🏥 Quy Trình Debug Khi Tái Phát

### Bước 1: Xác nhận symptom

```bash
# Check log iot-gateway - có frozen tại lỗi "Not authorized" không?
docker logs sensa-smart-iot-gateway-prod --tail 20

# Check EMQX clients - iot-gateway có kết nối không?
docker exec sensa-smart-emqx-prod emqx_ctl clients list

# Check subscriptions - có 5 topics không?
docker exec sensa-smart-emqx-prod emqx_ctl subscriptions list | grep 'mqttjs_'
```

**Dấu hiệu bị lỗi:**
- Log gateway đóng băng không có entry mới
- `emqx_ctl clients list` hiện 0-1 client (không thấy iot-gateway)
- `subscriptions list` không có `device/+/status`, `device/+/state`, etc.

### Bước 2: Kiểm tra network

```bash
# Liệt kê tất cả networks
docker network ls | grep sensa-smart

# Xem container nào trong network nào
docker ps -a --format '{{.Names}} {{.Networks}}'

# QUAN TRỌNG: core-api và iot-gateway phải cùng network
docker inspect sensa-smart-core-api-prod --format 'Networks: {{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
docker inspect sensa-smart-iot-gateway-prod --format 'Networks: {{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}'
```

### Bước 3: Test auth webhook trực tiếp

```bash
# Test từ bên trong iot-gateway container đến core-api auth endpoint
docker exec sensa-smart-iot-gateway-prod node -e "
fetch('http://core-api:3001/v1/internal/emqx/auth', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'leephusvux1994', password: 'Vu31101994@', clientid: 'test' })
}).then(r => r.text()).then(console.log).catch(console.error)
"

# Kết quả mong đợi: {"result":"allow"}
# Nếu fail → core-api chưa ready hoặc network không thông
```

### Bước 4: Test MQTT kết nối trực tiếp

```bash
# Copy test script vào container
cat > /tmp/mqtt_test.js << 'EOF'
const m = require('/app/node_modules/mqtt');
const c = m.connect('mqtt://emqx:1883', {
  username: 'leephusvux1994',
  password: 'Vu31101994@',
  connectTimeout: 5000,
  reconnectPeriod: 0
});
const done = setTimeout(() => { console.log('TIMEOUT'); c.end(true); process.exit(2); }, 7000);
c.on('connect', () => { clearTimeout(done); console.log('MQTT CONNECT SUCCESS'); c.end(true); process.exit(0); });
c.on('error', (e) => { clearTimeout(done); console.error('MQTT ERROR:', e.message); c.end(true); process.exit(1); });
EOF

docker cp /tmp/mqtt_test.js sensa-smart-iot-gateway-prod:/tmp/mqtt_test.js
docker exec sensa-smart-iot-gateway-prod node /tmp/mqtt_test.js

# MQTT CONNECT SUCCESS → auth webhook hoạt động đúng
# MQTT ERROR: Not authorized → auth webhook fail
```

### Bước 5: Fix nhanh (nếu tái phát)

```bash
# Option A: Restart toàn bộ theo đúng thứ tự
docker restart sensa-smart-emqx-prod
sleep 20  # Đợi EMQX ready
docker restart sensa-smart-iot-gateway-prod

# Option B: Nếu nghi ngờ network issue
# Kết nối thủ công container vào đúng network
docker network connect sensa-smart-prod-network sensa-smart-iot-gateway-prod
docker restart sensa-smart-iot-gateway-prod

# Option C: Nuclear option — recreate toàn bộ stack đúng thứ tự
cd /root/sensa-smart-server
docker compose -f docker-compose.prod.yml up -d --no-deps core-api
# Đợi core-api healthy (check /health trả 200)
docker compose -f docker-compose.prod.yml up -d --no-deps iot-gateway
```

---

## 🛡️ Phòng Tránh Tái Phát

| Prevention | Status | Description |
|-----------|--------|-------------|
| `depends_on: core-api: service_healthy` | ✅ DONE | IoT gateway chờ core-api pass health check |
| `external: true` cho network | ✅ DONE | Dùng network có sẵn, không tạo mới |
| `bufferLogs: false` | ✅ DONE | Docker logs luôn visible |
| Infinite reconnect loop | ✅ DONE | `scheduleReconnect` không bao giờ dừng |

---

## 📝 Ghi Chú Kỹ Thuật

### Tại sao mqtt.js v4+ không tự reconnect sau `Not Authorized`?

mqtt.js v4 thay đổi behavior: khi nhận CONNACK với `returnCode !== 0`, client emit `error` event và **tự end connection** mà không schedule reconnect. Đây là breaking change từ v3.

Source: https://github.com/mqttjs/MQTT.js/blob/main/src/lib/client.ts

**Giải pháp:** Trong `MqttService.on('error')`, nếu error là auth-related, phải gọi `scheduleReconnect()` thủ công.

### Tại sao EMQX cần proxy qua nginx port 3002?

EMQX Erlang HTTP client cache DNS resolution **vĩnh viễn** trong lifetime của process. Nếu để EMQX gọi trực tiếp `http://core-api:3001`, khi core-api bị recreate (IP đổi), EMQX sẽ dùng IP cũ.

Giải pháp: Route qua nginx (port 3002) với `resolver 127.0.0.11 valid=10s` — nginx re-resolve DNS mỗi 10 giây, busting Erlang cache problem. Nhưng khi bản thân nginx bị recreate thì EMQX vẫn cache IP cũ của nginx → cần restart EMQX.

### Tại sao `docker compose up --no-deps` gây ra network mismatch?

Khi compose thấy network `sensa-internal` chưa tồn tại (hoặc label không khớp), nó **tạo network mới** theo config trong compose file. Nếu tên network trong compose khác với tên thực (`sensa-smart-prod-network` vs `sensa-smart-network`), hai sets containers sẽ ở 2 networks riêng biệt.

**Giải pháp:** Dùng `external: true` cho network. Compose sẽ dùng network đã tồn tại mà không validate labels.

---

*Last updated: 2026-04-13 | Fixed in commit: `f9b4b06`*
