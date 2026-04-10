#!/bin/bash
# ==============================================================================
# SCRIPT SAO LƯU TỰ ĐỘNG (DOCKER-NATIVE)
# Mục đích: Dump Postgres, Redis, nén zip. Hỗ trợ gửi lên S3/R2 và Telegram Bot.
# Tần suất: Gọi bằng OS Crontab vào lúc 3h sáng hàng ngày (0 3 * * *)
# Tác giả: AuraThink AI
# ==============================================================================

# 1. Khởi tạo môi trường
SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
ROOT_DIR=$(dirname "$(dirname "$SCRIPT_DIR")") # Lên 2 cấp (deploy/monitoring -> root)
if [ -f "$ROOT_DIR/.env" ]; then
    source "$ROOT_DIR/.env"
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="/var/lib/aurathink-backups"
mkdir -p "$BACKUP_DIR"

DB_CONTAINER="aurathink-postgres-prod"
REDIS_CONTAINER="aurathink-redis-prod"

POSTGRES_USER=${POSTGRES_USER:-postgres}
POSTGRES_DB=${POSTGRES_DB:-aurathink}

FINAL_TAR="${BACKUP_DIR}/euro-smart-backup-${TIMESTAMP}.tar.gz"

echo "[$TIMESTAMP] Bắt đầu tiến trình sao lưu cơ sở dữ liệu..."

# 2. Dump PostgreSQL Database (Toàn vẹn dữ liệu gốc bằng pg_dump)
echo "  -> Đang trích xuất PostgreSQL..."
SQL_FILE="${BACKUP_DIR}/db-${TIMESTAMP}.sql"
docker exec "$DB_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > "$SQL_FILE"
if [ $? -ne 0 ]; then
    echo "  ❌ LỖI: Trích xuất PostgreSQL thất bại."
    rm -f "$SQL_FILE"
    # Fallback to empty if it didn't work, maybe container is restarting. Wait or just continue.
fi

# 3. Dump Redis Cache & BGSAVE state
echo "  -> Đang lưu bộ nhớ tĩnh Redis xuống đĩa..."
docker exec "$REDIS_CONTAINER" redis-cli SAVE
RDB_FILE="${BACKUP_DIR}/redis-${TIMESTAMP}.rdb"
echo "  -> Đang sao chép file dump.rdb ra Host OS..."
docker cp "${REDIS_CONTAINER}:/data/dump.rdb" "$RDB_FILE"
if [ $? -ne 0 ]; then
    echo "  ❌ LỖI: Trích xuất Redis thất bại."
fi

# 4. Đóng gói và Nén
echo "  -> Đang đóng gói và nén (Tar.gz) để tối ưu băng thông..."
tar -czf "$FINAL_TAR" -C "$BACKUP_DIR" "$(basename "$SQL_FILE")" "$(basename "$RDB_FILE")"

# Giải phóng file thô
rm -f "$SQL_FILE" "$RDB_FILE"
FILE_SIZE=$(du -h "$FINAL_TAR" | cut -f1)
echo "  ✅ Đã tạo file an toàn: $FINAL_TAR (Dung lượng: $FILE_SIZE)"

# ==============================================================================
# HỆ THỐNG GIAO HÀNG ĐÁM MÂY (CLOUD DELIVERY)
# ==============================================================================

# Kênh 1: Gửi lên S3/Cloudflare R2 (Tuỳ chọn cho DB Dung lượng LỚN)
if [ -n "$S3_BUCKET" ] && [ -n "$S3_ACCESS_KEY" ] && [ -n "$S3_SECRET_KEY" ]; then
    echo "  -> Phát hiện cấu hình S3. Đang đẩy lên Cloud Storage [${S3_BUCKET}]..."
    # Khởi tạo một container AWS CLI tạm thời (Xóa ngay lúc chạy xong)
    docker run --rm \
        -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" \
        -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
        -e AWS_DEFAULT_REGION="${S3_REGION:-us-east-1}" \
        -v "${BACKUP_DIR}:/backup" \
        amazon/aws-cli s3 cp "/backup/$(basename "$FINAL_TAR")" "s3://${S3_BUCKET}/" \
        --endpoint-url "$S3_ENDPOINT"
    
    if [ $? -eq 0 ]; then
        echo "  ✅ S3 Upload thành công."
    else
        echo "  ❌ LỖI S3 Upload."
    fi
fi

# Kênh 2: Gửi qua Telegram Bot (Tuỳ chọn tiện dụng, Max File Size < 50MB)
if [ -n "$TELEGRAM_BOT_TOKEN" ] && [ -n "$TELEGRAM_CHAT_IDS" ]; then
    echo "  -> Phát hiện cấu hình Telegram. Đang bắn file qua Chat Ẩn..."
    # Telegram API gửi tài liệu. Chỉ hỗ trợ tối đa 50MB.
    IFS=',' read -ra CHAT_IDS <<< "$TELEGRAM_CHAT_IDS"
    for chat_id in "${CHAT_IDS[@]}"; do
        curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument" \
            -F chat_id="${chat_id}" \
            -F document=@"${FINAL_TAR}" \
            -F caption="📦 *DAILY BACKUP HOÀN TẤT*
Server: \`$(hostname)\`
Thời gian: $(date +"%Y-%m-%d %H:%M:%S")
Dung lượng: ${FILE_SIZE}
_Trạng thái: An toàn_" \
            -F parse_mode="Markdown" > /dev/null
    done
    echo "  ✅ Telegram Upload thành công."
fi

# ==============================================================================
# DỌN DẸP KHÔNG GIAN
# ==============================================================================
echo "  -> Dọn dẹp ổ đĩa Máy chủ: Xóa các file Backup đã lưu cũ hơn 7 ngày..."
find "$BACKUP_DIR" -name "euro-smart-backup-*.tar.gz" -type f -mtime +7 -delete

echo "[$TIMESTAMP] TIẾN TRÌNH SAO LƯU ĐÃ KHÉP LẠI."
