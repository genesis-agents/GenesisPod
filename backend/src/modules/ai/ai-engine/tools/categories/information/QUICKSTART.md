# RAG 向量检索工具 - 快速开始指南

## 前置要求

- PostgreSQL 数据库 (推荐 14+)
- Node.js 环境
- OpenAI API Key

## 5 分钟快速设置

### 1. 安装 pgvector 扩展

#### Ubuntu/Debian

```bash
sudo apt install postgresql-14-pgvector
```

#### macOS

```bash
brew install pgvector
```

#### Docker

```bash
# 使用包含 pgvector 的镜像
docker run -d \
  --name postgres-pgvector \
  -e POSTGRES_PASSWORD=yourpassword \
  -p 5432:5432 \
  ankane/pgvector
```

### 2. 配置环境变量

在 `.env` 文件中添加：

```bash
# OpenAI API Key
OPENAI_API_KEY=sk-your-api-key-here

# 数据库连接（如果尚未配置）
DATABASE_URL=postgresql://user:password@localhost:5432/deepdive
```

### 3. 运行数据库迁移

```bash
cd backend
npx prisma migrate deploy
```

或手动执行迁移：

```bash
psql -U your_user -d deepdive < prisma/migrations/20251218_add_rag_vector_tables/migration.sql
```

### 4. 验证设置

连接到数据库并检查：

```sql
-- 检查 pgvector 扩展
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 检查表是否创建
\dt chunks
\dt embeddings

-- 检查向量索引
\di embeddings_vector_idx
```

## 基本使用

### 示例 1: 处理单个文档

```typescript
import { DocumentProcessorService } from "./information/document-processor.example";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ConfigService } from "@nestjs/config";

// 初始化服务
const prisma = new PrismaService();
const config = new ConfigService();
const processor = new DocumentProcessorService(prisma, config);

// 处理文档
const result = await processor.processDocument(
  "resource-uuid-here",
  `
    机器学习是人工智能的一个分支，它使计算机能够从数据中学习并改进。
    深度学习是机器学习的子领域，使用多层神经网络来处理复杂的模式识别任务。
    常见的应用包括图像识别、自然语言处理和语音识别等。
  `,
  {
    chunkSize: 500, // 每块约 500 字符
    chunkOverlap: 50, // 块之间重叠 50 字符
    batchSize: 20, // 批量处理 20 个块
  },
);

console.log(`创建了 ${result.chunksCreated} 个文本块`);
console.log(`生成了 ${result.embeddingsCreated} 个向量`);
```

### 示例 2: 执行语义搜索

```typescript
import { RAGSearchTool } from "./information/rag-search.tool";

// 初始化工具
const ragTool = new RAGSearchTool(prisma, config);

// 搜索
const searchResult = await ragTool.execute(
  {
    query: "什么是深度学习？",
    topK: 3,
    threshold: 0.7,
  },
  {
    taskId: "task-123",
    userId: "user-456",
  },
);

// 查看结果
if (searchResult.success && searchResult.data) {
  searchResult.data.results.forEach((result, index) => {
    console.log(`\n结果 ${index + 1}:`);
    console.log(`相似度: ${result.score.toFixed(3)}`);
    console.log(`标题: ${result.metadata.title}`);
    console.log(`内容: ${result.content.substring(0, 100)}...`);
  });
}
```

### 示例 3: 高级过滤搜索

```typescript
const advancedResult = await ragTool.execute(
  {
    query: "神经网络的应用",
    topK: 5,
    threshold: 0.75,
    filters: {
      resourceTypes: ["PAPER", "BLOG"],
      dateRange: {
        start: "2024-01-01T00:00:00Z",
        end: "2024-12-31T23:59:59Z",
      },
      tags: ["AI", "machine-learning"],
    },
  },
  context,
);
```

## 测试流程

### 1. 准备测试数据

```typescript
// 创建测试资源
const testResource = await prisma.resource.create({
  data: {
    type: "BLOG",
    title: "机器学习入门",
    abstract: "本文介绍机器学习的基础知识",
    content: "完整的文章内容...",
    sourceUrl: "https://example.com/ml-intro",
  },
});

// 处理文档
await processor.processDocument(
  testResource.id,
  testResource.content || testResource.abstract || "",
);
```

### 2. 执行测试搜索

```typescript
const tests = [
  { query: "什么是机器学习？", expected: "should find ML content" },
  { query: "深度学习应用", expected: "should find DL applications" },
  { query: "神经网络", expected: "should find neural network info" },
];

for (const test of tests) {
  const result = await ragTool.execute({ query: test.query, topK: 3 }, context);

  console.log(`\n查询: ${test.query}`);
  console.log(`找到 ${result.data?.totalResults || 0} 个结果`);
  console.log(`期望: ${test.expected}`);
}
```

## 常见问题

### Q1: 如何处理已存在的资源？

```typescript
// 批量处理所有资源
const resources = await prisma.resource.findMany({
  where: {
    content: { not: null },
  },
  take: 100,
});

for (const resource of resources) {
  try {
    await processor.processDocument(
      resource.id,
      resource.content || resource.abstract || "",
      { skipIfExists: true }, // 跳过已处理的
    );
  } catch (error) {
    console.error(`处理 ${resource.id} 失败:`, error);
  }
}
```

### Q2: 如何查看向量数据？

```sql
-- 查看文本块
SELECT id, resource_id, position, LEFT(content, 50) as preview
FROM chunks
LIMIT 10;

-- 查看向量维度
SELECT
  chunk_id,
  array_length(vector, 1) as dimension,
  model
FROM embeddings
LIMIT 5;

-- 统计数据
SELECT
  COUNT(*) as total_chunks,
  COUNT(DISTINCT resource_id) as total_resources
FROM chunks;
```

### Q3: 如何清理测试数据？

```typescript
// 删除特定资源的向量数据
await processor.deleteDocumentChunks("resource-id-here");

// 或使用 SQL 清理所有数据
await prisma.$executeRaw`TRUNCATE chunks, embeddings CASCADE`;
```

### Q4: 搜索结果为空怎么办？

1. 检查是否有数据：

```sql
SELECT COUNT(*) FROM chunks;
SELECT COUNT(*) FROM embeddings;
```

2. 降低相似度阈值：

```typescript
await ragTool.execute(
  { query: "test", threshold: 0.5 }, // 降低到 0.5
  context,
);
```

3. 检查用户权限：确保用户有权访问相关资源

## 性能监控

### 监控查询性能

```typescript
const start = Date.now();
const result = await ragTool.execute({ query: "test" }, context);
const duration = Date.now() - start;

console.log(`查询耗时: ${duration}ms`);
console.log(`向量维度: ${result.data?.embeddingDimension}`);
console.log(`结果数量: ${result.data?.totalResults}`);
```

### 查看数据库性能

```sql
-- 查看索引使用情况
EXPLAIN ANALYZE
SELECT * FROM embeddings
ORDER BY vector <=> '[0.1, 0.2, ...]'::vector
LIMIT 5;

-- 查看表大小
SELECT
  pg_size_pretty(pg_total_relation_size('chunks')) as chunks_size,
  pg_size_pretty(pg_total_relation_size('embeddings')) as embeddings_size;
```

## 下一步

1. 阅读完整文档: [README.md](./README.md)
2. 查看处理器示例: [document-processor.example.ts](./document-processor.example.ts)
3. 了解工具实现: [rag-search.tool.ts](./rag-search.tool.ts)

## 获取帮助

如遇到问题，请检查：

1. 日志输出（Logger 会记录详细信息）
2. 数据库连接和权限
3. OpenAI API Key 配置
4. pgvector 扩展是否正确安装

祝你使用愉快！🚀
