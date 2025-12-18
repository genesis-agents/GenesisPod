-- ============================================================================
-- RAG Vector Search Tables
-- 添加向量检索所需的表和索引
-- ============================================================================

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 创建文本块表
CREATE TABLE IF NOT EXISTS chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position INT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. 创建向量表
-- 使用 text-embedding-3-small 模型，向量维度为 1536
CREATE TABLE IF NOT EXISTS embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  vector vector(1536) NOT NULL,
  model VARCHAR(50) DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 4. 创建索引

-- chunks 表索引
CREATE INDEX IF NOT EXISTS idx_chunks_resource_id ON chunks(resource_id);
CREATE INDEX IF NOT EXISTS idx_chunks_position ON chunks(resource_id, position);
CREATE INDEX IF NOT EXISTS idx_chunks_created_at ON chunks(created_at DESC);

-- embeddings 表索引
CREATE INDEX IF NOT EXISTS idx_embeddings_chunk_id ON embeddings(chunk_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_chunk_model ON embeddings(chunk_id, model);

-- 5. 创建向量相似度搜索索引
-- 使用 IVFFlat 算法，余弦距离
-- lists 参数建议设置为 sqrt(rows)，这里使用 100 作为初始值
-- 注意：此索引需要在有一定数据量后创建，否则会报错
-- 如果数据量较小，可以先注释掉此索引，等数据增长后再创建
CREATE INDEX IF NOT EXISTS embeddings_vector_idx ON embeddings
USING ivfflat (vector vector_cosine_ops)
WITH (lists = 100);

-- 6. 添加注释
COMMENT ON TABLE chunks IS '文本块表 - 存储分块后的文档内容';
COMMENT ON TABLE embeddings IS '向量表 - 存储文本块的向量表示';
COMMENT ON COLUMN chunks.resource_id IS '关联的资源ID';
COMMENT ON COLUMN chunks.content IS '文本块内容';
COMMENT ON COLUMN chunks.position IS '在文档中的位置（从0开始）';
COMMENT ON COLUMN chunks.metadata IS '元数据，如字符数、单词数等';
COMMENT ON COLUMN embeddings.chunk_id IS '关联的文本块ID';
COMMENT ON COLUMN embeddings.vector IS '1536维向量（text-embedding-3-small）';
COMMENT ON COLUMN embeddings.model IS '使用的 embedding 模型名称';
