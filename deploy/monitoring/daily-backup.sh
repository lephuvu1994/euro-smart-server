#!/bin/bash
# ==============================================================================
# SCRIPT SAO LƯU TỰ ĐỘNG (DOCKER-NATIVE)
# Mục đích: Dump Postgres + Redis, nén tar.gz, đẩy lên cả Cloudflare R2 và Telegram.
# Tần suất: Gọi bằng OS Crontab vào lúc 3h sáng hàng ngày (0 3 * * *)
#
# Luồng hoạt động:
#   1. Dump PostgreSQL → file .sql
#   2. Dump Redis RDB → file .rdb
#   3. Nén gộp → euro-smart-backup-{timestamp}.tar.gz
#   4. Upload lên Cloudflare R2 / S3 (nếu có key)
#   5. Upload qua Telegram Bot (nếu có token, file < 50MB)
#   6. Dọn dẹp backup cũ > 7 ngày trên ổ cục bộ
#
# Biến môi trường (đọc từ .env):
#   - TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_IDS → gửi Telegram
#   - S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT, S3_REGION → gửi R2/S3
#   - POSTGRES_USER, POSTGRES_DB, REDIS_PASSWORD → truy cập DB
# ==============================================================================

set -euo pipefail

# ────────────────────────────────────────────────
# 1. KHỞI TẠO MÔI TRƯỜNG
# ────────────────────────────────────────────────
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
ROOT_DIR=$(dirname "$(dirname "$SCRIPT_DIR")") # Lên 2 cấp (deploy/monitoring -> root)

# Parse .env an toàn — tránh crash khi có dòng lỗi cú pháp (ví dụ MAIL_FROM chứa dấu <>)
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # Chỉ lấy các dòng có dạng KEY=VALUE, bỏ qua comment và dòng trống
    eval "$(grep -E '^[A-Za-z_][A-Za-z0-9_]*=' "$ROOT_DIR/.env" | sed 's/\r$//')" 2>/dev/null || true
    set +a
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/lib/aurathink-backups"
mkdir -p "$BACKUP_DIR"

# Tên container Docker (khớp với docker-compose.prod.yml)
DB_CONTAINER="aurathink-postgres-prod"
REDIS_CONTAINER="aurathink-redis-prod"

POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-aurathink}"

FINAL_TAR="${BACKUP_DIR}/euro-smart-backup-${TIMESTAMP}.tar.gz"

log() { echo "[$(date +%H:%M:%S)] $*"; }

log "═══ BẮT ĐẦU TIẾN TRÌNH SAO LƯU CƠ SỞ DỮ LIỆU ═══"

# ────────────────────────────────────────────────
# 2. DUMP POSTGRESQL
# ────────────────────────────────────────────────
log "  → Đang trích xuất PostgreSQL (${POSTGRES_DB})..."
SQL_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.sql"
if docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" --no-owner --no-acl "$POSTGRES_DB" > "$SQL_FILE" 2>/dev/null; then
    SQL_SIZE=$(du -h "$SQL_FILE" | cut -f1)
    log "  ✅ PostgreSQL dump thành công (${SQL_SIZE})"
else
    log "  ❌ PostgreSQL dump thất bại — container có thể đang restart"
    rm -f "$SQL_FILE"
fi

# ────────────────────────────────────────────────
# 3. DUMP REDIS (BGSAVE + COPY)
# ────────────────────────────────────────────────
log "  → Đang lưu bộ nhớ Redis xuống đĩa..."
RDB_FILE="${BACKUP_DIR}/redis-${TIMESTAMP}.rdb"
if [ -n "${REDIS_PASSWORD:-}" ]; then
    docker exec "$REDIS_CONTAINER" redis-cli -a "$REDIS_PASSWORD" SAVE >/dev/null 2>&1
else
    docker exec "$REDIS_CONTAINER" redis-cli SAVE >/dev/null 2>&1
fi

if docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "$RDB_FILE" 2>/dev/null; then
    RDB_SIZE=$(du -h "$RDB_FILE" | cut -f1)
    log "  ✅ Redis dump thành công (${RDB_SIZE})"
else
    log "  ❌ Redis dump thất bại"
    rm -f "$RDB_FILE"
fi

# ────────────────────────────────────────────────
# 4. ĐÓNG GÓI VÀ NÉN
# ────────────────────────────────────────────────
# Gom danh sách file thực sự tồn tại
FILES_TO_PACK=()
[ -f "$SQL_FILE" ] && FILES_TO_PACK+=("$(basename "$SQL_FILE")")
[ -f "$RDB_FILE" ] && FILES_TO_PACK+=("$(basename "$RDB_FILE")")

if [ ${#FILES_TO_PACK[@]} -eq 0 ]; then
    log "  ❌ Không có file nào để đóng gói. Dừng backup."
    exit 1
fi

log "  → Đang đóng gói và nén (${#FILES_TO_PACK[@]} files)..."
tar -czf "$FINAL_TAR" -C "$BACKUP_DIR" "${FILES_TO_PACK[@]}"

# Giải phóng file thô
rm -f "$SQL_FILE" "$RDB_FILE"
FILE_SIZE=$(du -h "$FINAL_TAR" | cut -f1)
FILE_SIZE_BYTES=$(stat -c%s "$FINAL_TAR" 2>/dev/null || stat -f%z "$FINAL_TAR" 2>/dev/null || echo "0")
log "  ✅ Đã tạo: $FINAL_TAR (${FILE_SIZE})"

# ────────────────────────────────────────────────
# 5. UPLOAD LÊN CLOUDFLARE R2 / S3
# ────────────────────────────────────────────────
# Mặc định sẽ cố gắng đẩy lên R2/S3 trước.
# Nếu chưa có key (S3_ACCESS_KEY trống) thì bỏ qua, chờ sếp add key rồi redeploy.
S3_UPLOADED=false
if [ -n "${S3_BUCKET:-}" ] && [ -n "${S3_ACCESS_KEY:-}" ] && [ -n "${S3_SECRET_KEY:-}" ] && [ -n "${S3_ENDPOINT:-}" ]; then
    log "  → [R2/S3] Đang upload lên bucket: ${S3_BUCKET}..."
    if docker run --rm \
        -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
        -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
        -e AWS_DEFAULT_REGION="${S3_REGION:-auto}" \
        -v "${BACKUP_DIR}:/backup:ro" \
        amazon/aws-cli s3 cp "/backup/$(basename "$FINAL_TAR")" "s3://${S3_BUCKET}/" \
        --endpoint-url "$S3_ENDPOINT" 2>&1; then
        log "  ✅ [R2/S3] Upload thành công."
        S3_UPLOADED=true
    else
        log "  ❌ [R2/S3] Upload thất bại — kiểm tra key hoặc endpoint."
    fi
else
    log "  ⏭️  [R2/S3] Chưa cấu hình (S3_ACCESS_KEY trống). Bỏ qua."
fi

# ────────────────────────────────────────────────
# 6. UPLOAD QUA TELEGRAM BOT
# ────────────────────────────────────────────────
# Luôn gửi song song với R2/S3 để sếp có bản trên điện thoại (nếu file < 50MB).
TELEGRAM_UPLOADED=false
MAX_TELEGRAM_SIZE=$((50 * 1024 * 1024))  # 50MB

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_IDS:-}" ]; then
    if [ "$FILE_SIZE_BYTES" -le "$MAX_TELEGRAM_SIZE" ]; then
        log "  → [Telegram] Đang gửi file backup (${FILE_SIZE})..."

        # Xác định trạng thái R2/S3 để hiển thị trong caption
        S3_STATUS="❌ Chưa cấu hình"
        [ "$S3_UPLOADED" = true ] && S3_STATUS="✅ Đã lưu"

        IFS=',' read -ra CHAT_IDS <<< "$TELEGRAM_CHAT_IDS"
        for chat_id in "${CHAT_IDS[@]}"; do
            curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
                -F chat_id="${chat_id}" \
                -F document=@"${FINAL_TAR}" \
                -F caption="📦 *DAILY BACKUP HOÀN TẤT*
Server: \`$(hostname)\`
Thời gian: $(date +"%Y-%m-%d %H:%M:%S")
Dung lượng: ${FILE_SIZE}
Cloudflare R2: ${S3_STATUS}
_Trạng thái: An toàn_" \
                -F parse_mode="Markdown" > /dev/null 2>&1
        done
        log "  ✅ [Telegram] Upload thành công."
        TELEGRAM_UPLOADED=true
    else
        log "  ⚠️  [Telegram] File quá lớn (${FILE_SIZE} > 50MB). Bỏ qua Telegram."

        # Gửi tin nhắn cảnh báo thay vì file
        if [ -n "${TELEGRAM_CHAT_IDS:-}" ]; then
            IFS=',' read -ra CHAT_IDS <<< "$TELEGRAM_CHAT_IDS"
            for chat_id in "${CHAT_IDS[@]}"; do
                curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
                    -d chat_id="${chat_id}" \
                    -d parse_mode="Markdown" \
                    -d text="⚠️ *BACKUP QUÁ LỚN*
Server: \`$(hostname)\`
File: ${FILE_SIZE} — vượt giới hạn 50MB của Telegram.
Cloudflare R2: $([ "$S3_UPLOADED" = true ] && echo '✅ Đã lưu' || echo '❌ Cần cấu hình ngay!')" \
                    > /dev/null 2>&1
            done
        fi
    fi
else
    log "  ⏭️  [Telegram] Chưa cấu hình. Bỏ qua."
fi

# ────────────────────────────────────────────────
# 7. KẾT QUẢ & DỌN DẸP
# ────────────────────────────────────────────────
# Cảnh báo nếu không kênh nào thành công
if [ "$S3_UPLOADED" = false ] && [ "$TELEGRAM_UPLOADED" = false ]; then
    log "  🚨 CẢNH BÁO: Backup đã tạo nhưng KHÔNG được gửi đi đâu cả!"
    log "     → File nằm tại ổ cục bộ: $FINAL_TAR"
    log "     → Cấu hình ít nhất 1 kênh trong .env (TELEGRAM_BOT_TOKEN hoặc S3_ACCESS_KEY)"
fi

log "  → Dọn dẹp: Xóa backup cục bộ cũ hơn 7 ngày..."
find "$BACKUP_DIR" -name "euro-smart-backup-*.tar.gz" -type f -mtime +7 -delete

log "═══ TIẾN TRÌNH SAO LƯU ĐÃ KHÉP LẠI ═══"
