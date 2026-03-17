-- ============================================================
-- TimescaleDB: Convert t_device_feature_state to Hypertable
-- + Retention Policy (90 ngày tự động xóa data cũ)
-- + Compression Policy (dữ liệu > 7 ngày tự nén ~10x)
-- ============================================================

-- 1. Enable extension (idempotent — an toàn chạy nhiều lần)
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Convert t_device_feature_state thành Hypertable
--    Partition by created_at, chunk mỗi 7 ngày
--    IF NOT EXISTS: an toàn re-run
SELECT create_hypertable(
  'public.t_device_feature_state',
  'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

-- 3. Enable compression (dữ liệu > 7 ngày sẽ được nén ~10x)
ALTER TABLE public.t_device_feature_state
  SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'created_at DESC',
    timescaledb.compress_segmentby = 'feature_id'
  );

-- 4. Compression policy: tự động nén chunks cũ hơn 7 ngày
SELECT add_compression_policy(
  'public.t_device_feature_state',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- 5. Retention policy: tự động xóa data cũ hơn 90 ngày
--    Thay đổi interval này theo nhu cầu lưu trữ
SELECT add_retention_policy(
  'public.t_device_feature_state',
  INTERVAL '90 days',
  if_not_exists => TRUE
);

-- 6. Continuous Aggregate: thống kê theo giờ (cho chart analytics)
--    Tự động refresh mỗi 1 giờ, lookback 3 ngày
CREATE MATERIALIZED VIEW IF NOT EXISTS device_feature_hourly_avg
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', created_at) AS bucket,
  feature_id,
  AVG(value)        AS avg_value,
  MAX(value)        AS max_value,
  MIN(value)        AS min_value,
  COUNT(*)          AS sample_count
FROM public.t_device_feature_state
WHERE value IS NOT NULL
GROUP BY bucket, feature_id
WITH NO DATA;

-- 7. Refresh policy cho Continuous Aggregate
SELECT add_continuous_aggregate_policy(
  'device_feature_hourly_avg',
  start_offset  => INTERVAL '3 days',
  end_offset    => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);
