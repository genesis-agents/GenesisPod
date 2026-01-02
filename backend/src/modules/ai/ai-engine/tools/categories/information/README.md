# RAG 向量检索工具

## 概述

RAG (Retrieval-Augmented Generation) 搜索工具实现了基于语义相似度的向量检索功能，允许 AI Agent 从知识库中查找与查询最相关的文档片段。

## 功能特性

- **语义搜索**: 基于 OpenAI embeddings 的向量相似度搜索
- **灵活过滤**: 支持按集合、资源、类型、日期、标签过滤
- **高效检索**: 使用 pgvector 扩展实现高性能向量搜索
- **权限控制**: 仅搜索用户有权访问的资源
- **可配置**: 支持自定义 topK、相似度阈值等参数

## 使用示例

### 基本用法

```typescript
import { RAGSearchTool } from "./information/rag-search.tool";

// 创建工具实例
const ragTool = new RAGSearchTool(prismaService, configService);

// 执行搜索
const result = await ragTool.execute(
  {
    query: "什么是机器学习？",
    topK: 5,
    threshold: 0.7,
  },
  {
    taskId: "task-123",
    userId: "user-456",
  },
);

console.log(result.data.results);
```

### 高级用法

```typescript
// 在特定集合中搜索
const result = await ragTool.execute(
  {
    query: "深度学习最新进展",
    collectionId: "collection-abc",
    topK: 10,
    threshold: 0.75,
    filters: {
      resourceTypes: ["PAPER", "BLOG"],
      dateRange: {
        start: "2024-01-01T00:00:00Z",
        end: "2024-12-31T23:59:59Z",
      },
      tags: ["AI", "deep-learning"],
    },
  },
  context,
);
```

## 数据库设置

### 前置条件

1. PostgreSQL 数据库（推荐 14+）
2. pgvector 扩展

### 安装 pgvector

```bash
# Ubuntu/Debian
sudo apt install postgresql-14-pgvector

# macOS
brew install pgvector

# Docker
# 使用 pgvector 镜像
docker pull ankane/pgvector
```

### 数据库迁移

创建以下数据库迁移文件：

#### 1. 启用 pgvector 扩展

```sql
-- migration: 001_enable_pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 2. 创建 chunks 表

```sql
-- migration: 002_create_chunks_table.sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id UUID NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  position INT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_chunks_resource_id ON chunks(resource_id);
CREATE INDEX idx_chunks_position ON chunks(resource_id, position);
```

#### 3. 创建 embeddings 表

```sql
-- migration: 003_create_embeddings_table.sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  vector vector(1536) NOT NULL,  -- text-embedding-3-small 维度
  model VARCHAR(50) DEFAULT 'text-embedding-3-small',
  created_at TIMESTAMP DEFAULT NOW()
);

-- 向量索引 (使用 IVFFlat 算法)
-- lists 参数建议设置为 rows / 1000
-- 对于小数据集可以用 100，大数据集建议调整
CREATE INDEX embeddings_vector_idx ON embeddings
USING ivfflat (vector vector_cosine_ops)
WITH (lists = 100);

-- 外键索引
CREATE INDEX idx_embeddings_chunk_id ON embeddings(chunk_id);
CREATE UNIQUE INDEX idx_embeddings_chunk_model ON embeddings(chunk_id, model);
```

### Prisma Schema 更新

在 `prisma/schema.prisma` 中添加：

```prisma
model Chunk {
  id         String   @id @default(uuid())
  resourceId String   @map("resource_id")
  content    String   @db.Text
  position   Int
  metadata   Json     @default("{}")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  resource   Resource    @relation(fields: [resourceId], references: [id], onDelete: Cascade)
  embeddings Embedding[]

  @@index([resourceId])
  @@index([resourceId, position])
  @@map("chunks")
}

model Embedding {
  id        String   @id @default(uuid())
  chunkId   String   @map("chunk_id")
  vector    String   @db.Text // 存储为字符串，在查询时转换
  model     String   @default("text-embedding-3-small") @db.VarChar(50)
  createdAt DateTime @default(now()) @map("created_at")

  chunk Chunk @relation(fields: [chunkId], references: [id], onDelete: Cascade)

  @@unique([chunkId, model])
  @@index([chunkId])
  @@map("embeddings")
}
```

注意：Prisma 目前不直接支持 pgvector 类型，因此我们使用 `@db.Text` 存储向量字符串，在原生 SQL 查询时转换为 vector 类型。

## 文档分块和向量化

在使用 RAG 搜索之前，需要对文档进行分块和向量化：

### 示例：文档处理流程

```typescript
import OpenAI from "openai";

class DocumentProcessor {
  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * 将文档分块
   */
  chunkDocument(content: string, chunkSize = 500, overlap = 50): string[] {
    const chunks: string[] = [];
    const sentences = content.split(/[。！？\n]+/);

    let currentChunk = "";

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > chunkSize && currentChunk) {
        chunks.push(currentChunk.trim());
        // 保留最后几个字符作为重叠
        currentChunk = currentChunk.slice(-overlap) + sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * 生成向量
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    return response.data[0].embedding;
  }

  /**
   * 处理并存储文档
   */
  async processDocument(resourceId: string, content: string) {
    // 1. 分块
    const chunks = this.chunkDocument(content);

    // 2. 为每个块生成向量并存储
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];

      // 创建 chunk
      const chunk = await prisma.chunk.create({
        data: {
          resourceId,
          content: chunkText,
          position: i,
          metadata: {
            length: chunkText.length,
            words: chunkText.split(/\s+/).length,
          },
        },
      });

      // 生成向量
      const vector = await this.generateEmbedding(chunkText);
      const vectorString = `[${vector.join(",")}]`;

      // 使用原生 SQL 插入向量
      await prisma.$executeRaw`
        INSERT INTO embeddings (chunk_id, vector, model)
        VALUES (${chunk.id}::uuid, ${vectorString}::vector, 'text-embedding-3-small')
      `;
    }
  }
}
```

## 配置

### 环境变量

确保在 `.env` 文件中配置：

```bash
# OpenAI API Key (用于生成 embeddings)
OPENAI_API_KEY=sk-...

# 数据库连接
DATABASE_URL=postgresql://user:password@localhost:5432/deepdive
```

## 性能优化

### 1. 向量索引优化

根据数据量调整 IVFFlat 索引的 `lists` 参数：

```sql
-- 小数据集 (< 100K 条)
CREATE INDEX ... WITH (lists = 100);

-- 中等数据集 (100K - 1M 条)
CREATE INDEX ... WITH (lists = 1000);

-- 大数据集 (> 1M 条)
CREATE INDEX ... WITH (lists = 5000);
```

### 2. 批量向量化

对于大量文档，使用批量处理：

```typescript
async function batchGenerateEmbeddings(texts: string[]): Promise<number[][]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts, // 支持批量输入
  });

  return response.data.map((item) => item.embedding);
}
```

### 3. 缓存查询向量

对于重复查询，可以缓存查询向量：

```typescript
const queryCache = new Map<string, number[]>();

async function getCachedEmbedding(query: string): Promise<number[]> {
  if (queryCache.has(query)) {
    return queryCache.get(query)!;
  }

  const embedding = await generateEmbedding(query);
  queryCache.set(query, embedding);

  return embedding;
}
```

## 故障排查

### 问题 1: pgvector 扩展未安装

**错误**:

```
ERROR: extension "vector" does not exist
```

**解决方案**:

```sql
CREATE EXTENSION vector;
```

如果仍然失败，确保已安装 pgvector 扩展包。

### 问题 2: 向量维度不匹配

**错误**:

```
ERROR: vector dimension mismatch
```

**解决方案**: 确保所有向量都是 1536 维（text-embedding-3-small 的维度）。

### 问题 3: 表不存在

**错误**:

```
RAG 数据库表尚未创建
```

**解决方案**: 运行上述数据库迁移创建 chunks 和 embeddings 表。

## API 参考

### RAGSearchInput

| 字段         | 类型     | 必填 | 说明                           |
| ------------ | -------- | ---- | ------------------------------ |
| query        | string   | 是   | 搜索查询文本                   |
| collectionId | string   | 否   | 限定在特定集合内搜索           |
| resourceIds  | string[] | 否   | 限定在特定资源内搜索           |
| topK         | number   | 否   | 返回结果数量 (默认 5, 最大 20) |
| threshold    | number   | 否   | 相似度阈值 (0-1, 默认 0.7)     |
| filters      | object   | 否   | 额外过滤条件                   |

### RAGSearchOutput

| 字段               | 类型                  | 说明         |
| ------------------ | --------------------- | ------------ |
| results            | RAGSearchResultItem[] | 搜索结果列表 |
| success            | boolean               | 是否成功     |
| totalResults       | number                | 结果总数     |
| embeddingDimension | number                | 向量维度     |

### RAGSearchResultItem

| 字段       | 类型   | 说明             |
| ---------- | ------ | ---------------- |
| resourceId | string | 资源ID           |
| chunkId    | string | 文本块ID         |
| content    | string | 文本内容         |
| score      | number | 相似度分数 (0-1) |
| metadata   | object | 包含资源元信息   |

## 最佳实践

1. **合理设置 chunk 大小**: 建议 300-500 字符，保留 10% 重叠
2. **定期更新索引**: 添加大量数据后重建向量索引
3. **监控成本**: OpenAI embeddings API 按 token 计费
4. **实现缓存**: 缓存常见查询的结果
5. **异步处理**: 文档向量化应该异步后台处理

## 相关链接

- [pgvector 文档](https://github.com/pgvector/pgvector)
- [OpenAI Embeddings API](https://platform.openai.com/docs/guides/embeddings)
- [Prisma Raw Queries](https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access)
