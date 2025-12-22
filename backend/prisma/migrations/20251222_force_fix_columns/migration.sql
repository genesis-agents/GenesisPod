-- Force fix missing columns migration
-- This migration ALWAYS runs and ensures columns exist
-- Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS equivalent for PostgreSQL

-- ============ STEP 1: Add missing columns to system_settings ============

DO $add_encrypted$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'system_settings'
        AND column_name = 'encrypted'
    ) THEN
        RAISE NOTICE 'Adding encrypted column to system_settings';
        ALTER TABLE "system_settings" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
    ELSE
        RAISE NOTICE 'encrypted column already exists in system_settings';
    END IF;
END $add_encrypted$;

-- ============ STEP 2: Add missing columns to ai_coding_projects ============

DO $add_team_initialized$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ai_coding_projects'
        AND column_name = 'team_initialized'
    ) THEN
        RAISE NOTICE 'Adding team_initialized column to ai_coding_projects';
        ALTER TABLE "ai_coding_projects" ADD COLUMN "team_initialized" BOOLEAN NOT NULL DEFAULT false;
    ELSE
        RAISE NOTICE 'team_initialized column already exists in ai_coding_projects';
    END IF;
END $add_team_initialized$;

DO $add_current_mission_id$
BEGIN
    -- Check if column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ai_coding_projects'
        AND column_name = 'current_mission_id'
    ) THEN
        RAISE NOTICE 'Adding current_mission_id column to ai_coding_projects';
        ALTER TABLE "ai_coding_projects" ADD COLUMN "current_mission_id" UUID;
    ELSE
        RAISE NOTICE 'current_mission_id column already exists in ai_coding_projects';
    END IF;
END $add_current_mission_id$;

-- ============ STEP 3: Final verification ============

DO $verify$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check system_settings.encrypted
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'system_settings'
    AND column_name = 'encrypted';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'CRITICAL: system_settings.encrypted column was NOT created!';
    END IF;

    -- Check ai_coding_projects.team_initialized
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'ai_coding_projects'
    AND column_name = 'team_initialized';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'CRITICAL: ai_coding_projects.team_initialized column was NOT created!';
    END IF;

    -- Check ai_coding_projects.current_mission_id
    SELECT COUNT(*) INTO v_count
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'ai_coding_projects'
    AND column_name = 'current_mission_id';

    IF v_count = 0 THEN
        RAISE EXCEPTION 'CRITICAL: ai_coding_projects.current_mission_id column was NOT created!';
    END IF;

    RAISE NOTICE '✅ All required columns verified successfully!';
END $verify$;
