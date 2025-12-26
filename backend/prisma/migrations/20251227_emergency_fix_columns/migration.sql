-- Emergency fix: Add missing columns to Railway database
-- Fixes:
--   1. knowledge_bases.type column (KnowledgeBaseType enum)
--   2. ai_models.embedding_dimensions column
--   3. ai_models.max_input_tokens column

-- Step 1: Create KnowledgeBaseType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KnowledgeBaseType') THEN
        CREATE TYPE "KnowledgeBaseType" AS ENUM ('PERSONAL', 'TEAM');
    END IF;
END $$;

-- Step 2: Add type column to knowledge_bases if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases' AND column_name = 'type'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "type" "KnowledgeBaseType" NOT NULL DEFAULT 'PERSONAL';
    END IF;
END $$;

-- Step 3: Add team_id column to knowledge_bases if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases' AND column_name = 'team_id'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "team_id" TEXT;
    END IF;
END $$;

-- Step 4: Add embedding_dimensions column to ai_models if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'embedding_dimensions'
    ) THEN
        ALTER TABLE "ai_models" ADD COLUMN "embedding_dimensions" INTEGER;
    END IF;
END $$;

-- Step 5: Add max_input_tokens column to ai_models if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'max_input_tokens'
    ) THEN
        ALTER TABLE "ai_models" ADD COLUMN "max_input_tokens" INTEGER;
    END IF;
END $$;

-- Step 6: Create indexes if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'knowledge_bases_type_idx') THEN
        CREATE INDEX "knowledge_bases_type_idx" ON "knowledge_bases"("type");
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'knowledge_bases_team_id_idx') THEN
        CREATE INDEX "knowledge_bases_team_id_idx" ON "knowledge_bases"("team_id");
    END IF;
END $$;
