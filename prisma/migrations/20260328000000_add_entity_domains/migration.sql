-- Migration: Add new EntityDomain enum values for multi-entity curtain/switch_door
-- Adds: switch, config, update (OTA per HA standard)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'switch' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EntityDomain')) THEN
    ALTER TYPE "EntityDomain" ADD VALUE 'switch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'config' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EntityDomain')) THEN
    ALTER TYPE "EntityDomain" ADD VALUE 'config';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'update' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'EntityDomain')) THEN
    ALTER TYPE "EntityDomain" ADD VALUE 'update';
  END IF;
END $$;
