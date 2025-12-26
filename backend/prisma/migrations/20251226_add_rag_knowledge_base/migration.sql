-- RAG Knowledge Base Migration
-- Enables pgvector for vector similarity search and creates RAG tables
-- Uses TEXT for IDs to match Prisma schema (String type)

-- Enable pgvector extension (required for vector embeddings)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enums
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KnowledgeBaseStatus') THEN
        CREATE TYPE "KnowledgeBaseStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'UPDATING', 'ERROR');
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'KnowledgeBaseSourceType') THEN
        CREATE TYPE "KnowledgeBaseSourceType" AS ENUM ('GOOGLE_DRIVE', 'MANUAL', 'URL');
    END IF;
END $$;

-- Create knowledge_bases table
CREATE TABLE IF NOT EXISTS "knowledge_bases" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "source_type" "KnowledgeBaseSourceType" NOT NULL DEFAULT 'MANUAL',
    "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'PENDING',
    "user_id" TEXT NOT NULL,
    "google_drive_connection_id" TEXT,
    "google_drive_folder_ids" JSONB NOT NULL DEFAULT '[]',
    "last_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- Create knowledge_base_documents table
CREATE TABLE IF NOT EXISTS "knowledge_base_documents" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "knowledge_base_id" TEXT NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(255),
    "source_url" TEXT,
    "mime_type" VARCHAR(100),
    "raw_content" TEXT NOT NULL,
    "status" "KnowledgeBaseStatus" NOT NULL DEFAULT 'PENDING',
    "processed_at" TIMESTAMP(3),
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_base_documents_pkey" PRIMARY KEY ("id")
);

-- Create parent_chunks table
CREATE TABLE IF NOT EXISTS "parent_chunks" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "document_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "page_start" INTEGER,
    "page_end" INTEGER,
    "section_title" VARCHAR(500),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_chunks_pkey" PRIMARY KEY ("id")
);

-- Create child_chunks table
CREATE TABLE IF NOT EXISTS "child_chunks" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "parent_chunk_id" TEXT NOT NULL,
    "document_id" TEXT,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_chunks_pkey" PRIMARY KEY ("id")
);

-- Create child_embeddings table with pgvector column
CREATE TABLE IF NOT EXISTS "child_embeddings" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "child_chunk_id" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
    "dimensions" INTEGER NOT NULL DEFAULT 1536,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "child_embeddings_pkey" PRIMARY KEY ("id")
);

-- Add foreign key constraints (except google_drive which may not exist yet)
DO $$ BEGIN
    ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Note: google_drive_connection_id_fkey will be added in deploy-migrations.ts Step 9.5
-- after google_drive_connections table is confirmed to exist

DO $$ BEGIN
    ALTER TABLE "knowledge_base_documents" ADD CONSTRAINT "knowledge_base_documents_knowledge_base_id_fkey"
        FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "parent_chunks" ADD CONSTRAINT "parent_chunks_document_id_fkey"
        FOREIGN KEY ("document_id") REFERENCES "knowledge_base_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "child_chunks" ADD CONSTRAINT "child_chunks_parent_chunk_id_fkey"
        FOREIGN KEY ("parent_chunk_id") REFERENCES "parent_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "child_embeddings" ADD CONSTRAINT "child_embeddings_child_chunk_id_fkey"
        FOREIGN KEY ("child_chunk_id") REFERENCES "child_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Create indexes for knowledge_bases
CREATE INDEX IF NOT EXISTS "knowledge_bases_user_id_idx" ON "knowledge_bases"("user_id");
CREATE INDEX IF NOT EXISTS "knowledge_bases_status_idx" ON "knowledge_bases"("status");
CREATE INDEX IF NOT EXISTS "knowledge_bases_google_drive_connection_id_idx" ON "knowledge_bases"("google_drive_connection_id");

-- Create indexes for knowledge_base_documents
CREATE INDEX IF NOT EXISTS "knowledge_base_documents_knowledge_base_id_idx" ON "knowledge_base_documents"("knowledge_base_id");
CREATE INDEX IF NOT EXISTS "knowledge_base_documents_source_id_idx" ON "knowledge_base_documents"("source_id");
CREATE INDEX IF NOT EXISTS "knowledge_base_documents_status_idx" ON "knowledge_base_documents"("status");

-- Create indexes for parent_chunks
CREATE INDEX IF NOT EXISTS "parent_chunks_document_id_idx" ON "parent_chunks"("document_id");

-- Create indexes for child_chunks
CREATE INDEX IF NOT EXISTS "child_chunks_parent_chunk_id_idx" ON "child_chunks"("parent_chunk_id");
CREATE INDEX IF NOT EXISTS "child_chunks_document_id_idx" ON "child_chunks"("document_id");

-- Create indexes for child_embeddings
CREATE INDEX IF NOT EXISTS "child_embeddings_child_chunk_id_idx" ON "child_embeddings"("child_chunk_id");

-- Create vector similarity index using IVFFlat for approximate nearest neighbor search
-- Note: This index works best after data is loaded. For empty table, use HNSW instead.
DO $$ BEGIN
    CREATE INDEX "child_embeddings_embedding_idx" ON "child_embeddings"
        USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
EXCEPTION WHEN duplicate_table THEN null; END $$;

-- Add tsvector column for full-text search on child_chunks
ALTER TABLE "child_chunks" ADD COLUMN IF NOT EXISTS "content_tsv" tsvector
    GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;

-- Create GIN index for full-text search
CREATE INDEX IF NOT EXISTS "child_chunks_content_tsv_idx" ON "child_chunks" USING GIN ("content_tsv");

-- Create a function for hybrid search using RRF (Reciprocal Rank Fusion)
CREATE OR REPLACE FUNCTION hybrid_search(
    query_embedding vector(1536),
    query_text text,
    kb_ids text[],
    match_count int DEFAULT 10,
    alpha float DEFAULT 0.5  -- 0 = keyword only, 1 = vector only
)
RETURNS TABLE (
    child_chunk_id text,
    parent_chunk_id text,
    document_id text,
    child_content text,
    parent_content text,
    rrf_score float,
    vector_rank int,
    keyword_rank int
) AS $$
WITH vector_results AS (
    SELECT
        ce.child_chunk_id,
        cc.parent_chunk_id,
        pc.document_id,
        cc.content as child_content,
        pc.content as parent_content,
        ROW_NUMBER() OVER (ORDER BY ce.embedding <=> query_embedding) as rank
    FROM child_embeddings ce
    JOIN child_chunks cc ON ce.child_chunk_id = cc.id
    JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
    JOIN knowledge_base_documents d ON pc.document_id = d.id
    WHERE d.knowledge_base_id = ANY(kb_ids)
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count * 3
),
keyword_results AS (
    SELECT
        cc.id as child_chunk_id,
        cc.parent_chunk_id,
        pc.document_id,
        cc.content as child_content,
        pc.content as parent_content,
        ROW_NUMBER() OVER (ORDER BY ts_rank(cc.content_tsv, plainto_tsquery('english', query_text)) DESC) as rank
    FROM child_chunks cc
    JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
    JOIN knowledge_base_documents d ON pc.document_id = d.id
    WHERE d.knowledge_base_id = ANY(kb_ids)
      AND cc.content_tsv @@ plainto_tsquery('english', query_text)
    ORDER BY ts_rank(cc.content_tsv, plainto_tsquery('english', query_text)) DESC
    LIMIT match_count * 3
),
combined AS (
    SELECT
        COALESCE(v.child_chunk_id, k.child_chunk_id) as child_chunk_id,
        COALESCE(v.parent_chunk_id, k.parent_chunk_id) as parent_chunk_id,
        COALESCE(v.document_id, k.document_id) as document_id,
        COALESCE(v.child_content, k.child_content) as child_content,
        COALESCE(v.parent_content, k.parent_content) as parent_content,
        v.rank as vector_rank,
        k.rank as keyword_rank,
        -- RRF formula: score = sum(1 / (k + rank)) for each result set
        COALESCE(alpha / (60 + v.rank), 0) + COALESCE((1 - alpha) / (60 + k.rank), 0) as rrf_score
    FROM vector_results v
    FULL OUTER JOIN keyword_results k ON v.child_chunk_id = k.child_chunk_id
)
SELECT
    combined.child_chunk_id,
    combined.parent_chunk_id,
    combined.document_id,
    combined.child_content,
    combined.parent_content,
    combined.rrf_score,
    combined.vector_rank::int,
    combined.keyword_rank::int
FROM combined
ORDER BY combined.rrf_score DESC
LIMIT match_count;
$$ LANGUAGE SQL STABLE;

-- Create a simpler function for pure vector search
CREATE OR REPLACE FUNCTION vector_search(
    query_embedding vector(1536),
    kb_ids text[],
    match_count int DEFAULT 10
)
RETURNS TABLE (
    child_chunk_id text,
    parent_chunk_id text,
    document_id text,
    child_content text,
    parent_content text,
    distance float
) AS $$
    SELECT
        ce.child_chunk_id,
        cc.parent_chunk_id,
        pc.document_id,
        cc.content as child_content,
        pc.content as parent_content,
        ce.embedding <=> query_embedding as distance
    FROM child_embeddings ce
    JOIN child_chunks cc ON ce.child_chunk_id = cc.id
    JOIN parent_chunks pc ON cc.parent_chunk_id = pc.id
    JOIN knowledge_base_documents d ON pc.document_id = d.id
    WHERE d.knowledge_base_id = ANY(kb_ids)
    ORDER BY ce.embedding <=> query_embedding
    LIMIT match_count;
$$ LANGUAGE SQL STABLE;
