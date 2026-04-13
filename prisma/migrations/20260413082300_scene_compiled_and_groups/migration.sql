-- Migration: scene_compiled_actions
-- AddColumn: Scene.compiled_actions, Scene.compiled_at
-- AddColumn: Device.config_version

-- Scene: pre-compiled actions cache
ALTER TABLE "t_scene" ADD COLUMN "compiled_actions" JSONB;
ALTER TABLE "t_scene" ADD COLUMN "compiled_at" TIMESTAMP(3);

-- Device: version counter for cache invalidation
ALTER TABLE "t_device" ADD COLUMN "config_version" INTEGER NOT NULL DEFAULT 1;
