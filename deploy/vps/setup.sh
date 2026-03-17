#!/bin/bash
# ══════════════════════════════════════════
# Euro Smart Server – VPS Setup Script
# ══════════════════════════════════════════
# Tested on: Ubuntu 22.04, Ubuntu 24.04, Debian 12
#
# Usage:
#   chmod +x deploy/vps/setup.sh
#   sudo ./deploy/vps/setup.sh
#
set -euo pipefail

APP_DIR="/opt/euro-smart-server"
APP_USER="node"

echo "━━━ Euro Smart Server – VPS Setup ━━━"

# ── 1. System update ──
echo "[1/7] Updating system..."
apt-get update && apt-get upgrade -y

# ── 2. Install Node.js 22 LTS ──
echo "[2/7] Installing Node.js 22..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

# Enable Corepack for Yarn 4
corepack enable
corepack prepare yarn@4.9.2 --activate

# ── 3. Install Nginx ──
echo "[3/7] Installing Nginx..."
apt-get install -y nginx
systemctl enable nginx

# ── 4. Create app user ──
echo "[4/7] Creating app user..."
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/false --home "$APP_DIR" "$APP_USER"
fi

# ── 5. Setup application ──
echo "[5/7] Setting up application..."
if [ ! -d "$APP_DIR" ]; then
    mkdir -p "$APP_DIR"
    echo "⚠️  Clone your repo to $APP_DIR:"
    echo "    git clone <your-repo-url> $APP_DIR"
fi
mkdir -p "$APP_DIR/logs"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

# ── 6. Install systemd services ──
echo "[6/7] Installing systemd services..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
for SERVICE_FILE in "$SCRIPT_DIR"/euro-*.service; do
    if [ -f "$SERVICE_FILE" ]; then
        cp "$SERVICE_FILE" /etc/systemd/system/
        echo "  Installed: $(basename "$SERVICE_FILE")"
    fi
done
systemctl daemon-reload

# ── 7. Install Nginx config ──
echo "[7/7] Configuring Nginx..."
if [ -f "$SCRIPT_DIR/nginx.conf" ]; then
    cp "$SCRIPT_DIR/nginx.conf" /etc/nginx/sites-available/euro-smart
    ln -sf /etc/nginx/sites-available/euro-smart /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    nginx -t && systemctl reload nginx
fi

echo ""
echo "━━━ Setup Complete! ━━━"
echo ""
echo "Next steps:"
echo "  1. Clone repo:     git clone <url> $APP_DIR"
echo "  2. Setup env:      cp $APP_DIR/.env.example $APP_DIR/.env && nano $APP_DIR/.env"
echo "  3. Install deps:   cd $APP_DIR && yarn install --immutable"
echo "  4. Build:          yarn generate && yarn build"
echo "  5. Migrate DB:     yarn migrate:prod"
echo "  6. Start services:"
echo "     systemctl enable --now euro-core-api"
echo "     systemctl enable --now euro-socket-gateway"
echo "     systemctl enable --now euro-iot-gateway"
echo "     systemctl enable --now euro-worker-service"
echo "  7. Setup SSL:      certbot --nginx -d api.yourdomain.com -d ws.yourdomain.com"
echo ""
echo "Logs: journalctl -u euro-core-api -f"
