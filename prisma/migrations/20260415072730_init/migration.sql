-- DropIndex
DROP INDEX "idx_device_schedule_id";

-- DropIndex
DROP INDEX "t_entity_state_history_created_at_idx";

-- DropIndex
DROP INDEX "idx_scene_triggers_gin";

-- AlterTable
ALTER TABLE "t_scene" ADD COLUMN     "color" TEXT,
ADD COLUMN     "icon" TEXT,
ADD COLUMN     "room_id" UUID,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "t_scene" ADD CONSTRAINT "t_scene_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "t_room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
