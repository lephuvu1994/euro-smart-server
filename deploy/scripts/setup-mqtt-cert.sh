#!/bin/bash
# ══════════════════════════════════════════════════════════════
# setup-mqtt-cert.sh — Tạo mqtt.pem cho HAProxy MQTTS 8883
# Chạy trên VPS2 (Mặt tiền) nơi HAProxy sẽ hoạt động
# ══════════════════════════════════════════════════════════════
set -e

DOMAIN="sensasmart.ddns.net"
CERT_DIR="/etc/letsencrypt/live/$DOMAIN"
SSL_DIR="/root/sensa-smart-server/deploy/docker/ssl"
PEM_FILE="$SSL_DIR/mqtt.pem"

echo "==> Checking Let's Encrypt cert for $DOMAIN..."

if [ ! -d "$CERT_DIR" ]; then
  echo "❌ Cert not found at $CERT_DIR"
  echo "   Run: certbot certonly --standalone -d $DOMAIN"
  echo "   Or:  certbot --nginx -d $DOMAIN"
  exit 1
fi

echo "==> Creating $PEM_FILE..."
mkdir -p "$SSL_DIR"
cat "$CERT_DIR/fullchain.pem" "$CERT_DIR/privkey.pem" > "$PEM_FILE"
chmod 600 "$PEM_FILE"
echo "✅ mqtt.pem created: $(ls -la $PEM_FILE)"

# ─────────────────────────────────────
# Setup auto-renew cron job
# ─────────────────────────────────────
CRON_FILE="/etc/cron.d/renew-mqtt-cert"

cat > "$CRON_FILE" << 'EOF'
# Auto-renew Let's Encrypt + update HAProxy mqtt.pem
0 3 * * * root certbot renew --quiet --deploy-hook "\
  cat /etc/letsencrypt/live/sensasmart.ddns.net/fullchain.pem \
      /etc/letsencrypt/live/sensasmart.ddns.net/privkey.pem \
  > /root/sensa-smart-server/deploy/docker/ssl/mqtt.pem && \
  docker restart sensa-smart-haproxy-prod 2>/dev/null || true"
EOF

chmod 644 "$CRON_FILE"
echo "✅ Auto-renew cron job installed: $CRON_FILE"
echo ""
echo "Done! HAProxy can now use MQTTS on port 8883"
echo "Test: mosquitto_pub -h $DOMAIN -p 8883 --cafile /etc/ssl/certs/ca-certificates.crt -t test -m hello"
