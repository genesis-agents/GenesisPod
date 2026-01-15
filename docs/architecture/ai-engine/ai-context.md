# AI上下文增强架构设计文档

## 1. 概述

本文档定义了DeepDive Engine中AI助手上下文增强的统一架构，确保AI能够基于不同类型资源（论文、开源项目、新闻、视频）的关键数据提供精准回答。

## 2. 设计原则

### 2.1 核心原则

- **类型感知**: AI必须知道它正在处理什么类型的资源
- **数据完整性**: 提供所有可用的关键元数据
- **上下文优先级**: 核心内容 > 元数据 > 统计数据
- **扩展性**: 新资源类型可轻松集成

### 2.2 数据分层

```
Layer 1: 资源类型标识
Layer 2: 核心内容（PDF文本/代码/正文/字幕）
Layer 3: 关键元数据（作者/发布时间/来源等）
Layer 4: 统计数据（点赞/浏览/评论等）
Layer 5: 关联数据（标签/分类/关键词等）
```

## 3. 不同资源类型的上下文策略

### 3.1 学术论文 (PAPER)

#### 关键数据

```typescript
{
  resourceType: "PAPER",
  core: {
    pdfFullText: string,      // 前15000字符
    abstract: string,          // 完整摘要
  },
  metadata: {
    title: string,
    authors: string[],         // 作者列表
    publishedAt: date,         // 发表日期
    venue: string,             // 期刊/会议名称
    doi: string,               // DOI标识
    arxivId: string,           // arXiv ID
  },
  metrics: {
    citationCount: number,     // 引用次数
    qualityScore: number,      // 质量评分
    upvotes: number,
    views: number,
  },
  taxonomy: {
    categories: string[],      // 学科分类
    keywords: string[],        // 关键词
    tags: string[],
  }
}
```

#### 上下文模板

```
=== RESOURCE TYPE: Academic Paper ===

CORE CONTENT:
Title: {title}
Authors: {authors}
Published: {date} in {venue}
DOI: {doi} | arXiv: {arxivId}

ABSTRACT:
{abstract}

PDF FULL TEXT (first 15,000 chars):
{pdfText}

METADATA:
Categories: {categories}
Keywords: {keywords}
Quality Score: {score}/10
Impact: {citations} citations, {upvotes} upvotes, {views} views

SOURCE: {sourceUrl}
```

### 3.2 开源项目 (PROJECT / GITHUB)

#### 关键数据

```typescript
{
  resourceType: "PROJECT",
  core: {
    readme: string,            // README全文
    description: string,       // 项目描述
    mainCode: string[],        // 关键代码文件（可选）
  },
  metadata: {
    title: string,             // 项目名称
    owner: string,             // 作者/组织
    repository: string,        // 仓库名
    language: string,          // 主要编程语言
    license: string,           // 开源协议
    createdAt: date,
    lastUpdated: date,
  },
  metrics: {
    stars: number,             // GitHub stars
    forks: number,
    issues: number,
    contributors: number,
    upvotes: number,
    views: number,
  },
  taxonomy: {
    topics: string[],          // GitHub topics
    tags: string[],
    categories: string[],
  }
}
```

#### 上下文模板

```
=== RESOURCE TYPE: Open Source Project ===

CORE INFO:
Project: {owner}/{repository}
Language: {language}
License: {license}
Created: {createdAt} | Last Updated: {lastUpdated}

DESCRIPTION:
{description}

README CONTENT:
{readme}

REPOSITORY STATS:
⭐ {stars} stars | 🍴 {forks} forks
📊 {contributors} contributors | 🐛 {issues} open issues
👁️ {views} views | 👍 {upvotes} upvotes

TOPICS: {topics}
CATEGORIES: {categories}

SOURCE: {repositoryUrl}
```

### 3.3 新闻文章 (NEWS)

#### 关键数据

```typescript
{
  resourceType: "NEWS",
  core: {
    fullText: string,          // 新闻全文
    summary: string,           // 摘要
  },
  metadata: {
    title: string,
    author: string,            // 作者/记者
    publisher: string,         // 媒体机构
    publishedAt: date,
    section: string,           // 版块（科技/财经等）
  },
  metrics: {
    readTime: number,          // 阅读时长（分钟）
    upvotes: number,
    views: number,
    shares: number,            // 分享次数
  },
  taxonomy: {
    categories: string[],
    tags: string[],
    relatedTopics: string[],
  }
}
```

#### 上下文模板

```
=== RESOURCE TYPE: News Article ===

HEADLINE: {title}
Author: {author} | Publisher: {publisher}
Published: {date} | Section: {section}
Reading Time: ~{readTime} minutes

SUMMARY:
{summary}

FULL ARTICLE:
{fullText}

ENGAGEMENT:
{views} views | {upvotes} upvotes | {shares} shares

TOPICS: {topics}
CATEGORIES: {categories}

SOURCE: {articleUrl}
```

### 3.4 视频内容 (YOUTUBE_VIDEO)

#### 关键数据

```typescript
{
  resourceType: "VIDEO",
  core: {
    transcript: string,        // 字幕/转录文本
    description: string,       // 视频描述
    chapters: Array<{          // 章节信息
      timestamp: string,
      title: string,
    }>,
  },
  metadata: {
    title: string,
    channel: string,           // 频道名称
    channelId: string,
    creator: string,           // 创作者
    publishedAt: date,
    duration: string,          // 时长
    language: string,
  },
  metrics: {
    views: number,
    likes: number,
    comments: number,
    subscribers: number,       // 频道订阅数
    upvotes: number,           // 系统内点赞
  },
  taxonomy: {
    categories: string[],
    tags: string[],
    topics: string[],
  }
}
```

#### 上下文模板

```
=== RESOURCE TYPE: Video Content ===

VIDEO: {title}
Channel: {channel} ({subscribers} subscribers)
Creator: {creator}
Published: {date}
Duration: {duration} | Language: {language}

DESCRIPTION:
{description}

CHAPTERS:
{chapters}

VIDEO TRANSCRIPT:
{transcript}

ENGAGEMENT:
👁️ {views} views | 👍 {likes} likes | 💬 {comments} comments
⭐ {upvotes} upvotes (internal)

TOPICS: {topics}
CATEGORIES: {categories}

SOURCE: {videoUrl}
```

## 4. 实现架构

### 4.1 前端架构

```typescript
// frontend/lib/ai-context-builder.ts

interface ResourceContextConfig {
  includeCore: boolean;
  includeMetadata: boolean;
  includeMetrics: boolean;
  includeTaxonomy: boolean;
  maxContentLength: number;
}

class AIContextBuilder {
  // 主入口：根据资源类型构建上下文
  static buildContext(
    resource: Resource,
    config: ResourceContextConfig = DEFAULT_CONFIG,
  ): string {
    const builder = this.getBuilderForType(resource.type);
    return builder.build(resource, config);
  }

  // 获取对应资源类型的构建器
  private static getBuilderForType(type: ResourceType): ContextBuilder {
    switch (type) {
      case "PAPER":
        return new PaperContextBuilder();
      case "PROJECT":
        return new ProjectContextBuilder();
      case "NEWS":
        return new NewsContextBuilder();
      case "YOUTUBE_VIDEO":
        return new VideoContextBuilder();
      default:
        return new GenericContextBuilder();
    }
  }
}

// 基础构建器接口
interface ContextBuilder {
  build(resource: Resource, config: ResourceContextConfig): string;
}

// 论文上下文构建器
class PaperContextBuilder implements ContextBuilder {
  build(resource: PaperResource, config: ResourceContextConfig): string {
    const sections = [];

    // Header
    sections.push(`=== RESOURCE TYPE: Academic Paper ===\n`);

    // Core content
    if (config.includeCore) {
      sections.push(this.buildCoreSection(resource));
    }

    // Metadata
    if (config.includeMetadata) {
      sections.push(this.buildMetadataSection(resource));
    }

    // Metrics
    if (config.includeMetrics) {
      sections.push(this.buildMetricsSection(resource));
    }

    // Taxonomy
    if (config.includeTaxonomy) {
      sections.push(this.buildTaxonomySection(resource));
    }

    return sections.join("\n\n");
  }

  private buildCoreSection(resource: PaperResource): string {
    const parts = [];
    parts.push(`TITLE: ${resource.title}`);

    if (resource.abstract) {
      parts.push(`\nABSTRACT:\n${resource.abstract}`);
    }

    if (resource.pdfText) {
      const truncated = resource.pdfText.substring(0, 15000);
      parts.push(
        `\nPDF FULL TEXT (first ${truncated.length} chars):\n${truncated}`,
      );
    }

    return parts.join("\n");
  }

  // 其他辅助方法...
}
```

### 4.2 使用示例

```typescript
// frontend/app/page.tsx 中使用

import { AIContextBuilder } from "@/lib/ai-context-builder";

const handleSendMessage = async () => {
  // 构建上下文
  const context = AIContextBuilder.buildContext(selectedResource, {
    includeCore: true,
    includeMetadata: true,
    includeMetrics: true,
    includeTaxonomy: true,
    maxContentLength: 15000,
  });

  // 发送给AI
  const response = await fetch("/api/ai-service/ai/chat", {
    method: "POST",
    body: JSON.stringify({
      message: userInput,
      context: context,
      model: "grok",
    }),
  });
};
```

## 5. 实施计划

### Phase 1: 基础架构 (已完成✓)

- [x] 论文PDF文本提取
- [x] 论文元数据集成
- [x] 动态导入PDF.js

### Phase 2: 扩展其他资源类型 (计划中)

- [ ] 创建 AIContextBuilder 统一接口
- [ ] 实现 ProjectContextBuilder（开源项目）
- [ ] 实现 NewsContextBuilder（新闻文章）
- [ ] 实现 VideoContextBuilder（视频内容）

### Phase 3: 数据增强

- [ ] GitHub API集成（获取README、stars等）
- [ ] YouTube API集成（获取字幕、描述等）
- [ ] 网页正文提取（新闻全文）

### Phase 4: 优化与测试

- [ ] 上下文长度优化（根据token限制智能截断）
- [ ] A/B测试不同上下文策略
- [ ] 用户反馈收集

## 6. 性能考虑

### 6.1 缓存策略

- 资源上下文缓存（避免重复构建）
- PDF文本提取缓存
- API调用缓存（GitHub/YouTube）

### 6.2 异步加载

- PDF文本异步提取
- 外部API异步调用
- 渐进式上下文加载

### 6.3 Token管理

- 根据AI模型限制智能截断
- 核心内容优先原则
- 动态调整上下文长度

## 7. 监控与分析

### 7.1 指标

- 上下文构建时间
- AI响应质量评分
- 用户满意度
- Token使用量

### 7.2 日志

- 记录每次上下文构建的配置
- 记录提取失败的资源
- A/B测试结果追踪

## 8. 安全与隐私

- 不在上下文中包含敏感信息
- 遵守内容使用政策
- 用户可选择上下文详细程度

---

**文档版本**: v1.0
**最后更新**: 2025-01-14
**负责人**: 产品 + 技术架构
**状态**: Phase 1 完成，Phase 2 设计中
