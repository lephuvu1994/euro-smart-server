-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "DeviceProtocol" AS ENUM ('MQTT', 'ZIGBEE', 'GSM_4G', 'VIRTUAL');

-- CreateEnum
CREATE TYPE "FeatureType" AS ENUM ('BINARY', 'DIMMER', 'SENSOR', 'TEXT', 'COLOR', 'CAMERA', 'SHUTTER', 'BUTTON', 'CONFIG');

-- CreateEnum
CREATE TYPE "DeviceFeatureCategory" AS ENUM ('light', 'switch', 'sensor', 'camera', 'lock', 'curtain', 'climate');

-- CreateEnum
CREATE TYPE "ProvisionTokenStatus" AS ENUM ('PENDING', 'ACTIVATED', 'EXPIRED');

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
    "features_config" JSONB NOT NULL DEFAULT '[]',
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
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "t_device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_feature" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "DeviceFeatureCategory" NOT NULL,
    "type" "FeatureType" NOT NULL,
    "min" DOUBLE PRECISION,
    "max" DOUBLE PRECISION,
    "unit" TEXT,
    "read_only" BOOLEAN NOT NULL DEFAULT false,
    "lastValue" DOUBLE PRECISION,
    "lastValueString" TEXT,
    "device_id" UUID NOT NULL,
    "config" JSONB DEFAULT '{}',

    CONSTRAINT "t_device_feature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_feature_state" (
    "id" UUID NOT NULL,
    "value" DOUBLE PRECISION,
    "value_text" TEXT,
    "feature_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_feature_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_param" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "device_id" UUID NOT NULL,

    CONSTRAINT "t_device_param_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "t_device_share" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'EDITOR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_share_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "t_user_email_key" ON "t_user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "t_user_phone_key" ON "t_user"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "t_session_hashed_refresh_token_key" ON "t_session"("hashed_refresh_token");

-- CreateIndex
CREATE INDEX "t_session_user_id_idx" ON "t_session"("user_id");

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
CREATE UNIQUE INDEX "t_device_identifier_protocol_key" ON "t_device"("identifier", "protocol");

-- CreateIndex
CREATE UNIQUE INDEX "t_device_feature_device_id_code_key" ON "t_device_feature"("device_id", "code");

-- CreateIndex
CREATE INDEX "t_device_feature_state_feature_id_created_at_idx" ON "t_device_feature_state"("feature_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "t_device_share_device_id_user_id_key" ON "t_device_share"("device_id", "user_id");

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
ALTER TABLE "t_device_feature" ADD CONSTRAINT "t_device_feature_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_feature_state" ADD CONSTRAINT "t_device_feature_state_feature_id_fkey" FOREIGN KEY ("feature_id") REFERENCES "t_device_feature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_param" ADD CONSTRAINT "t_device_param_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_share" ADD CONSTRAINT "t_device_share_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_share" ADD CONSTRAINT "t_device_share_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "t_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
