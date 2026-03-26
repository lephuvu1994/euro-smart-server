DO $$ BEGIN
    CREATE TYPE "EntityDomain" AS ENUM ('light', 'switch_', 'sensor', 'camera', 'lock', 'curtain', 'climate', 'button');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "AttributeValueType" AS ENUM ('BOOLEAN', 'NUMBER', 'STRING', 'ENUM', 'COLOR', 'JSON');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

CREATE TABLE IF NOT EXISTS "t_entity_state_history" (
    "id" UUID NOT NULL,
    "value" DOUBLE PRECISION,
    "value_text" TEXT,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "t_entity_state_history_pkey" PRIMARY KEY ("id","created_at")
);

CREATE INDEX IF NOT EXISTS "t_device_entity_device_id_idx" ON "t_device_entity"("device_id");
CREATE UNIQUE INDEX IF NOT EXISTS "t_device_entity_device_id_code_key" ON "t_device_entity"("device_id", "code");
CREATE INDEX IF NOT EXISTS "t_entity_attribute_entity_id_idx" ON "t_entity_attribute"("entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "t_entity_attribute_entity_id_key_key" ON "t_entity_attribute"("entity_id", "key");
CREATE INDEX IF NOT EXISTS "t_entity_state_history_entity_id_created_at_idx" ON "t_entity_state_history"("entity_id", "created_at" DESC);

DO $$ BEGIN
    ALTER TABLE "t_device_entity" ADD CONSTRAINT "t_device_entity_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "t_device"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "t_entity_attribute" ADD CONSTRAINT "t_entity_attribute_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "t_device_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "t_entity_state_history" ADD CONSTRAINT "t_entity_state_history_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "t_device_entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
