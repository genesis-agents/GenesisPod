# ArXiv Search Tool

ArXiv 学术搜索工具，用于搜索计算机科学、物理学、数学等领域的学术论文预印本。

## 基本信息

- **工具 ID**: `arxiv-search`
- **分类**: `information`
- **数据源**: [arxiv.org](https://arxiv.org)
- **API 文档**: https://info.arxiv.org/help/api/index.html
- **认证**: 无需 API Key（公开免费）
- **限速**: 3 requests/second（自动处理）

## 输入参数

```typescript
interface ArxivSearchInput {
  query: string; // 必填：搜索查询
  maxResults?: number; // 可选：最大结果数，默认 10，最大 100
  category?: string; // 可选：arXiv 分类过滤
  sortBy?: "relevance" | "lastUpdatedDate" | "submittedDate"; // 可选：排序方式
}
```

### 查询语法

- **关键词搜索**: `"machine learning"`
- **作者搜索**: `"au:Hinton"`
- **标题搜索**: `"ti:transformer"`
- **摘要搜索**: `"abs:attention mechanism"`
- **组合搜索**: `"machine learning AND au:Bengio"`

### 常用分类

| 分类代码  | 领域           |
| --------- | -------------- |
| `cs.AI`   | 人工智能       |
| `cs.LG`   | 机器学习       |
| `cs.CV`   | 计算机视觉     |
| `cs.CL`   | 计算语言学     |
| `cs.NE`   | 神经与进化计算 |
| `cs.RO`   | 机器人学       |
| `stat.ML` | 统计机器学习   |
| `math.OC` | 优化与控制     |

## 输出格式

```typescript
interface ArxivSearchOutput {
  success: boolean;
  papers: Array<{
    id: string; // arXiv ID，如 "2301.12345"
    title: string;
    authors: string[];
    abstract: string;
    categories: string[];
    publishedDate: string;
    updatedDate: string;
    pdfUrl: string;
    arxivUrl: string;
  }>;
  totalResults: number;
  query: string;
  error?: string;
}
```

## 使用示例

### 1. 基本关键词搜索

```typescript
const result = await arxivSearchTool.execute(
  {
    query: "transformer attention mechanism",
    maxResults: 10,
  },
  context,
);
```

### 2. 按分类过滤

```typescript
const result = await arxivSearchTool.execute(
  {
    query: "reinforcement learning",
    category: "cs.LG",
    maxResults: 20,
    sortBy: "submittedDate",
  },
  context,
);
```

### 3. 搜索特定作者

```typescript
const result = await arxivSearchTool.execute(
  {
    query: "au:Yoshua Bengio",
    category: "cs.AI",
    maxResults: 15,
  },
  context,
);
```

### 4. 高级组合搜索

```typescript
const result = await arxivSearchTool.execute(
  {
    query: "ti:GPT AND abs:language model",
    sortBy: "relevance",
    maxResults: 50,
  },
  context,
);
```

## 应用场景

### 1. Topic Research

在深度研究任务中搜索学术文献：

```typescript
// Topic Research Agent 使用示例
const papers = await toolRegistry.executeTool("arxiv-search", {
  query: `${topicKeywords} AND cat:cs.AI`,
  maxResults: 30,
  sortBy: "relevance",
});

// 提取论文信息用于文献综述
const references = papers.data.papers.map((paper) => ({
  title: paper.title,
  authors: paper.authors.join(", "),
  year: new Date(paper.publishedDate).getFullYear(),
  url: paper.arxivUrl,
}));
```

### 2. 文献综述

收集特定主题的最新研究：

```typescript
const recentPapers = await arxivSearchTool.execute(
  {
    query: "large language models",
    category: "cs.CL",
    sortBy: "submittedDate",
    maxResults: 50,
  },
  context,
);
```

### 3. 技术追踪

追踪特定技术的发展：

```typescript
const visionTransformerPapers = await arxivSearchTool.execute(
  {
    query: "vision transformer",
    category: "cs.CV",
    sortBy: "lastUpdatedDate",
    maxResults: 30,
  },
  context,
);
```

## 错误处理

工具内置了完善的错误处理：

- **网络错误**: 自动捕获并返回错误信息
- **限速保护**: 自动实施 3 req/s 限速
- **XML 解析错误**: 捕获并记录详细错误
- **超时保护**: 30 秒超时限制

## 注意事项

1. **限速要求**: ArXiv API 限制为 3 requests/second，工具已自动处理
2. **结果数量**: 单次请求最多返回 100 篇论文
3. **搜索精度**: 使用精确的查询语法可以提高搜索准确性
4. **分类过滤**: 使用 `category` 参数可以大幅提升搜索相关性
5. **日期排序**: 追踪最新研究时使用 `sortBy: "submittedDate"`

## 技术实现

- **HTTP 客户端**: 使用 PolicyDataService 统一管理
- **XML 解析**: 使用 xml2js 解析 Atom XML 格式
- **限速机制**: 内置请求间隔控制（350ms）
- **错误恢复**: 完整的 try-catch 和日志记录

## 相关工具

- `federal-register`: 政策法规搜索
- `congress-gov`: 国会立法搜索
- `hackernews-search`: 技术新闻搜索
- `web-search`: 通用网页搜索

## 维护记录

- **2026-01-21**: 创建 ArxivSearchTool，支持基本搜索和分类过滤
