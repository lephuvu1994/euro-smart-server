-- 1. TẠO DATABASE (Cho server chạy mới hoàn toàn)
-- PostgreSQL server phải được cài đặt TimescaleDB extension từ trước.
-- CREATE DATABASE euro_smart;
-- \c euro_smart;

-- 2. ĐẢM BẢO EXTENSION ĐƯỢC BẬT
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- LƯU Ý: Chạy npx prisma db push hoặc prisma migrate dev TRƯỚC khi chạy phần dưới đây.
-- Bời vì bảng t_schedule_execution_log cần được tạo trước bởi Prisma.

-- 3. TẠO HYPERTABLE
-- Chuyển đổi bảng t_schedule_execution_log thành Hypertable phân mảnh theo 7 ngày.
-- Nếu bảng đã có dữ liệu, TimescaleDB sẽ migrate dữ liệu đó thành các chunks.
SELECT create_hypertable(
  't_schedule_execution_log', 
  'executed_at', 
  chunk_time_interval => INTERVAL '7 days'
);

-- 4. THIẾT LẬP DATA RETENTION POLICY
-- Tự động dọn rác đối với dữ liệu cũ vượt quá 30 ngày.
-- Chống "rác" hệ thống trong thời gian dài.
SELECT add_retention_policy('t_schedule_execution_log', INTERVAL '30 days');
