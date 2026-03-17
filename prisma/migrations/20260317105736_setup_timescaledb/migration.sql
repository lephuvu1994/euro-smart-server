-- ============================================================
-- TimescaleDB FULL SETUP: t_device_feature_state → Hypertable
-- Requires: timescale/timescaledb:latest-pg16 (Community edition)
-- All features: hypertable + compression + retention + aggregates
-- ============================================================

-- 1. Enable extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Drop existing index (will recreate after hypertable)
DROP INDEX IF EXISTS "t_device_feature_state_feature_id_created_at_idx";

-- 3. Fix Primary Key: composite (id, created_at) required by TimescaleDB
ALTER TABLE "t_device_feature_state" DROP CONSTRAINT "t_device_feature_state_pkey";
ALTER TABLE "t_device_feature_state" ADD CONSTRAINT "t_device_feature_state_pkey"
  PRIMARY KEY ("id", "created_at");

-- 4. Convert to Hypertable — chunk mỗi 7 ngày
SELECT create_hypertable(
  'public.t_device_feature_state',
  'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists       => TRUE
);

-- 5. Recreate index on hypertable
CREATE INDEX IF NOT EXISTS "t_device_feature_state_feature_id_created_at_idx"
  ON "t_device_feature_state"("feature_id", "created_at" DESC);

-- 6. Enable compression
--    segment by feature_id → gom data cùng feature vào chunk
--    order by created_at DESC → query latest nhanh
ALTER TABLE "t_device_feature_state"
  SET (
    timescaledb.compress,
    timescaledb.compress_orderby   = 'created_at DESC',
    timescaledb.compress_segmentby = 'feature_id'
  );

-- 7. Compression policy: auto-compress chunks cũ hơn 7 ngày (~10x disk reduction)
SELECT add_compression_policy(
  'public.t_device_feature_state',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- 8. Retention policy: auto-drop data cũ hơn 90 ngày
SELECT add_retention_policy(
  'public.t_device_feature_state',
  INTERVAL '90 days',
  if_not_exists => TRUE
);

-- 9. Continuous Aggregate: thống kê theo giờ (avg/max/min) cho chart
CREATE MATERIALIZED VIEW IF NOT EXISTS device_feature_hourly_avg
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', created_at) AS bucket,
  feature_id,
  AVG(value)   AS avg_value,
  MAX(value)   AS max_value,
  MIN(value)   AS min_value,
  COUNT(*)     AS sample_count
FROM "t_device_feature_state"
WHERE value IS NOT NULL
GROUP BY bucket, feature_id
WITH NO DATA;

-- 10. Refresh policy: tự refresh mỗi 1 giờ, lookback 3 ngày
SELECT add_continuous_aggregate_policy(
  'device_feature_hourly_avg',
  start_offset      => INTERVAL '3 days',
  end_offset        => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists     => TRUE
);
