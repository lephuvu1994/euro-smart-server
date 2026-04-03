ALTER TABLE "public"."t_user" ADD COLUMN "maxTimers" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "public"."t_user" ADD COLUMN "maxSchedules" INTEGER NOT NULL DEFAULT 50;
ALTER TABLE "public"."t_user" ADD COLUMN "maxScenes" INTEGER NOT NULL DEFAULT 100;

ALTER TABLE "public"."t_scene" ADD COLUMN "minIntervalSeconds" INTEGER DEFAULT 60;
ALTER TABLE "public"."t_scene" ADD COLUMN "lastFiredAt" TIMESTAMP(3);
