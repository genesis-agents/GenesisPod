-- FORCE MIGRATION: Convert ALL UUID columns to TEXT across all RAG and related tables
-- This migration ONLY converts types, does NOT add FK constraints
-- FK constraints are handled by deploy-migrations.ts Step 14

-- ============================================================
-- STEP 1: Drop ALL foreign key constraints
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
-- STEP 2: Convert ALL UUID columns to TEXT type
-- ============================================================

-- Convert users.id
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'id';
    IF col_type = 'uuid' THEN
        ALTER TABLE "users" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
END $$;

-- Convert knowledge_bases columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_bases' AND column_name = 'id';
    IF col_type = 'uuid' THEN
        ALTER TABLE "knowledge_bases" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_bases' AND column_name = 'user_id';
    IF col_type = 'uuid' THEN
        ALTER TABLE "knowledge_bases" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- Convert knowledge_base_documents columns
DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_documents' AND column_name = 'id';
    IF col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_documents" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_documents' AND column_name = 'knowledge_base_id';
    IF col_type = 'uuid' THEN
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
    IF col_type = 'uuid' THEN
        ALTER TABLE "parent_chunks" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'parent_chunks' AND column_name = 'document_id';
    IF col_type = 'uuid' THEN
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
    IF col_type = 'uuid' THEN
        ALTER TABLE "child_chunks" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'child_chunks' AND column_name = 'parent_chunk_id';
    IF col_type = 'uuid' THEN
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
    IF col_type = 'uuid' THEN
        ALTER TABLE "child_embeddings" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'child_embeddings' AND column_name = 'child_chunk_id';
    IF col_type = 'uuid' THEN
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
    IF col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_members" ALTER COLUMN "id" TYPE text USING "id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_members' AND column_name = 'knowledge_base_id';
    IF col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_members" ALTER COLUMN "knowledge_base_id" TYPE text USING "knowledge_base_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
DECLARE col_type text;
BEGIN
    SELECT data_type INTO col_type FROM information_schema.columns
    WHERE table_name = 'knowledge_base_members' AND column_name = 'user_id';
    IF col_type = 'uuid' THEN
        ALTER TABLE "knowledge_base_members" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
    END IF;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

-- ============================================================
-- NOTE: FK constraints will be added by deploy-migrations.ts Step 14
-- after all types are verified to be TEXT
-- ============================================================
