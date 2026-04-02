-- CreateEnum
CREATE TYPE "AutomationTargetType" AS ENUM ('DEVICE_ENTITY', 'SCENE');

-- CreateEnum
CREATE TYPE "TimerStatus" AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'CANCELLED');

-- DropIndex
DROP INDEX "t_entity_state_history_created_at_idx";

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
CREATE UNIQUE INDEX "t_device_timer_job_id_key" ON "t_device_timer"("job_id");

-- CreateIndex
CREATE INDEX "t_device_timer_execute_at_idx" ON "t_device_timer"("execute_at");

-- CreateIndex
CREATE INDEX "t_device_schedule_is_active_next_execute_at_idx" ON "t_device_schedule"("is_active", "next_execute_at");

-- CreateIndex
CREATE INDEX "t_schedule_execution_log_source_id_idx" ON "t_schedule_execution_log"("source_id");

-- CreateIndex
CREATE INDEX "t_schedule_execution_log_executed_at_idx" ON "t_schedule_execution_log"("executed_at" DESC);
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
