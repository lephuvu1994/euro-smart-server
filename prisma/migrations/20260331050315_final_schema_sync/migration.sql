/*
  Warnings:

  - You are about to drop the column `features_config` on the `t_device_model` table. All the data in the column will be lost.
  - You are about to drop the `t_device_feature` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `t_device_feature_state` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `t_device_param` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "t_device_feature" DROP CONSTRAINT "t_device_feature_device_id_fkey";

-- DropForeignKey
ALTER TABLE "t_device_feature_state" DROP CONSTRAINT "t_device_feature_state_feature_id_fkey";

-- DropForeignKey
ALTER TABLE "t_device_param" DROP CONSTRAINT "t_device_param_device_id_fkey";

-- AlterTable
ALTER TABLE "t_device" ADD COLUMN     "unbound_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "t_device_model" DROP COLUMN "features_config",
ADD COLUMN     "config" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "t_entity_state_history" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'mqtt';

-- AlterTable
ALTER TABLE "t_session" ADD COLUMN     "push_token" TEXT;

-- DropTable
DROP TABLE "t_device_feature" CASCADE;

-- DropTable
DROP TABLE "t_device_feature_state" CASCADE;

-- DropTable
DROP TABLE "t_device_param";

-- DropEnum
DROP TYPE "DeviceFeatureCategory";

-- DropEnum
DROP TYPE "FeatureType";

-- CreateTable
CREATE TABLE "t_device_connection_log" (
    "id" UUID NOT NULL,
    "event" TEXT NOT NULL,
    "device_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_device_connection_log_pkey" PRIMARY KEY ("id","created_at")
);

-- CreateIndex
CREATE INDEX "t_device_connection_log_device_id_created_at_idx" ON "t_device_connection_log"("device_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "t_device_connection_log_created_at_idx" ON "t_device_connection_log"("created_at" DESC);

-- CreateIndex
CREATE INDEX "t_device_unbound_at_idx" ON "t_device"("unbound_at");

-- AddForeignKey
ALTER TABLE "t_device_connection_log" ADD CONSTRAINT "t_device_connection_log_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
