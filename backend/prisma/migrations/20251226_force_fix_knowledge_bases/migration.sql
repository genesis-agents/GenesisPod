-- FORCE FIX: Add type column to knowledge_bases table
-- This migration ensures the type column exists

-- Step 1: Create KnowledgeBaseType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KnowledgeBaseType') THEN
        CREATE TYPE "KnowledgeBaseType" AS ENUM ('PERSONAL', 'TEAM');
    END IF;
END $$;

-- Step 2: Add type column if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases' AND column_name = 'type'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "type" "KnowledgeBaseType" NOT NULL DEFAULT 'PERSONAL';
    END IF;
END $$;

-- Step 3: Add other missing columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases' AND column_name = 'team_id'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "team_id" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases' AND column_name = 'notion_workspace_id'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "notion_workspace_id" TEXT;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases' AND column_name = 'notion_page_ids'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "notion_page_ids" JSONB NOT NULL DEFAULT '[]';
    END IF;
END $$;

-- Step 4: Create indexes
CREATE INDEX IF NOT EXISTS "knowledge_bases_type_idx" ON "knowledge_bases"("type");
CREATE INDEX IF NOT EXISTS "knowledge_bases_team_id_idx" ON "knowledge_bases"("team_id");
