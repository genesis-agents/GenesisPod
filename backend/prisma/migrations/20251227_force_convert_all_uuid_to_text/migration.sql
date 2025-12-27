-- FORCE MIGRATION: Convert ALL UUID columns to TEXT across all RAG and related tables
-- This migration ensures complete consistency between database and Prisma schema
-- Prisma uses String type which maps to TEXT, not UUID

-- ============================================================
-- STEP 1: Drop ALL foreign key constraints that might reference UUID columns
-- ============================================================

ALTER TABLE "knowledge_bases" DROP CONSTRAINT IF EXISTS "knowledge_bases_user_id_fkey";
ALTER TABLE "knowledge_bases" DROP CONSTRAINT IF EXISTS "knowledge_bases_google_drive_connection_id_fkey";
ALTER TABLE "knowledge_base_documents" DROP CONSTRAINT IF EXISTS "knowledge_base_documents_knowledge_base_id_fkey";
ALTER TABLE "parent_chunks" DROP CONSTRAINT IF EXISTS "parent_chunks_document_id_fkey";
ALTER TABLE "child_chunks" DROP CONSTRAINT IF EXISTS "child_chunks_parent_chunk_id_fkey";
ALTER TABLE "child_chunks" DROP CONSTRAINT IF EXISTS "child_chunks_document_id_fkey";
ALTER TABLE "child_embeddings" DROP CONSTRAINT IF EXISTS "child_embeddings_child_chunk_id_fkey";
ALTER TABLE "knowledge_base_members" DROP CONSTRAINT IF EXISTS "knowledge_base_members_knowledge_base_id_fkey";
ALTER TABLE "knowledge_base_members" DROP CONSTRAINT IF EXISTS "knowledge_base_members_user_id_fkey";

-- ============================================================
-- STEP 2: Convert ALL columns to TEXT type using DO blocks
-- ============================================================

-- Convert users.id
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text;
        RAISE NOTICE 'Converted users.id from uuid to text';
    END IF;
END $$;

-- Convert knowledge_bases columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_bases' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_bases" ALTER COLUMN "id" TYPE text USING "id"::text;
        RAISE NOTICE 'Converted knowledge_bases.id from uuid to text';
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_bases' AND column_name = 'user_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_bases" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
        RAISE NOTICE 'Converted knowledge_bases.user_id from uuid to text';
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Convert knowledge_base_documents columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_documents' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_documents" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_documents' AND column_name = 'knowledge_base_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_documents" ALTER COLUMN "knowledge_base_id" TYPE text USING "knowledge_base_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Convert parent_chunks columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'parent_chunks' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "parent_chunks" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'parent_chunks' AND column_name = 'document_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "parent_chunks" ALTER COLUMN "document_id" TYPE text USING "document_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Convert child_chunks columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'child_chunks' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "child_chunks" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'child_chunks' AND column_name = 'parent_chunk_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "child_chunks" ALTER COLUMN "parent_chunk_id" TYPE text USING "parent_chunk_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Convert child_embeddings columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'child_embeddings' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "child_embeddings" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'child_embeddings' AND column_name = 'child_chunk_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "child_embeddings" ALTER COLUMN "child_chunk_id" TYPE text USING "child_chunk_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Convert knowledge_base_members columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_members' AND column_name = 'id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_members" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_members' AND column_name = 'knowledge_base_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_members" ALTER COLUMN "knowledge_base_id" TYPE text USING "knowledge_base_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_members' AND column_name = 'user_id';
    IF col_type IS NOT NULL AND col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_members" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- STEP 3: Re-add ALL foreign key constraints with TEXT types
-- ============================================================

DO $$ BEGIN
    ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "knowledge_base_documents" ADD CONSTRAINT "knowledge_base_documents_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "knowledge_base_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_parent_chunk_id_fkey"
        FOREIGN KEY ("parent_chunk_id") REFERENCES "parent_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "child_embeddings" ADD CONSTRAINT "child_embeddings_child_chunk_id_fkey"
        FOREIGN KEY ("child_chunk_id") REFERENCES "child_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- STEP 4: Log final column types for verification
-- ============================================================
DO $$
DECLARE
    r RECORD;
BEGIN
    RAISE NOTICE '=== Final Column Types After Conversion ===';
    FOR r IN
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('users', 'knowledge_bases', 'knowledge_base_documents',
                             'parent_chunks', 'child_chunks', 'child_embeddings', 'knowledge_base_members')
          AND column_name IN ('id', 'user_id', 'knowledge_base_id', 'document_id',
                              'parent_chunk_id', 'child_chunk_id')
        ORDER BY table_name, column_name
    LOOP
        RAISE NOTICE '%.%: %', r.table_name, r.column_name, r.data_type;
    END LOOP;
END $$;
