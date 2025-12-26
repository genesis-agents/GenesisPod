-- Extend Knowledge Base System Migration
-- Adds new enums, extends AIModel for EMBEDDING/RERANK, adds UserDataSource and KnowledgeBaseSource tables

-- ============ Step 1: Create new enums ============

-- Knowledge Base Type (PERSONAL/TEAM)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KnowledgeBaseType') THEN
        CREATE TYPE "KnowledgeBaseType" AS ENUM ('PERSONAL', 'TEAM');
    END IF;
END $$;

-- User Data Source Type (for Knowledge Base sources)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserDataSourceType') THEN
        CREATE TYPE "UserDataSourceType" AS ENUM ('GOOGLE_DRIVE', 'NOTION', 'BOOKMARK', 'NOTE', 'UPLOAD', 'URL');
    END IF;
END $$;

-- Search Priority (for AI modules)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SearchPriority') THEN
        CREATE TYPE "SearchPriority" AS ENUM ('KNOWLEDGE_BASE_FIRST', 'WEB_FIRST', 'BALANCED');
    END IF;
END $$;

-- ============ Step 2: Extend AIModelType enum for EMBEDDING and RERANK ============

-- Add EMBEDDING value if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'EMBEDDING'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
    ) THEN
        ALTER TYPE "AIModelType" ADD VALUE 'EMBEDDING';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add RERANK value if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'RERANK'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
    ) THEN
        ALTER TYPE "AIModelType" ADD VALUE 'RERANK';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============ Step 3: Extend ai_models table ============

-- Add embedding_dimensions column
ALTER TABLE "ai_models" ADD COLUMN IF NOT EXISTS "embedding_dimensions" INTEGER;

-- Add max_input_tokens column
ALTER TABLE "ai_models" ADD COLUMN IF NOT EXISTS "max_input_tokens" INTEGER;

-- ============ Step 4: Extend knowledge_bases table ============

-- Add type column (default PERSONAL)
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "type" "KnowledgeBaseType" NOT NULL DEFAULT 'PERSONAL';

-- Add team_id column
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "team_id" TEXT;

-- Add notion_workspace_id column
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "notion_workspace_id" TEXT;

-- Add notion_page_ids column
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "notion_page_ids" JSONB NOT NULL DEFAULT '[]';

-- Create index for team_id
CREATE INDEX IF NOT EXISTS "knowledge_bases_team_id_idx" ON "knowledge_bases"("team_id");

-- Create index for type
CREATE INDEX IF NOT EXISTS "knowledge_bases_type_idx" ON "knowledge_bases"("type");

-- Add foreign key to teams table (if teams table exists)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'teams') THEN
        ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_team_id_fkey"
            FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============ Step 5: Create user_data_sources table ============

CREATE TABLE IF NOT EXISTS "user_data_sources" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id" TEXT NOT NULL,
    "type" "UserDataSourceType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "connection_id" TEXT,
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "last_synced_at" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_data_sources_pkey" PRIMARY KEY ("id")
);

-- Add foreign key
DO $$ BEGIN
    ALTER TABLE "user_data_sources" ADD CONSTRAINT "user_data_sources_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "user_data_sources_user_id_idx" ON "user_data_sources"("user_id");
CREATE INDEX IF NOT EXISTS "user_data_sources_type_idx" ON "user_data_sources"("type");
CREATE UNIQUE INDEX IF NOT EXISTS "user_data_sources_user_id_type_key" ON "user_data_sources"("user_id", "type");

-- ============ Step 6: Create knowledge_base_sources junction table ============

CREATE TABLE IF NOT EXISTS "knowledge_base_sources" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "knowledge_base_id" TEXT NOT NULL,
    "data_source_id" TEXT NOT NULL,
    "folder_ids" JSONB NOT NULL DEFAULT '[]',
    "page_ids" JSONB NOT NULL DEFAULT '[]',
    "filters" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_base_sources_pkey" PRIMARY KEY ("id")
);

-- Add foreign keys
DO $$ BEGIN
    ALTER TABLE "knowledge_base_sources" ADD CONSTRAINT "knowledge_base_sources_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "knowledge_base_sources" ADD CONSTRAINT "knowledge_base_sources_data_source_id_fkey"
        FOREIGN KEY ("data_source_id") REFERENCES "user_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS "knowledge_base_sources_knowledge_base_id_idx" ON "knowledge_base_sources"("knowledge_base_id");
CREATE INDEX IF NOT EXISTS "knowledge_base_sources_data_source_id_idx" ON "knowledge_base_sources"("data_source_id");
CREATE UNIQUE INDEX IF NOT EXISTS "knowledge_base_sources_kb_ds_unique" ON "knowledge_base_sources"("knowledge_base_id", "data_source_id");

-- ============ Step 7: Extend KnowledgeBaseSourceType enum ============

-- Add NOTION if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'NOTION'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'KnowledgeBaseSourceType')
    ) THEN
        ALTER TYPE "KnowledgeBaseSourceType" ADD VALUE 'NOTION';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add BOOKMARK if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'BOOKMARK'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'KnowledgeBaseSourceType')
    ) THEN
        ALTER TYPE "KnowledgeBaseSourceType" ADD VALUE 'BOOKMARK';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add NOTE if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'NOTE'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'KnowledgeBaseSourceType')
    ) THEN
        ALTER TYPE "KnowledgeBaseSourceType" ADD VALUE 'NOTE';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add IMAGE if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'IMAGE'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'KnowledgeBaseSourceType')
    ) THEN
        ALTER TYPE "KnowledgeBaseSourceType" ADD VALUE 'IMAGE';
    END IF;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ============ Step 8: Create AI module association tables ============

-- AI Studio Project -> Knowledge Base association
CREATE TABLE IF NOT EXISTS "_ResearchProjectKnowledgeBases" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_ResearchProjectKnowledgeBases_AB_unique" ON "_ResearchProjectKnowledgeBases"("A", "B");
CREATE INDEX IF NOT EXISTS "_ResearchProjectKnowledgeBases_B_index" ON "_ResearchProjectKnowledgeBases"("B");

DO $$ BEGIN
    ALTER TABLE "_ResearchProjectKnowledgeBases" ADD CONSTRAINT "_ResearchProjectKnowledgeBases_A_fkey"
        FOREIGN KEY ("A") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "_ResearchProjectKnowledgeBases" ADD CONSTRAINT "_ResearchProjectKnowledgeBases_B_fkey"
        FOREIGN KEY ("B") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- AI Ask Session -> Knowledge Base association
CREATE TABLE IF NOT EXISTS "_AskSessionKnowledgeBases" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "_AskSessionKnowledgeBases_AB_unique" ON "_AskSessionKnowledgeBases"("A", "B");
CREATE INDEX IF NOT EXISTS "_AskSessionKnowledgeBases_B_index" ON "_AskSessionKnowledgeBases"("B");

DO $$ BEGIN
    ALTER TABLE "_AskSessionKnowledgeBases" ADD CONSTRAINT "_AskSessionKnowledgeBases_A_fkey"
        FOREIGN KEY ("A") REFERENCES "ask_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "_AskSessionKnowledgeBases" ADD CONSTRAINT "_AskSessionKnowledgeBases_B_fkey"
        FOREIGN KEY ("B") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============ Step 9: Add search_priority to research_projects ============

ALTER TABLE "research_projects" ADD COLUMN IF NOT EXISTS "search_priority" "SearchPriority" NOT NULL DEFAULT 'BALANCED';
