#!/bin/bash
# ══════════════════════════════════════════════════════════════════
# AURATHINK — System Health Monitor (SA-Grade)
# ══════════════════════════════════════════════════════════════════
# Chạy bằng Crontab mỗi 3 phút: */3 * * * * /path/to/server-health.sh
#
# Chức năng:
#   1. Đo CPU, RAM, Disk, Swap
#   2. Kiểm tra Docker containers + Health endpoint
#   3. Chống nhiễu: Strike counter (3 lần liên tiếp mới báo)
#   4. Cooldown: 30 phút mỗi loại metric
#   5. Recovery notification khi metric hồi phục
#   6. Auto-restart container bị sập (tối đa 2 lần/giờ)
#   7. Audit log + logrotate
#   8. Bắn đồng thời Telegram + Email (nhiều người nhận)
# ══════════════════════════════════════════════════════════════════

set -euo pipefail

# ────────────────────────────────────────────────
# CẤU HÌNH
# ────────────────────────────────────────────────

# Đường dẫn tới thư mục gốc dự án (chứa .env)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Nạp biến môi trường từ .env
if [ -f "$PROJECT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_DIR/.env"
    set +a
fi

# Thư mục lưu trạng thái (persistent qua reboot)
STATE_DIR="/var/lib/aurathink-monitor"
mkdir -p "$STATE_DIR"

# File log
LOG_FILE="/var/log/aurathink-monitor.log"

# Ngưỡng cảnh báo
CPU_WARN=85
CPU_CRIT=95
RAM_WARN=85
RAM_CRIT=95
DISK_WARN=80
DISK_CRIT=90
SWAP_WARN=50
SWAP_CRIT=80

# Strike: cần vượt ngưỡng N lần liên tiếp mới báo động
STRIKE_THRESHOLD=3

# Cooldown: sau khi gửi alert, chờ N giây trước khi gửi lại (30 phút)
COOLDOWN_SECONDS=1800

# Auto-restart: tối đa N lần restart mỗi container trong 1 giờ
MAX_RESTARTS_PER_HOUR=2

# Danh sách Docker containers cần giám sát
CONTAINERS=(
    "aurathink-postgres-prod"
    "aurathink-redis-prod"
    "aurathink-emqx-prod"
    "aurathink-core-api-prod"
    "aurathink-iot-gateway-prod"
    "aurathink-worker-service-prod"
    "euro-nginx-prod"
)

# Health endpoint — probe trực tiếp bên trong container core-api (best practice: không phụ thuộc Nginx)
HEALTH_CONTAINER="aurathink-core-api-prod"
HEALTH_PATH="/health"

# Hostname để phân biệt máy chủ trong alert
HOSTNAME=$(hostname)
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ────────────────────────────────────────────────
# HÀM THU THẬP METRICS
# ────────────────────────────────────────────────

get_cpu_usage() {
    # Lấy %CPU idle rồi trừ đi 100 để ra %CPU used
    top -bn1 | grep "Cpu(s)" | awk '{print 100 - $8}' | cut -d. -f1
}

get_ram_usage() {
    free -m | awk '/^Mem:/ {printf "%d", ($3/$2)*100}'
}

get_disk_usage() {
    df -h / | awk 'NR==2 {print $5}' | tr -d '%'
}

get_swap_usage() {
    local total used
    total=$(free -m | awk '/^Swap:/ {print $2}')
    used=$(free -m | awk '/^Swap:/ {print $3}')
    if [ "$total" -eq 0 ] 2>/dev/null; then
        echo "0"
    else
        echo "$((used * 100 / total))"
    fi
}

# ────────────────────────────────────────────────
# HÀM DOCKER HEALTH CHECK
# ────────────────────────────────────────────────

check_containers() {
    local down_list=""
    for container in "${CONTAINERS[@]}"; do
        local status
        status=$(docker inspect --format='{{.State.Status}}' "$container" 2>/dev/null || echo "not_found")
        if [ "$status" != "running" ]; then
            down_list="${down_list}${container}($status),"
        fi
    done
    # Xóa dấu phẩy cuối
    echo "${down_list%,}"
}

check_health_endpoint() {
    # Probe trực tiếp bên trong container bằng docker exec — không qua Nginx
    # Dùng wget (có sẵn trong Alpine/Node image) thay vì curl
    local http_code
    http_code=$(docker exec "$HEALTH_CONTAINER" wget --spider -q -S "http://127.0.0.1:${HTTP_PORT:-3001}${HEALTH_PATH}" 2>&1 | awk '/HTTP\// {print $2}' | tail -1)
    echo "${http_code:-000}"
}

# ────────────────────────────────────────────────
# HÀM STRIKE COUNTER & COOLDOWN
# ────────────────────────────────────────────────

# Tăng strike counter, trả về giá trị mới
increment_strike() {
    local metric="$1"
    local file="$STATE_DIR/strike_${metric}"
    local count=0
    [ -f "$file" ] && count=$(cat "$file")
    count=$((count + 1))
    echo "$count" > "$file"
    echo "$count"
}

# Reset strike counter về 0
reset_strike() {
    local metric="$1"
    echo "0" > "$STATE_DIR/strike_${metric}"
}

# Kiểm tra đã từng gửi alert (dùng cho recovery)
was_alerted() {
    local metric="$1"
    [ -f "$STATE_DIR/alerted_${metric}" ]
}

# Đánh dấu đã gửi alert
mark_alerted() {
    local metric="$1"
    touch "$STATE_DIR/alerted_${metric}"
}

# Xóa đánh dấu alert (khi recovery)
clear_alerted() {
    local metric="$1"
    rm -f "$STATE_DIR/alerted_${metric}"
}

# Kiểm tra cooldown còn hiệu lực không
is_cooldown_active() {
    local metric="$1"
    local file="$STATE_DIR/cooldown_${metric}"
    if [ -f "$file" ]; then
        local last_sent
        last_sent=$(cat "$file")
        local now
        now=$(date +%s)
        if [ $((now - last_sent)) -lt $COOLDOWN_SECONDS ]; then
            return 0  # true — đang cooldown
        fi
    fi
    return 1  # false — hết cooldown
}

# Bật cooldown
set_cooldown() {
    local metric="$1"
    date +%s > "$STATE_DIR/cooldown_${metric}"
}

# ────────────────────────────────────────────────
# HÀM AUTO-RESTART CONTAINER
# ────────────────────────────────────────────────

try_restart_container() {
    local container="$1"
    local restart_log="$STATE_DIR/restart_${container}"
    local now
    now=$(date +%s)

    # Đếm số lần restart trong giờ qua
    local count=0
    if [ -f "$restart_log" ]; then
        # Đọc các timestamp, chỉ đếm trong 3600 giây gần nhất
        while IFS= read -r ts; do
            if [ $((now - ts)) -lt 3600 ]; then
                count=$((count + 1))
            fi
        done < "$restart_log"
    fi

    if [ "$count" -ge "$MAX_RESTARTS_PER_HOUR" ]; then
        echo "EXCEEDED"
        return
    fi

    # Thực hiện restart
    docker restart "$container" >/dev/null 2>&1
    echo "$now" >> "$restart_log"

    # Dọn dẹp entry cũ hơn 1 giờ
    local tmp_file="${restart_log}.tmp"
    while IFS= read -r ts; do
        if [ $((now - ts)) -lt 3600 ]; then
            echo "$ts"
        fi
    done < "$restart_log" > "$tmp_file"
    mv "$tmp_file" "$restart_log"

    echo "OK"
}

# ────────────────────────────────────────────────
# HÀM GỬI CẢNH BÁO (SONG SONG 2 KÊNH)
# ────────────────────────────────────────────────

send_telegram() {
    local message="$1"
    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_IDS:-}" ]; then
        return
    fi

    # Loop qua từng Chat ID (phân tách bằng dấu phẩy)
    IFS=',' read -ra IDS <<< "$TELEGRAM_CHAT_IDS"
    for chat_id in "${IDS[@]}"; do
        chat_id=$(echo "$chat_id" | xargs)  # Trim whitespace
        curl -sf -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
            -d "chat_id=${chat_id}" \
            -d "text=${message}" \
            -d "parse_mode=Markdown" \
            --max-time 10 >/dev/null 2>&1 &
    done
}

send_email() {
    local subject="$1"
    local body="$2"
    if [ -z "${MAIL_HOST:-}" ] || [ -z "${ALERT_EMAILS:-}" ]; then
        return
    fi

    # Gọi Python script gửi email
    python3 "$SCRIPT_DIR/send_alert.py" \
        --host "${MAIL_HOST}" \
        --port "${MAIL_PORT:-587}" \
        --user "${MAIL_USER}" \
        --password "${MAIL_PASSWORD}" \
        --from "${MAIL_FROM:-$MAIL_USER}" \
        --to "${ALERT_EMAILS}" \
        --subject "$subject" \
        --body "$body" &
}

send_alert() {
    local level="$1"    # WARNING hoặc CRITICAL
    local subject="$2"
    local details="$3"

    local emoji="⚠️"
    [ "$level" = "CRITICAL" ] && emoji="🚨"

    local tg_msg="${emoji} *[${level}] ${HOSTNAME}*
${subject}

\`\`\`
${details}
\`\`\`
🕐 ${TIMESTAMP}"

    local email_subject="[${level}] ${HOSTNAME} — ${subject}"

    # Bắn đồng thời cả 2 kênh
    send_telegram "$tg_msg"
    send_email "$email_subject" "$details"
}

send_recovery() {
    local subject="$1"
    local details="$2"

    local tg_msg="✅ *[RECOVERY] ${HOSTNAME}*
${subject}

\`\`\`
${details}
\`\`\`
🕐 ${TIMESTAMP}"

    local email_subject="[RECOVERY] ${HOSTNAME} — ${subject}"

    send_telegram "$tg_msg"
    send_email "$email_subject" "$details"
}

# ────────────────────────────────────────────────
# HÀM XỬ LÝ METRIC (LOGIC TRUNG TÂM)
# ────────────────────────────────────────────────

# Xử lý 1 metric: tăng strike nếu vượt ngưỡng, gửi alert nếu đủ strike, gửi recovery nếu hồi phục
process_metric() {
    local metric_name="$1"
    local value="$2"
    local warn_threshold="$3"
    local crit_threshold="$4"

    if [ "$value" -ge "$crit_threshold" ]; then
        local strikes
        strikes=$(increment_strike "$metric_name")
        if [ "$strikes" -ge "$STRIKE_THRESHOLD" ]; then
            if ! is_cooldown_active "$metric_name"; then
                send_alert "CRITICAL" "${metric_name} = ${value}% (ngưỡng CRITICAL: ${crit_threshold}%)" \
                    "Metric: ${metric_name}\nGiá trị hiện tại: ${value}%\nNgưỡng WARNING: ${warn_threshold}%\nNgưỡng CRITICAL: ${crit_threshold}%\nStrike: ${strikes}/${STRIKE_THRESHOLD}\nServer: ${HOSTNAME}"
                set_cooldown "$metric_name"
                mark_alerted "$metric_name"
            fi
        fi
    elif [ "$value" -ge "$warn_threshold" ]; then
        local strikes
        strikes=$(increment_strike "$metric_name")
        if [ "$strikes" -ge "$STRIKE_THRESHOLD" ]; then
            if ! is_cooldown_active "$metric_name"; then
                send_alert "WARNING" "${metric_name} = ${value}% (ngưỡng WARNING: ${warn_threshold}%)" \
                    "Metric: ${metric_name}\nGiá trị hiện tại: ${value}%\nNgưỡng WARNING: ${warn_threshold}%\nNgưỡng CRITICAL: ${crit_threshold}%\nStrike: ${strikes}/${STRIKE_THRESHOLD}\nServer: ${HOSTNAME}"
                set_cooldown "$metric_name"
                mark_alerted "$metric_name"
            fi
        fi
    else
        # Metric bình thường — reset strike
        reset_strike "$metric_name"

        # Gửi Recovery nếu trước đó đã từng alert
        if was_alerted "$metric_name"; then
            send_recovery "${metric_name} đã hồi phục (${value}%)" \
                "Metric: ${metric_name}\nGiá trị hiện tại: ${value}%\nNgưỡng an toàn: < ${warn_threshold}%\nServer: ${HOSTNAME}"
            clear_alerted "$metric_name"
        fi
    fi
}

# ────────────────────────────────────────────────
# MAIN — CHẠY CHÍNH
# ────────────────────────────────────────────────

main() {
    # 1. Thu thập metrics
    local cpu ram disk swap
    cpu=$(get_cpu_usage)
    ram=$(get_ram_usage)
    disk=$(get_disk_usage)
    swap=$(get_swap_usage)

    # 2. Kiểm tra Docker containers
    local down_containers
    down_containers=$(check_containers)
    local container_count="${#CONTAINERS[@]}"
    local running_count=$((container_count - $(echo "$down_containers" | tr ',' '\n' | grep -c '.' || true)))
    [ -z "$down_containers" ] && running_count=$container_count

    # 3. Health endpoint probe
    local health_code
    health_code=$(check_health_endpoint)

    # 4. Ghi audit log
    local container_status="OK"
    [ -n "$down_containers" ] && container_status="DOWN: $down_containers"
    local health_status="OK"
    [ "$health_code" != "200" ] && health_status="FAIL($health_code)"

    local log_status="HEALTHY"

    echo "[$TIMESTAMP] CPU=${cpu}% RAM=${ram}% DISK=${disk}% SWAP=${swap}% | CONTAINERS=${running_count}/${container_count} ${container_status} | HEALTH=${health_status} | STATUS=${log_status}" >> "$LOG_FILE"

    # 5. Xử lý từng metric
    process_metric "CPU" "$cpu" "$CPU_WARN" "$CPU_CRIT"
    process_metric "RAM" "$ram" "$RAM_WARN" "$RAM_CRIT"
    process_metric "DISK" "$disk" "$DISK_WARN" "$DISK_CRIT"
    process_metric "SWAP" "$swap" "$SWAP_WARN" "$SWAP_CRIT"

    # 6. Xử lý Docker container down
    if [ -n "$down_containers" ]; then
        local strikes
        strikes=$(increment_strike "CONTAINER")

        # Auto-restart từng container bị sập
        local restart_report=""
        IFS=',' read -ra DOWN_LIST <<< "$down_containers"
        for entry in "${DOWN_LIST[@]}"; do
            local cname
            cname=$(echo "$entry" | cut -d'(' -f1)
            local result
            result=$(try_restart_container "$cname")
            if [ "$result" = "OK" ]; then
                restart_report="${restart_report}\n  ✅ ${cname}: Đã tự động restart"
            elif [ "$result" = "EXCEEDED" ]; then
                restart_report="${restart_report}\n  ❌ ${cname}: Đã vượt giới hạn restart (${MAX_RESTARTS_PER_HOUR} lần/giờ)"
            fi
        done

        if [ "$strikes" -ge "$STRIKE_THRESHOLD" ] && ! is_cooldown_active "CONTAINER"; then
            send_alert "CRITICAL" "Container(s) bị sập: ${down_containers}" \
                "Containers DOWN: ${down_containers}\nRunning: ${running_count}/${container_count}\nAuto-restart:${restart_report}\nServer: ${HOSTNAME}"
            set_cooldown "CONTAINER"
            mark_alerted "CONTAINER"
        fi
    else
        reset_strike "CONTAINER"
        if was_alerted "CONTAINER"; then
            send_recovery "Tất cả containers đã hoạt động trở lại" \
                "Running: ${container_count}/${container_count}\nServer: ${HOSTNAME}"
            clear_alerted "CONTAINER"
        fi
    fi

    # 7. Xử lý Health endpoint fail
    if [ "$health_code" != "200" ]; then
        local strikes
        strikes=$(increment_strike "HEALTH")
        if [ "$strikes" -ge "$STRIKE_THRESHOLD" ] && ! is_cooldown_active "HEALTH"; then
            send_alert "CRITICAL" "API Health endpoint không phản hồi (HTTP ${health_code})" \
                "Health URL: ${HEALTH_URL}\nHTTP Code: ${health_code}\nServer: ${HOSTNAME}"
            set_cooldown "HEALTH"
            mark_alerted "HEALTH"
        fi
    else
        reset_strike "HEALTH"
        if was_alerted "HEALTH"; then
            send_recovery "API Health endpoint đã hồi phục (HTTP 200)" \
                "Health URL: ${HEALTH_URL}\nServer: ${HOSTNAME}"
            clear_alerted "HEALTH"
        fi
    fi

    # Chờ background jobs (curl, python) hoàn thành
    wait
}

main "$@"
