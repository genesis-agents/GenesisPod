-- Fix missing columns migration
-- This migration ensures all required columns exist

-- ============ system_settings table ============

-- Add encrypted column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_settings' AND column_name = 'encrypted'
    ) THEN
        ALTER TABLE "system_settings" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- ============ ai_coding_projects table ============

-- Add team_initialized column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_coding_projects' AND column_name = 'team_initialized'
    ) THEN
        ALTER TABLE "ai_coding_projects" ADD COLUMN "team_initialized" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Add current_mission_id column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_coding_projects' AND column_name = 'current_mission_id'
    ) THEN
        ALTER TABLE "ai_coding_projects" ADD COLUMN "current_mission_id" UUID;
    END IF;
END $$;

-- ============ Verify columns exist ============
-- This will fail if columns don't exist, helping debug issues
DO $$
DECLARE
    missing_columns TEXT := '';
BEGIN
    -- Check system_settings.encrypted
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_settings' AND column_name = 'encrypted'
    ) THEN
        missing_columns := missing_columns || 'system_settings.encrypted, ';
    END IF;

    -- Check ai_coding_projects.team_initialized
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_coding_projects' AND column_name = 'team_initialized'
    ) THEN
        missing_columns := missing_columns || 'ai_coding_projects.team_initialized, ';
    END IF;

    -- Check ai_coding_projects.current_mission_id
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_coding_projects' AND column_name = 'current_mission_id'
    ) THEN
        missing_columns := missing_columns || 'ai_coding_projects.current_mission_id, ';
    END IF;

    IF missing_columns <> '' THEN
        RAISE WARNING 'Missing columns after migration: %', missing_columns;
    ELSE
        RAISE NOTICE 'All required columns exist';
    END IF;
END $$;
