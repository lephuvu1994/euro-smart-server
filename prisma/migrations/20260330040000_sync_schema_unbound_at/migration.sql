-- CreateEnum
CREATE TYPE "EntityDomain" AS ENUM ('light', 'switch_', 'switch', 'sensor', 'camera', 'lock', 'curtain', 'climate', 'button', 'config', 'update');

-- CreateEnum
CREATE TYPE "AttributeValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'STRING', 'ENUM', 'COLOR', 'JSON');

-- DropForeignKey
ALTER TABLE "t_device_feature" DROP CONSTRAINT IF EXISTS "t_device_feature_device_id_fkey";

-- DropForeignKey
ALTER TABLE "t_device_feature_state" DROP CONSTRAINT IF EXISTS "t_device_feature_state_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "t_device_param" DROP CONSTRAINT IF EXISTS "t_device_param_device_id_fkey";

-- AlterTable
ALTER TABLE "t_device" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "unbound_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "t_device_model" DROP COLUMN IF EXISTS "features_config",
ADD COLUMN IF NOT EXISTS "config" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "t_device_share" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "t_room" ADD COLUMN IF NOT EXISTS "sort_order" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE IF EXISTS "t_device_feature" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "t_device_feature_state" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "t_device_param" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "DeviceFeatureCategory" CASCADE;

-- DropEnum
DROP TYPE IF EXISTS "FeatureType" CASCADE;

-- CreateTable
CREATE TABLE IF NOT EXISTS "t_device_entity" (
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
CREATE TABLE IF NOT EXISTS "t_entity_attribute" (
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
CREATE TABLE IF NOT EXISTS "t_entity_state_history" (
    "id" UUID NOT NULL,
    "value" DOUBLE PRECISION,
    "value_text" TEXT,
    "source" TEXT NOT NULL DEFAULT 'mqtt',
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_entity_state_history_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "t_device_connection_log" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_connection_log_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "t_device_entity_device_id_idx" ON "t_device_entity"("device_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "t_device_entity_device_id_code_key" ON "t_device_entity"("device_id", "code");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "t_entity_attribute_entity_id_idx" ON "t_entity_attribute"("entity_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "t_entity_attribute_entity_id_key_key" ON "t_entity_attribute"("entity_id", "key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "t_entity_state_history_entity_id_created_at_idx" ON "t_entity_state_history"("entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "t_device_connection_log_device_id_created_at_idx" ON "t_device_connection_log"("device_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "t_device_connection_log_created_at_idx" ON "t_device_connection_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "t_device_unbound_at_idx" ON "t_device"("unbound_at");

-- AddForeignKey
ALTER TABLE "t_device_entity" DROP CONSTRAINT IF EXISTS "t_device_entity_device_id_fkey";
ALTER TABLE "t_device_entity" ADD CONSTRAINT "t_device_entity_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_entity_attribute" DROP CONSTRAINT IF EXISTS "t_entity_attribute_entity_id_fkey";
ALTER TABLE "t_entity_attribute" ADD CONSTRAINT "t_entity_attribute_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "t_device_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_entity_state_history" DROP CONSTRAINT IF EXISTS "t_entity_state_history_entity_id_fkey";
ALTER TABLE "t_entity_state_history" ADD CONSTRAINT "t_entity_state_history_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "t_device_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "t_device_connection_log" DROP CONSTRAINT IF EXISTS "t_device_connection_log_device_id_fkey";
ALTER TABLE "t_device_connection_log" ADD CONSTRAINT "t_device_connection_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
