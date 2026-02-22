-- Migration: 20260222_pgvector
-- 将 ChildEmbedding 和 TopicMessageEmbedding 的 embedding 字段
-- 从 JSONB 迁移到 pgvector vector(1536) 类型，并创建 HNSW 余弦索引

-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 迁移 ChildEmbedding（JSONB 数组 → vector 类型）
ALTER TABLE "child_embeddings"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING (embedding::text::vector(1536));

-- 迁移 TopicMessageEmbedding（JSONB 数组 → vector 类型）
ALTER TABLE "topic_message_embeddings"
  ALTER COLUMN "embedding" TYPE vector(1536)
  USING (embedding::text::vector(1536));

-- HNSW 余弦相似度索引
-- 注意：PostgreSQL 不允许在事务中使用 CREATE INDEX CONCURRENTLY，
-- 此处去掉 CONCURRENTLY，迁移期间会短暂锁表（可接受），
-- 若需要零停机索引构建，请在迁移执行完成后单独运行 scripts/create-vector-indexes.sql
CREATE INDEX IF NOT EXISTS child_embeddings_hnsw_idx
  ON "child_embeddings" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS topic_msg_embeddings_hnsw_idx
  ON "topic_message_embeddings" USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
