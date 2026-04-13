#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# SENSA-SMART SERVER - AUTOMATED DEPLOYMENT BOOTSTRAP (SA-GRADE)
# ══════════════════════════════════════════════════════════════════
# Script này dành cho Server Ubuntu trắng tinh. Chỉ cần chạy 1 lần.
# Các bước thực hiện:
# 1. Cài đặt Docker & Docker Compose (nếu chưa có).
# 2. Sinh tự động file .env với các secret keys siêu mạnh.
# 3. Yêu cầu nhập Domain & tự động sinh chứng chỉ Let's Encrypt (SSL).
# 4. Mix chứng chỉ cho HAProxy/EMQX.
# 5. Boot database migrations.
# 6. Boot toàn bộ Container.
# 7. Tự động bơm MQTT Root User vào EMQX Database.
# ══════════════════════════════════════════════════════════════════

set -e # Dừng script nếu có lỗi bấtt kỳ

# Màu sắc cảnh báo
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log() { echo -e "${BLUE}[SETUP]${NC} $1"; }
success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Kiểm tra quyền root
if [ "$EUID" -ne 0 ]; then
  error "Vui lòng chạy script với quyền root! (sudo ./setup-server.sh)"
fi

# ────────────────────────────────────────────────────────
# BƯỚC 1: Cài đặt Docker & Core tools
# ────────────────────────────────────────────────────────
log "1. Kiểm tra môi trường hệ thống..."
apt-get update -y > /dev/null 2>&1
apt-get install -y curl git jq openssl > /dev/null 2>&1

if ! command -v docker &> /dev/null; then
    log "Đang cài đặt Docker và Docker Compose Plugin..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    success "Docker đã được cài đặt xong!"
else
    success "Docker đã có sẵn."
fi

# ────────────────────────────────────────────────────────
# BƯỚC 2: Cấu hình file .env
# ────────────────────────────────────────────────────────
log "2. Thiết lập môi trường rỗng (.env)..."
if [ ! -f .env ]; then
    cp .env.example .env
    
    # Auto gen secrets
    sed -i "s/AUTH_ACCESS_TOKEN_SECRET=.*/AUTH_ACCESS_TOKEN_SECRET=\"$(openssl rand -base64 32)\"/" .env
    sed -i "s/AUTH_REFRESH_TOKEN_SECRET=.*/AUTH_REFRESH_TOKEN_SECRET=\"$(openssl rand -base64 32)\"/" .env
    sed -i "s/APP_MQTT_SECRET=.*/APP_MQTT_SECRET=\"$(openssl rand -base64 32)\"/" .env
    
    # Auto gen DB Passwords
    RANDOM_DB_PASS=$(openssl rand -base64 16)
    RANDOM_REDIS_PASS=$(openssl rand -base64 16)
    RANDOM_MQTT_PASS=$(openssl rand -base64 16)
    
    sed -i "s/POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=\"$RANDOM_DB_PASS\"/" .env
    sed -i "s/DATABASE_URL=.*/DATABASE_URL=\"postgresql:\/\/postgres:$RANDOM_DB_PASS@postgres:5432\/sensa_smart?schema=public\"/" .env
    
    sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=\"$RANDOM_REDIS_PASS\"/" .env
    sed -i "s/MQTT_PASS=.*/MQTT_PASS=\"$RANDOM_MQTT_PASS\"/" .env
    sed -i "s/EMQX_DASHBOARD_PASS=.*/EMQX_DASHBOARD_PASS=\"$RANDOM_MQTT_PASS\"/" .env

    success "File .env đã được tạo tự động với Secret an toàn tuyệt đối!"
    log "Mật khẩu CSDL/Redis/MQTT đã được gen ngẫu nhiên. Vui lòng giữ kín file .env."
else
    warn "File .env đã tồn tại, bỏ qua bước sinh file."
fi

# ────────────────────────────────────────────────────────
# BƯỚC 3: Yêu cầu thông tin Domain & Fix SSL Chicken-Egg
# ────────────────────────────────────────────────────────
log "3. Xử lý bài toán Domain & HTTPS SSL"
read -p "Nhập Domain của bạn (ex: sensasmart.ddns.net): " APP_DOMAIN
read -p "Nhập Email của bạn (để Let's encrypt báo hạn): " APP_EMAIL

if [ -z "$APP_DOMAIN" ] || [ -z "$APP_EMAIL" ]; then
    error "Domain và Email không được để trống!"
fi


# Cập nhật Domain vào file deploy/docker/nginx.conf nếu cần
log "Ép Domain vào config Nginx..."
sed -i "s/server_name .*/server_name $APP_DOMAIN;/g" deploy/docker/nginx.conf
sed -i "s/APP_CORS_ORIGINS=.*/APP_CORS_ORIGINS=\"https:\/\/$APP_DOMAIN,https:\/\/app.$APP_DOMAIN\"/" .env
sed -i "s/MQTT_WSS_URL=.*/MQTT_WSS_URL=\"wss:\/\/$APP_DOMAIN\/mqtt\"/" .env

log "Kiểm tra SSL cho $APP_DOMAIN..."
SSL_DIR="./deploy/docker/ssl"
mkdir -p "$SSL_DIR"

if [ ! -f "$SSL_DIR/fullchain.pem" ]; then
    warn "Chưa có chứng chỉ SSL. Hệ thống Nginx sẽ Crash nếu cố gắng chạy!"
    log "Tiến hành Spin-up Certbot Standalone để lấy cấp cứu chứng chỉ..."
    
    # Kiểm tra cổng 80 có trống không
    if lsof -Pi :80 -sTCP:LISTEN -t >/dev/null ; then
        error "Cổng 80 đang bị chiếm dụng. Vui lòng tắt các Webserver khác (Nginx/Apache) trước khi Setup SSL!"
    fi

    log "Đang request SSL từ Let's Encrypt (Quy trình này sẽ mất vài phút)..."
    docker run -it --rm --name certbot \
        -v "$PWD/deploy/docker/ssl-data:/etc/letsencrypt" \
        -p 80:80 \
        certbot/certbot certonly --standalone \
        --non-interactive --agree-tos -m "$APP_EMAIL" -d "$APP_DOMAIN"
    
    log "Trích xuất chứng chỉ từ /etc/letsencrypt sang ./deploy/docker/ssl..."
    cp deploy/docker/ssl-data/live/$APP_DOMAIN/fullchain.pem $SSL_DIR/
    cp deploy/docker/ssl-data/live/$APP_DOMAIN/privkey.pem $SSL_DIR/
    
    # Gộp chứng chỉ cho HAProxy/EMQX
    cat $SSL_DIR/fullchain.pem $SSL_DIR/privkey.pem > $SSL_DIR/mqtt.pem
    chmod 644 $SSL_DIR/mqtt.pem
    
    success "Cấu hình SSL tự động Hoàn tất!"
else
    success "Chứng chỉ SSL đã có sẵn, bỏ qua Let's Encrypt!"
fi

# ────────────────────────────────────────────────────────
# BƯỚC 4: Boot Database & Migrate
# ────────────────────────────────────────────────────────
log "4. Khởi động vòng 1: DB Migration (Tạo Bảng, Hypertable)..."
docker compose -f docker-compose.prod.yml up -d postgres redis
log "Chờ PostgreSQL sẵn sàng (15s)..."
sleep 15

log "Chạy Prisma Migrate..."
docker compose -f docker-compose.prod.yml up migrate
success "Database migrate xong!"

# ────────────────────────────────────────────────────────
# BƯỚC 5: Lên toành bộ hệ thống Server
# ────────────────────────────────────────────────────────
log "5. Boot toàn bộ Container (Nginx, API, Worker, EMQX)..."
docker compose -f docker-compose.prod.yml up -d

log "Chờ EMQX khởi động hoàn tất (20s)..."
sleep 20

# ────────────────────────────────────────────────────────
# BƯỚC 6: Bơm Root User vào EMQX Mqtt
# ────────────────────────────────────────────────────────
log "6. Bơm cấu hình Mqtt Authentication (API Call vào EMQX)..."
source .env
export EMQX_API_URL="http://127.0.0.1:18083" # Gọi qua localhost hoặc IP vps
export DASH_USER="${EMQX_DASHBOARD_USER:-admin}"
export DASH_PASS="$EMQX_DASHBOARD_PASS"
export MQTT_USER="$MQTT_USER"
export MQTT_PASS="$MQTT_PASS"

# Chạy file bash inject theo cơ chế Docker Exec nếu cần, 
# hoặc chạy lệnh curl thẳng vào emqx container (vì port 18083 đang mở trên host).
sh ./deploy/docker/init-emqx-auth.sh || warn "Có lỗi khi chạy init-emqx-auth.sh, hãy kiểm tra tay sau (có thể nó đã up từ trước)."

# ────────────────────────────────────────────────────────
# BƯỚC 7: Cài đặt System Monitoring & Alerting
# ────────────────────────────────────────────────────────
log "7. Cài đặt hệ thống giám sát sức khoẻ Server..."

# Tạo thư mục lưu trạng thái (persistent qua reboot)
mkdir -p /var/lib/sensa-smart-monitor

# Cấp quyền chạy cho script giám sát
chmod +x "$PWD/deploy/monitoring/server-health.sh"

# Cài đặt Crontab tự động (chạy mỗi 3 phút)
MONITOR_SCRIPT="$PWD/deploy/monitoring/server-health.sh"
CRON_JOB="*/3 * * * * /bin/bash $MONITOR_SCRIPT >> /var/log/sensa-smart-monitor-cron.log 2>&1"

# Kiểm tra nếu crontab chưa có dòng này thì mới thêm (idempotent)
(crontab -l 2>/dev/null | grep -qF "server-health.sh") || \
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

# Cài đặt logrotate cho file log giám sát
cp "$PWD/deploy/monitoring/logrotate-monitor.conf" /etc/logrotate.d/sensa-smart-monitor 2>/dev/null || true

success "Hệ thống Monitoring đã được cài đặt! Cảnh báo sẽ chạy mỗi 3 phút."
warn "Nhớ cấu hình TELEGRAM_BOT_TOKEN và TELEGRAM_CHAT_IDS trong file .env để nhận cảnh báo!"

# ────────────────────────────────────────────────────────
# BƯỚC 8: Cài đặt Daily Automated Backup
# ────────────────────────────────────────────────────────
log "8. Cài đặt hệ thống tự động Sao lưu (Backup) CSDL hằng đêm..."

# Cấp quyền chạy cho script backup
chmod +x "$PWD/deploy/monitoring/daily-backup.sh"

# Cài đặt Crontab tự động (chạy vào 03:00 sáng mỗi ngày)
BACKUP_SCRIPT="$PWD/deploy/monitoring/daily-backup.sh"
BACKUP_CRON="0 3 * * * /bin/bash $BACKUP_SCRIPT >> /var/log/sensa-smart-backup-cron.log 2>&1"

# Kiểm tra nếu crontab chưa có dòng này thì mới thêm
(crontab -l 2>/dev/null | grep -qF "daily-backup.sh") || \
    (crontab -l 2>/dev/null; echo "$BACKUP_CRON") | crontab -

success "Hệ thống Backup đã được cài đặt! Sẽ tự động chạy vào 3:00 AM hàng ngày."

success "Hệ thống Sensa-Smart Server đã sẵn sàng phục vụ!"
log "------------------------------------------------------"
log "✅ Nginx HTTPS: https://$APP_DOMAIN"
log "✅ EMQX Dashboard: http://[Server_IP]:18083 (Tài khoản: $DASH_USER / $DASH_PASS)"
log "✅ EMQX Mqtt: mqtts (Port 8883) & wss (Port 443 -> /mqtt)"
log "✅ Monitoring: Crontab */3 * * * * (Telegram + Email)"
log "✅ Backup: Crontab 0 3 * * * (S3 / Telegram)"
log "✅ Kiểm tra trạng thái: docker ps"
log "------------------------------------------------------"

