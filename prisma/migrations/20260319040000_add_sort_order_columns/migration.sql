-- AlterTable: Add sort_order to t_device
ALTER TABLE "t_device" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add sort_order to t_device_share
ALTER TABLE "t_device_share" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;
