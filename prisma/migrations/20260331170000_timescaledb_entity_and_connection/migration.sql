-- ============================================================
-- TimescaleDB: t_entity_state_history → Hypertable
-- Replaces old t_device_feature_state hypertable (which is now orphaned)
-- chunk_time_interval: 7 days, compression after 7 days, retention 90 days
-- ============================================================

-- 1. Convert to Hypertable (migrate existing data)
SELECT create_hypertable(
  'public.t_entity_state_history',
  'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists       => TRUE,
  migrate_data        => TRUE
);

-- 2. Enable compression
ALTER TABLE "t_entity_state_history"
  SET (
    timescaledb.compress,
    timescaledb.compress_orderby   = 'created_at DESC',
    timescaledb.compress_segmentby = 'entity_id'
  );

-- 3. Compression policy: auto-compress chunks older than 7 days (~10x disk reduction)
SELECT add_compression_policy(
  'public.t_entity_state_history',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- 4. Retention policy: auto-drop data older than 90 days
SELECT add_retention_policy(
  'public.t_entity_state_history',
  INTERVAL '90 days',
  if_not_exists => TRUE
);

-- ============================================================
-- TimescaleDB: t_device_connection_log → Hypertable
-- chunk_time_interval: 7 days, compression after 7 days, retention 180 days
-- ============================================================

-- 5. Convert to Hypertable (migrate existing data)
SELECT create_hypertable(
  'public.t_device_connection_log',
  'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists       => TRUE,
  migrate_data        => TRUE
);

-- 6. Enable compression
ALTER TABLE "t_device_connection_log"
  SET (
    timescaledb.compress,
    timescaledb.compress_orderby   = 'created_at DESC',
    timescaledb.compress_segmentby = 'device_id'
  );

-- 7. Compression policy: auto-compress chunks older than 7 days
SELECT add_compression_policy(
  'public.t_device_connection_log',
  INTERVAL '7 days',
  if_not_exists => TRUE
);

-- 8. Retention policy: auto-drop data older than 180 days (connection logs kept longer)
SELECT add_retention_policy(
  'public.t_device_connection_log',
  INTERVAL '180 days',
  if_not_exists => TRUE
);
