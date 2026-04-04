-- Critical for ScheduleCronService cursor scan
CREATE INDEX IF NOT EXISTS idx_device_schedule_active_next
  ON public.t_device_schedule (is_active, next_execute_at)
  WHERE is_active = true;

-- Critical for DeviceControlProcessor trigger lookup (fallback path)
CREATE INDEX IF NOT EXISTS idx_scene_active
  ON public.t_scene (active)
  WHERE active = true;

-- GIN index for JSONB trigger queries
CREATE INDEX IF NOT EXISTS idx_scene_triggers_gin
  ON public.t_scene USING GIN (triggers);

-- For schedule cursor pagination (id-based cursor)
CREATE INDEX IF NOT EXISTS idx_device_schedule_id
  ON public.t_device_schedule (id);
