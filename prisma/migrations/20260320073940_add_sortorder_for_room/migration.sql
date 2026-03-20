-- DropIndex
DROP INDEX "t_device_feature_state_created_at_idx";

-- AlterTable
ALTER TABLE "t_room" ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;
