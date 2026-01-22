# HackerNews Search Tool

HackerNews 搜索工具 - 搜索技术社区讨论和新闻。

## 功能概述

- 搜索 HackerNews 的文章、讨论和项目
- 支持按类型过滤（story, show_hn, ask_hn 等）
- 支持按点赞数和时间过滤
- 无需 API Key（使用 Algolia HN Search API）

## API 信息

- **Endpoint**: `https://hn.algolia.com/api/v1/search`
- **认证**: 无需 API Key
- **限速**: 无官方限制（建议 1 req/s）
- **文档**: https://hn.algolia.com/api

## 工具配置

### Tool ID

```
hackernews-search
```

### 输入参数

```typescript
interface HackerNewsSearchInput {
  query: string; // 搜索查询（必需）
  maxResults?: number; // 最大结果数，默认 20
  tags?: "story" | "comment" | "poll" | "show_hn" | "ask_hn";
  numericFilters?: string; // 如 'points>100' 或 'created_at_i>1577836800'
}
```

### 输出格式

```typescript
interface HackerNewsSearchOutput {
  success: boolean;
  hits: Array<{
    objectID: string;
    title: string;
    url: string | null;
    author: string;
    points: number;
    numComments: number;
    createdAt: string;
    storyText: string | null;
    hnUrl: string;
  }>;
  totalHits: number;
  query: string;
  error?: string;
}
```

## 使用示例

### 基本搜索

```typescript
const result = await hackerNewsSearchTool.execute(
  {
    query: "AI agents",
    maxResults: 20,
  },
  context,
);
```

### 搜索 Show HN 项目

```typescript
const result = await hackerNewsSearchTool.execute(
  {
    query: "web framework",
    maxResults: 10,
    tags: "show_hn",
  },
  context,
);
```

### 按点赞数过滤

```typescript
const result = await hackerNewsSearchTool.execute(
  {
    query: "kubernetes",
    maxResults: 15,
    numericFilters: "points>100",
  },
  context,
);
```

### 按时间过滤（最近一周）

```typescript
const oneWeekAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
const result = await hackerNewsSearchTool.execute(
  {
    query: "startup",
    maxResults: 20,
    numericFilters: `created_at_i>${oneWeekAgo}`,
  },
  context,
);
```

## Topic Research 集成

该工具已集成到 Topic Research 的数据源路由系统中。

### 在研究维度中启用

在创建研究维度时，将 `hackernews` 添加到 `searchSources` 数组中：

```json
{
  "name": "技术趋势",
  "searchSources": ["web", "hackernews", "academic"],
  "searchQueries": ["AI technology trends"]
}
```

### 数据源优先级

在 Topic Research 中，HackerNews 数据的可信度评分为 75（满分 100），适合：

- 技术趋势研究
- 开源项目调研
- 技术社区观点收集
- 技术新闻和讨论

## 注意事项

1. **无 API Key**: 该工具使用 Algolia 的公开 HN Search API，无需配置 API Key
2. **限速建议**: 虽然没有官方限速，建议保持合理的请求频率（约 1 req/s）
3. **内容类型**:
   - `story`: 普通文章和链接
   - `show_hn`: 展示项目
   - `ask_hn`: 提问讨论
   - `comment`: 评论
   - `poll`: 投票

## 相关文件

- 工具实现: `hackernews-search.tool.ts`
- 数据源集成: `backend/src/modules/ai-app/research/topic-research/services/data-source-router.service.ts`
- 数据源类型: `backend/src/modules/ai-app/research/topic-research/types/data-source.types.ts`

## 更新日志

- **2026-01-21**: 初始实现，集成到 Topic Research 数据源系统
