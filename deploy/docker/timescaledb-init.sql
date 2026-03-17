-- ============================================================
-- TimescaleDB Initialization Script
-- Chạy tự động khi container PostgreSQL khởi động lần đầu
-- Mount: /docker-entrypoint-initdb.d/01_timescale.sql
-- ============================================================

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
