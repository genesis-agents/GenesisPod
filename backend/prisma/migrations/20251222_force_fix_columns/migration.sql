-- Force fix missing columns migration
-- This migration ALWAYS runs and ensures columns exist

-- Add encrypted column to system_settings if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'system_settings'
        AND column_name = 'encrypted'
    ) THEN
        ALTER TABLE "system_settings" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Add team_initialized column to ai_coding_projects if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ai_coding_projects'
        AND column_name = 'team_initialized'
    ) THEN
        ALTER TABLE "ai_coding_projects" ADD COLUMN "team_initialized" BOOLEAN NOT NULL DEFAULT false;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Add current_mission_id column to ai_coding_projects if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ai_coding_projects'
        AND column_name = 'current_mission_id'
    ) THEN
        ALTER TABLE "ai_coding_projects" ADD COLUMN "current_mission_id" UUID;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;
