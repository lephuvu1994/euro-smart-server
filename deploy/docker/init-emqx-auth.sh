#!/bin/sh
# ══════════════════════════════════════════════════════════════
# EMQX Auth Bootstrapper
# ══════════════════════════════════════════════════════════════
# Tạo MQTT user trong EMQX built-in database qua Dashboard API.
# Idempotent — an toàn chạy nhiều lần, skip nếu user đã tồn tại.
#
# Env vars cần thiết:
#   MQTT_USER, MQTT_PASS       — MQTT credentials
#   EMQX_DASHBOARD_USER        — Dashboard username (default: admin)
#   EMQX_DASHBOARD_PASS        — Dashboard password
#   EMQX_API_URL               — (optional) default: http://emqx:18083
# ══════════════════════════════════════════════════════════════

set -e

EMQX_API="${EMQX_API_URL:-http://emqx:18083}"
DASH_USER="${EMQX_DASHBOARD_USER:-admin}"
DASH_PASS="${EMQX_DASHBOARD_PASS:?EMQX_DASHBOARD_PASS is required}"
MQTT_USER="${MQTT_USER:?MQTT_USER is required}"
MQTT_PASS="${MQTT_PASS:?MQTT_PASS is required}"

AUTH_ENDPOINT="$EMQX_API/api/v5/authentication/password_based%3Abuilt_in_database/users"

echo "[emqx-init] Logging into EMQX Dashboard..."
TOKEN=$(curl -sf -X POST "$EMQX_API/api/v5/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"$DASH_USER\",\"password\":\"$DASH_PASS\"}" \
  | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')

if [ -z "$TOKEN" ]; then
  echo "[emqx-init] ERROR: Failed to login to EMQX Dashboard"
  exit 1
fi
echo "[emqx-init] Login successful."

# Check if user already exists
echo "[emqx-init] Checking if MQTT user '$MQTT_USER' exists..."
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" \
  "$AUTH_ENDPOINT/$MQTT_USER" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "[emqx-init] MQTT user '$MQTT_USER' already exists. Skipping."
  exit 0
fi

# Create user
echo "[emqx-init] Creating MQTT user '$MQTT_USER'..."
RESULT=$(curl -sf -X POST "$AUTH_ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"user_id\":\"$MQTT_USER\",\"password\":\"$MQTT_PASS\",\"is_superuser\":true}")

if echo "$RESULT" | grep -q "\"user_id\""; then
  echo "[emqx-init] MQTT user '$MQTT_USER' created successfully (superuser)."
else
  echo "[emqx-init] ERROR: Failed to create MQTT user. Response: $RESULT"
  exit 1
fi
