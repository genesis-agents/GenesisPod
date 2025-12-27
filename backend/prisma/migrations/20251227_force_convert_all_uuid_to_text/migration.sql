-- FORCE MIGRATION: Convert ALL UUID columns to TEXT across all RAG and related tables
-- This migration ensures complete consistency between database and Prisma schema
-- Prisma uses String type which maps to TEXT, not UUID

-- ============================================================
-- STEP 1: Drop ALL foreign key constraints that might reference UUID columns
-- ============================================================

-- Knowledge Base related FKs
ALTER TABLE "knowledge_bases" DROP CONSTRAINT IF EXISTS "knowledge_bases_user_id_fkey";
ALTER TABLE "knowledge_bases" DROP CONSTRAINT IF EXISTS "knowledge_bases_google_drive_connection_id_fkey";

-- Knowledge Base Documents FKs
ALTER TABLE "knowledge_base_documents" DROP CONSTRAINT IF EXISTS "knowledge_base_documents_knowledge_base_id_fkey";

-- Parent Chunks FKs
ALTER TABLE "parent_chunks" DROP CONSTRAINT IF EXISTS "parent_chunks_document_id_fkey";

-- Child Chunks FKs
ALTER TABLE "child_chunks" DROP CONSTRAINT IF EXISTS "child_chunks_parent_chunk_id_fkey";
ALTER TABLE "child_chunks" DROP CONSTRAINT IF EXISTS "child_chunks_document_id_fkey";

-- Child Embeddings FKs
ALTER TABLE "child_embeddings" DROP CONSTRAINT IF EXISTS "child_embeddings_child_chunk_id_fkey";

-- Knowledge Base Members FKs
ALTER TABLE "knowledge_base_members" DROP CONSTRAINT IF EXISTS "knowledge_base_members_knowledge_base_id_fkey";
ALTER TABLE "knowledge_base_members" DROP CONSTRAINT IF EXISTS "knowledge_base_members_user_id_fkey";

-- Knowledge Base Sources FKs (if exists)
DO $$ BEGIN
    ALTER TABLE "knowledge_base_sources" DROP CONSTRAINT IF EXISTS "knowledge_base_sources_knowledge_base_id_fkey";
    ALTER TABLE "knowledge_base_sources" DROP CONSTRAINT IF EXISTS "knowledge_base_sources_data_source_id_fkey";
EXCEPTION WHEN undefined_table THEN null; END $$;

-- User Data Sources FKs (if exists)
DO $$ BEGIN
    ALTER TABLE "user_data_sources" DROP CONSTRAINT IF EXISTS "user_data_sources_user_id_fkey";
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Google Drive related FKs
DO $$ BEGIN
    ALTER TABLE "google_drive_connections" DROP CONSTRAINT IF EXISTS "google_drive_connections_user_id_fkey";
    ALTER TABLE "google_drive_sync_history" DROP CONSTRAINT IF EXISTS "google_drive_sync_history_connection_id_fkey";
    ALTER TABLE "google_drive_imported_files" DROP CONSTRAINT IF EXISTS "google_drive_imported_files_connection_id_fkey";
    ALTER TABLE "google_drive_imported_files" DROP CONSTRAINT IF EXISTS "google_drive_imported_files_resource_id_fkey";
EXCEPTION WHEN undefined_table THEN null; END $$;

-- ============================================================
-- STEP 2: Convert ALL columns to TEXT type
-- ============================================================

-- Function to safely convert column type
CREATE OR REPLACE FUNCTION safe_convert_to_text(p_table text, p_column text) RETURNS void AS $$
DECLARE
    col_type text;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = p_table AND column_name = p_column;

    IF col_type IS NOT NULL AND col_type != 'text' THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE text USING %I::text', p_table, p_column, p_column);
        RAISE NOTICE 'Converted %.% from % to text', p_table, p_column, col_type;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Convert users table
SELECT safe_convert_to_text('users', 'id');

-- Convert knowledge_bases table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('knowledge_bases', 'id');
    PERFORM safe_convert_to_text('knowledge_bases', 'user_id');
    PERFORM safe_convert_to_text('knowledge_bases', 'team_id');
    PERFORM safe_convert_to_text('knowledge_bases', 'google_drive_connection_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert knowledge_base_documents table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('knowledge_base_documents', 'id');
    PERFORM safe_convert_to_text('knowledge_base_documents', 'knowledge_base_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert parent_chunks table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('parent_chunks', 'id');
    PERFORM safe_convert_to_text('parent_chunks', 'document_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert child_chunks table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('child_chunks', 'id');
    PERFORM safe_convert_to_text('child_chunks', 'parent_chunk_id');
    PERFORM safe_convert_to_text('child_chunks', 'document_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert child_embeddings table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('child_embeddings', 'id');
    PERFORM safe_convert_to_text('child_embeddings', 'child_chunk_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert knowledge_base_members table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('knowledge_base_members', 'id');
    PERFORM safe_convert_to_text('knowledge_base_members', 'knowledge_base_id');
    PERFORM safe_convert_to_text('knowledge_base_members', 'user_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert knowledge_base_sources table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('knowledge_base_sources', 'id');
    PERFORM safe_convert_to_text('knowledge_base_sources', 'knowledge_base_id');
    PERFORM safe_convert_to_text('knowledge_base_sources', 'data_source_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert user_data_sources table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('user_data_sources', 'id');
    PERFORM safe_convert_to_text('user_data_sources', 'user_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert google_drive_connections table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('google_drive_connections', 'id');
    PERFORM safe_convert_to_text('google_drive_connections', 'user_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert google_drive_sync_history table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('google_drive_sync_history', 'id');
    PERFORM safe_convert_to_text('google_drive_sync_history', 'connection_id');
    PERFORM safe_convert_to_text('google_drive_sync_history', 'resource_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Convert google_drive_imported_files table (if exists)
DO $$ BEGIN
    PERFORM safe_convert_to_text('google_drive_imported_files', 'id');
    PERFORM safe_convert_to_text('google_drive_imported_files', 'connection_id');
    PERFORM safe_convert_to_text('google_drive_imported_files', 'resource_id');
EXCEPTION WHEN undefined_table THEN null; END $$;

-- Drop the helper function
DROP FUNCTION IF EXISTS safe_convert_to_text(text, text);

-- ============================================================
-- STEP 3: Re-add ALL foreign key constraints with TEXT types
-- ============================================================

-- Knowledge bases -> users
DO $$ BEGIN
    ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Knowledge bases -> google_drive_connections (optional FK)
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'google_drive_connections') THEN
        ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_google_drive_connection_id_fkey"
            FOREIGN KEY ("google_drive_connection_id") REFERENCES "google_drive_connections"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Knowledge base documents -> knowledge_bases
DO $$ BEGIN
    ALTER TABLE "knowledge_base_documents" ADD CONSTRAINT "knowledge_base_documents_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Parent chunks -> knowledge_base_documents
DO $$ BEGIN
    ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "knowledge_base_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Child chunks -> parent_chunks
DO $$ BEGIN
    ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_parent_chunk_id_fkey"
        FOREIGN KEY ("parent_chunk_id") REFERENCES "parent_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Child embeddings -> child_chunks
DO $$ BEGIN
    ALTER TABLE "child_embeddings" ADD CONSTRAINT "child_embeddings_child_chunk_id_fkey"
        FOREIGN KEY ("child_chunk_id") REFERENCES "child_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Knowledge base members -> knowledge_bases
DO $$ BEGIN
    ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Knowledge base members -> users
DO $$ BEGIN
    ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Knowledge base sources -> knowledge_bases
DO $$ BEGIN
    ALTER TABLE "knowledge_base_sources" ADD CONSTRAINT "knowledge_base_sources_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Knowledge base sources -> user_data_sources
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_data_sources') THEN
        ALTER TABLE "knowledge_base_sources" ADD CONSTRAINT "knowledge_base_sources_data_source_id_fkey"
            FOREIGN KEY ("data_source_id") REFERENCES "user_data_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- User data sources -> users
DO $$ BEGIN
    ALTER TABLE "user_data_sources" ADD CONSTRAINT "user_data_sources_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Google Drive connections -> users
DO $$ BEGIN
    ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Google Drive sync history -> google_drive_connections
DO $$ BEGIN
    ALTER TABLE "google_drive_sync_history" ADD CONSTRAINT "google_drive_sync_history_connection_id_fkey"
        FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

-- Google Drive imported files -> google_drive_connections
DO $$ BEGIN
    ALTER TABLE "google_drive_imported_files" ADD CONSTRAINT "google_drive_imported_files_connection_id_fkey"
        FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_table THEN null; END $$;

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
          AND table_name IN (
            'users', 'knowledge_bases', 'knowledge_base_documents',
            'parent_chunks', 'child_chunks', 'child_embeddings',
            'knowledge_base_members', 'knowledge_base_sources',
            'user_data_sources', 'google_drive_connections',
            'google_drive_sync_history', 'google_drive_imported_files'
          )
          AND column_name IN ('id', 'user_id', 'knowledge_base_id', 'document_id',
                              'parent_chunk_id', 'child_chunk_id', 'connection_id',
                              'data_source_id', 'google_drive_connection_id', 'team_id', 'resource_id')
        ORDER BY table_name, column_name
    LOOP
        RAISE NOTICE '%.%: %', r.table_name, r.column_name, r.data_type;
    END LOOP;
END $$;
