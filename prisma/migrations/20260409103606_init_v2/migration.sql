-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceProtocol" AS ENUM ('MQTT', 'ZIGBEE', 'GSM_4G', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "EntityDomain" AS ENUM ('light', 'switch_', 'switch', 'sensor', 'camera', 'lock', 'curtain', 'climate', 'button', 'config', 'update');

-- CreateEnum
CREATE TYPE "AttributeValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'STRING', 'ENUM', 'COLOR', 'JSON');

-- CreateEnum
CREATE TYPE "ProvisionTokenStatus" AS ENUM ('PENDING', 'ACTIVATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AutomationTargetType" AS ENUM ('DEVICE_ENTITY', 'SCENE');

-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "t_user" (
    "id" UUID NOT NULL,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "avatar" TEXT,
    "maxTimers" INTEGER NOT NULL DEFAULT 50,
    "maxSchedules" INTEGER NOT NULL DEFAULT 50,
    "maxScenes" INTEGER NOT NULL DEFAULT 100,
    "otp_code" TEXT,
    "otp_expire" TIMESTAMP(3),
    "otp_provider" TEXT,
    "last_latitude" DOUBLE PRECISION,
    "last_longitude" DOUBLE PRECISION,
    "last_altitude" DOUBLE PRECISION,
    "last_accuracy" DOUBLE PRECISION,
    "last_location_changed" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_session" (
    "id" UUID NOT NULL,
    "hashed_refresh_token" TEXT NOT NULL,
    "device_name" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "push_token" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_partner" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_model" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_device_model_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_license_quota" (
    "id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "device_model_id" UUID NOT NULL,
    "max_quantity" INTEGER NOT NULL DEFAULT 0,
    "activated_count" INTEGER NOT NULL DEFAULT 0,
    "license_days" INTEGER NOT NULL DEFAULT 90,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_license_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_hardware_registry" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "device_token" TEXT NOT NULL,
    "mqtt_username" TEXT,
    "mqtt_password" TEXT,
    "mqtt_broker" TEXT,
    "partner_id" UUID NOT NULL,
    "device_model_id" UUID NOT NULL,
    "firmware_ver" TEXT,
    "ip_address" TEXT,
    "is_banned" BOOLEAN NOT NULL DEFAULT false,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_hardware_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "protocol" "DeviceProtocol" NOT NULL DEFAULT 'MQTT',
    "device_model_id" UUID NOT NULL,
    "partner_id" UUID NOT NULL,
    "hardware_id" UUID,
    "owner_id" UUID NOT NULL,
    "home_id" UUID,
    "room_id" UUID,
    "serviceId" UUID,
    "custom_config" JSONB,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "unbound_at" TIMESTAMP(3),

    CONSTRAINT "t_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_entity" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" "EntityDomain" NOT NULL,
    "state" DOUBLE PRECISION,
    "state_text" TEXT,
    "command_key" TEXT,
    "command_suffix" TEXT,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "device_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "t_device_entity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_entity_attribute" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value_type" "AttributeValueType" NOT NULL,
    "num_value" DOUBLE PRECISION,
    "str_value" TEXT,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "unit" TEXT,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "enum_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config" JSONB DEFAULT '{}',
    "entity_id" UUID NOT NULL,

    CONSTRAINT "t_entity_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_entity_state_history" (
    "id" UUID NOT NULL,
    "value" DOUBLE PRECISION,
    "value_text" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mqtt',
    "action_by_user_id" UUID,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_entity_state_history_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateTable
CREATE TABLE "t_device_connection_log" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_connection_log_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateTable
CREATE TABLE "t_device_share" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'EDITOR',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_share_token" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'VIEWER',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_share_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_home" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "radius" INTEGER NOT NULL DEFAULT 100,
    "owner_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_home_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_floor" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "home_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_home_member" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "home_id" UUID NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',

    CONSTRAINT "t_home_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_room" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "home_id" UUID NOT NULL,
    "floor_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_service" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT,

    CONSTRAINT "t_service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_scene" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "triggers" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "minIntervalSeconds" INTEGER DEFAULT 60,
    "lastFiredAt" TIMESTAMP(3),
    "home_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_scene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_location" (
    "id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "battery" INTEGER,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_calendar" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_calendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_calendar_event" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "calendar_id" UUID NOT NULL,

    CONSTRAINT "t_calendar_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_system_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "t_system_config_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "t_provision_token" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "status" "ProvisionTokenStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" UUID NOT NULL,
    "device_id" UUID,
    "deviceName" TEXT,
    "mqtt_broker" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activated_at" TIMESTAMP(3),

    CONSTRAINT "t_provision_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_timer" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT,
    "target_type" "AutomationTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "execute_at" TIMESTAMP(3) NOT NULL,
    "job_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_timer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_schedule" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "target_type" "AutomationTargetType" NOT NULL,
    "target_id" UUID NOT NULL,
    "service" TEXT NOT NULL,
    "actions" JSONB NOT NULL DEFAULT '[]',
    "cron_expression" TEXT,
    "days_of_week" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "time_of_day" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "jitter_seconds" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "next_execute_at" TIMESTAMP(3),
    "last_executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_device_schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_schedule_execution_log" (
    "id" UUID NOT NULL,
    "sourceType" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "error_reason" TEXT,
    "executed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_schedule_execution_log_pkey" PRIMARY KEY ("id","executed_at")
);

-- CreateIndex
CREATE UNIQUE INDEX "t_user_email_key" ON "t_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_phone_key" ON "t_user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "t_session_hashed_refresh_token_key" ON "t_session"("hashed_refresh_token");

-- CreateIndex
CREATE INDEX "t_session_user_id_idx" ON "t_session"("user_id");

-- CreateIndex
CREATE INDEX "t_session_user_id_push_token_idx" ON "t_session"("user_id", "push_token");

-- CreateIndex
CREATE UNIQUE INDEX "t_partner_code_key" ON "t_partner"("code");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_model_code_key" ON "t_device_model"("code");

-- CreateIndex
CREATE UNIQUE INDEX "t_license_quota_partner_id_device_model_id_key" ON "t_license_quota"("partner_id", "device_model_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_hardware_registry_identifier_key" ON "t_hardware_registry"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "t_hardware_registry_device_token_key" ON "t_hardware_registry"("device_token");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_token_key" ON "t_device"("token");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_hardware_id_key" ON "t_device"("hardware_id");

-- CreateIndex
CREATE INDEX "t_device_identifier_idx" ON "t_device"("identifier");

-- CreateIndex
CREATE INDEX "t_device_partner_id_idx" ON "t_device"("partner_id");

-- CreateIndex
CREATE INDEX "t_device_unbound_at_idx" ON "t_device"("unbound_at");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_identifier_protocol_key" ON "t_device"("identifier", "protocol");

-- CreateIndex
CREATE INDEX "t_device_entity_device_id_idx" ON "t_device_entity"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_entity_device_id_code_key" ON "t_device_entity"("device_id", "code");

-- CreateIndex
CREATE INDEX "t_entity_attribute_entity_id_idx" ON "t_entity_attribute"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_entity_attribute_entity_id_key_key" ON "t_entity_attribute"("entity_id", "key");

-- CreateIndex
CREATE INDEX "t_entity_state_history_entity_id_created_at_idx" ON "t_entity_state_history"("entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_device_connection_log_device_id_created_at_idx" ON "t_device_connection_log"("device_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_device_connection_log_created_at_idx" ON "t_device_connection_log"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_device_share_device_id_user_id_key" ON "t_device_share"("device_id", "user_id");

-- CreateIndex
CREATE INDEX "t_device_share_token_expires_at_idx" ON "t_device_share_token"("expires_at");

-- CreateIndex
CREATE INDEX "t_floor_home_id_idx" ON "t_floor"("home_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_home_member_user_id_home_id_key" ON "t_home_member"("user_id", "home_id");

-- CreateIndex
CREATE INDEX "t_room_floor_id_idx" ON "t_room"("floor_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_service_name_key" ON "t_service"("name");

-- CreateIndex
CREATE INDEX "t_location_user_id_created_at_idx" ON "t_location"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_calendar_event_start_end_idx" ON "t_calendar_event"("start", "end");

-- CreateIndex
CREATE UNIQUE INDEX "t_provision_token_token_key" ON "t_provision_token"("token");

-- CreateIndex
CREATE INDEX "t_provision_token_token_idx" ON "t_provision_token"("token");

-- CreateIndex
CREATE INDEX "t_provision_token_user_id_idx" ON "t_provision_token"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_timer_job_id_key" ON "t_device_timer"("job_id");

-- CreateIndex
CREATE INDEX "t_device_timer_execute_at_idx" ON "t_device_timer"("execute_at");

-- CreateIndex
CREATE INDEX "t_device_schedule_is_active_next_execute_at_idx" ON "t_device_schedule"("is_active", "next_execute_at");

-- CreateIndex
CREATE INDEX "t_schedule_execution_log_source_id_idx" ON "t_schedule_execution_log"("source_id");

-- CreateIndex
CREATE INDEX "t_schedule_execution_log_executed_at_idx" ON "t_schedule_execution_log"("executed_at" DESC);

-- AddForeignKey
ALTER TABLE "t_session" ADD CONSTRAINT "t_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_license_quota" ADD CONSTRAINT "t_license_quota_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "t_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_license_quota" ADD CONSTRAINT "t_license_quota_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "t_device_model"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_hardware_registry" ADD CONSTRAINT "t_hardware_registry_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "t_partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_hardware_registry" ADD CONSTRAINT "t_hardware_registry_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "t_device_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_device_model_id_fkey" FOREIGN KEY ("device_model_id") REFERENCES "t_device_model"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_partner_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "t_partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_hardware_id_fkey" FOREIGN KEY ("hardware_id") REFERENCES "t_hardware_registry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "t_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "t_home"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "t_room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device" ADD CONSTRAINT "t_device_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "t_service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_entity" ADD CONSTRAINT "t_device_entity_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_entity_attribute" ADD CONSTRAINT "t_entity_attribute_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "t_device_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_entity_state_history" ADD CONSTRAINT "t_entity_state_history_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "t_device_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_connection_log" ADD CONSTRAINT "t_device_connection_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_share" ADD CONSTRAINT "t_device_share_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_share" ADD CONSTRAINT "t_device_share_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_share_token" ADD CONSTRAINT "t_device_share_token_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_share_token" ADD CONSTRAINT "t_device_share_token_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_home" ADD CONSTRAINT "t_home_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_floor" ADD CONSTRAINT "t_floor_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "t_home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_home_member" ADD CONSTRAINT "t_home_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_home_member" ADD CONSTRAINT "t_home_member_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "t_home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_room" ADD CONSTRAINT "t_room_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "t_home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_room" ADD CONSTRAINT "t_room_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "t_floor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_scene" ADD CONSTRAINT "t_scene_home_id_fkey" FOREIGN KEY ("home_id") REFERENCES "t_home"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_location" ADD CONSTRAINT "t_location_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_calendar" ADD CONSTRAINT "t_calendar_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_calendar_event" ADD CONSTRAINT "t_calendar_event_calendar_id_fkey" FOREIGN KEY ("calendar_id") REFERENCES "t_calendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_provision_token" ADD CONSTRAINT "t_provision_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- TimescaleDB Extensions and Policies
-- ============================================================

-- 1. Enable extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 2. Convert to Hypertable: t_entity_state_history
SELECT create_hypertable(
  'public.t_entity_state_history',
  'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists       => TRUE,
  migrate_data        => TRUE
);

ALTER TABLE "t_entity_state_history"
  SET (
    timescaledb.compress,
    timescaledb.compress_orderby   = 'created_at DESC',
    timescaledb.compress_segmentby = 'entity_id'
  );

SELECT add_compression_policy('public.t_entity_state_history', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('public.t_entity_state_history', INTERVAL '90 days', if_not_exists => TRUE);

-- 3. Convert to Hypertable: t_device_connection_log
SELECT create_hypertable(
  'public.t_device_connection_log',
  'created_at',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists       => TRUE,
  migrate_data        => TRUE
);

ALTER TABLE "t_device_connection_log"
  SET (
    timescaledb.compress,
    timescaledb.compress_orderby   = 'created_at DESC',
    timescaledb.compress_segmentby = 'device_id'
  );

SELECT add_compression_policy('public.t_device_connection_log', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('public.t_device_connection_log', INTERVAL '180 days', if_not_exists => TRUE);

-- 4. Convert to Hypertable: t_schedule_execution_log
SELECT create_hypertable(
  't_schedule_execution_log', 
  'executed_at', 
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE,
  migrate_data => TRUE
);

SELECT add_retention_policy('t_schedule_execution_log', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================
-- Custom Performance Indexes
-- ============================================================

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

