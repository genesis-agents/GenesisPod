# AI Studio v3.1 完整实施计划

## 文档信息

| 项目           | 说明                                               |
| -------------- | -------------------------------------------------- |
| **项目名称**   | AI Studio - 科技深度洞察工作台                     |
| **PRD 版本**   | v3.1                                               |
| **创建日期**   | 2025-11-28                                         |
| **总工期**     | 6 周                                               |
| **关键里程碑** | P0 修复(1周) → P1 核心功能(2周) → P2 体验增强(3周) |

---

## 一、现状分析

### 1.1 已实现功能

| 模块           | 状态        | 代码位置                                |
| -------------- | ----------- | --------------------------------------- |
| AI Office 布局 | ✅ 完成     | `frontend/components/ai-office/layout/` |
| 资源管理基础   | ✅ 完成     | `frontend/stores/aiOfficeStore.ts`      |
| AI 对话        | ✅ 完成     | `frontend/components/ai-office/chat/`   |
| 文档导出       | ✅ 完成     | PPT/Word/Markdown                       |
| 数据采集框架   | ⚠️ 存在问题 | `backend/src/modules/data-collection/`  |
| 知识图谱模型   | ⚠️ 仅模型   | `backend/prisma/schema.prisma`          |

### 1.2 核心问题（P0 紧急）

根据用户测试反馈，存在以下致命问题：

| 问题                                  | 严重程度 | 影响             |
| ------------------------------------- | -------- | ---------------- |
| `data_collection_raw_data` 信息不完整 | 🔴 致命  | 无法生成有效洞察 |
| RawData 缺少 Resource 引用            | 🔴 致命  | 数据孤岛         |
| `resource-xxx` 大量重复               | 🔴 致命  | 数据质量差       |
| 资源元数据不全                        | 🟡 严重  | 影响分析质量     |

---

## 二、实施阶段划分

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AI Studio v3.1 实施路线图                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Week 1          Week 2-3           Week 4-5          Week 6            │
│  ┌─────┐        ┌─────────┐        ┌─────────┐       ┌─────┐           │
│  │ P0  │───────▶│   P1    │───────▶│   P2    │──────▶│测试 │           │
│  │修复 │        │核心功能 │        │体验增强 │       │上线 │           │
│  └─────┘        └─────────┘        └─────────┘       └─────┘           │
│                                                                         │
│  - 资源去重      - 趋势报告         - 知识图谱        - E2E 测试        │
│  - 数据完整性    - 技术对比         - Focus Modes     - 性能优化        │
│  - RAG优化       - Command Palette  - 成熟度评估      - 文档完善        │
│                  - 研究计划可视化                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 三、P0 阶段：紧急修复（Week 1）

### 3.1 任务分解

| ID   | 任务                      | 负责   | 工作量 | 依赖      |
| ---- | ------------------------- | ------ | ------ | --------- |
| P0-1 | 资源去重管道实现          | 后端   | 2d     | -         |
| P0-2 | RawData-Resource 关系修复 | 后端   | 1d     | -         |
| P0-3 | 资源元数据补全            | 后端   | 1d     | P0-2      |
| P0-4 | RAG 引用精确化            | AI服务 | 2d     | P0-3      |
| P0-5 | 数据清洗脚本              | 后端   | 1d     | P0-1,P0-2 |

### 3.2 技术设计：资源去重管道

#### 3.2.1 架构设计

```
┌─────────────────────────────────────────────────────────────────┐
│                      资源去重管道 (Deduplication Pipeline)        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  新资源输入                                                      │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ 1. URL 规范化   │  去除 utm_*, 统一协议, 处理重定向            │
│  └────────┬────────┘                                            │
│           │                                                     │
│           ▼                                                     │
│  ┌─────────────────┐                                            │
│  │ 2. 精确匹配检查 │  基于 normalizedUrl 的精确查询               │
│  └────────┬────────┘                                            │
│           │                                                     │
│      ┌────┴────┐                                                │
│      │ 存在?   │                                                │
│      └────┬────┘                                                │
│     Yes   │   No                                                │
│      │    └──────────────────┐                                  │
│      ▼                       ▼                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ 返回已存在资源  │  │ 3. 内容指纹计算 │  SimHash 算法           │
│  └─────────────────┘  └────────┬────────┘                       │
│                                │                                │
│                                ▼                                │
│                       ┌─────────────────┐                       │
│                       │ 4. 相似度检索   │  向量数据库查询          │
│                       └────────┬────────┘                       │
│                                │                                │
│                           ┌────┴────┐                           │
│                           │相似度>85%│                           │
│                           └────┬────┘                           │
│                          Yes   │   No                           │
│                           │    └──────────────────┐             │
│                           ▼                       ▼             │
│                    ┌─────────────────┐    ┌─────────────────┐   │
│                    │ 5. 合并策略    │    │ 6. 创建新资源   │   │
│                    │ (保留更完整的) │    │ + 计算质量分   │   │
│                    └─────────────────┘    └─────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 3.2.2 代码实现

**文件**: `backend/src/modules/resources/deduplication.service.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { simhash } from "simhash-js";
import { URL } from "url";

export interface DeduplicationResult {
  isDuplicate: boolean;
  existingResourceId?: string;
  similarity?: number;
  action: "created" | "merged" | "skipped";
}

export interface QualityAssessment {
  sourceCredibility: number; // 0-100
  contentCompleteness: number; // 0-100
  freshnessScore: number; // 0-100
  citationCount: number;
  overallScore: number; // 加权平均
}

@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 1. URL 规范化
   */
  normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);

      // 移除追踪参数
      const trackingParams = [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "ref",
        "source",
      ];
      trackingParams.forEach((param) => parsed.searchParams.delete(param));

      // 统一协议为 https
      parsed.protocol = "https:";

      // 移除尾部斜杠
      let normalized = parsed.toString();
      if (normalized.endsWith("/")) {
        normalized = normalized.slice(0, -1);
      }

      // 处理特定平台的 URL 规范化
      normalized = this.normalizePlatformUrl(normalized);

      return normalized;
    } catch (error) {
      this.logger.warn(`URL normalization failed: ${url}`, error);
      return url;
    }
  }

  /**
   * 平台特定 URL 规范化
   */
  private normalizePlatformUrl(url: string): string {
    // arXiv: 统一为 abs 格式
    if (url.includes("arxiv.org")) {
      const arxivMatch = url.match(/arxiv\.org\/(?:abs|pdf)\/(\d+\.\d+)/);
      if (arxivMatch) {
        return `https://arxiv.org/abs/${arxivMatch[1]}`;
      }
    }

    // GitHub: 移除 tree/branch 部分，保留仓库主页
    if (
      url.includes("github.com") &&
      !url.includes("/blob/") &&
      !url.includes("/tree/")
    ) {
      const ghMatch = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (ghMatch) {
        return `https://github.com/${ghMatch[1]}/${ghMatch[2]}`;
      }
    }

    return url;
  }

  /**
   * 2. 计算内容指纹 (SimHash)
   */
  computeFingerprint(content: string): string {
    if (!content || content.length < 50) {
      return "";
    }

    // 预处理：移除标点、转小写、分词
    const normalized = content
      .toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fa5]/g, " ") // 保留中英文
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .join(" ");

    const hash = simhash(normalized);
    return hash.toString(16);
  }

  /**
   * 3. 计算 SimHash 相似度 (汉明距离)
   */
  calculateSimilarity(hash1: string, hash2: string): number {
    if (!hash1 || !hash2) return 0;

    const h1 = BigInt("0x" + hash1);
    const h2 = BigInt("0x" + hash2);
    const xor = h1 ^ h2;

    // 计算汉明距离
    let distance = 0;
    let val = xor;
    while (val > 0n) {
      distance += Number(val & 1n);
      val >>= 1n;
    }

    // 64位 SimHash，相似度 = 1 - distance/64
    return 1 - distance / 64;
  }

  /**
   * 4. 检查重复
   */
  async checkDuplicate(
    url: string,
    content: string,
    threshold: number = 0.85,
  ): Promise<DeduplicationResult> {
    const normalizedUrl = this.normalizeUrl(url);

    // 4.1 精确 URL 匹配
    const exactMatch = await this.prisma.resource.findFirst({
      where: {
        OR: [{ sourceUrl: normalizedUrl }, { sourceUrl: url }],
      },
    });

    if (exactMatch) {
      return {
        isDuplicate: true,
        existingResourceId: exactMatch.id,
        similarity: 1.0,
        action: "skipped",
      };
    }

    // 4.2 内容相似度检查
    if (content && content.length >= 50) {
      const fingerprint = this.computeFingerprint(content);

      // 查找相似资源（最近 1000 条）
      const recentResources = await this.prisma.resource.findMany({
        where: {
          contentFingerprint: { not: null },
        },
        select: {
          id: true,
          contentFingerprint: true,
          title: true,
        },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });

      for (const resource of recentResources) {
        if (resource.contentFingerprint) {
          const similarity = this.calculateSimilarity(
            fingerprint,
            resource.contentFingerprint,
          );
          if (similarity >= threshold) {
            this.logger.log(
              `Found similar resource: ${resource.title} (similarity: ${similarity})`,
            );
            return {
              isDuplicate: true,
              existingResourceId: resource.id,
              similarity,
              action: "merged",
            };
          }
        }
      }
    }

    return {
      isDuplicate: false,
      action: "created",
    };
  }

  /**
   * 5. 资源质量评估
   */
  assessQuality(resource: {
    source: string;
    content?: string;
    citationCount?: number;
    publishedAt?: Date;
    hasAbstract?: boolean;
    hasFullText?: boolean;
  }): QualityAssessment {
    // 来源可信度
    const sourceCredibilityMap: Record<string, number> = {
      arxiv: 95,
      github: 85,
      semantic_scholar: 90,
      hackernews: 70,
      techcrunch: 75,
      medium: 60,
      blog: 50,
      unknown: 30,
    };
    const sourceCredibility = sourceCredibilityMap[resource.source] || 30;

    // 内容完整度
    let contentCompleteness = 0;
    if (resource.hasAbstract) contentCompleteness += 30;
    if (resource.hasFullText) contentCompleteness += 40;
    if (resource.content && resource.content.length > 1000)
      contentCompleteness += 30;

    // 新鲜度 (30天内 100分，逐渐衰减)
    let freshnessScore = 50;
    if (resource.publishedAt) {
      const daysSincePublished =
        (Date.now() - resource.publishedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePublished <= 7) freshnessScore = 100;
      else if (daysSincePublished <= 30) freshnessScore = 90;
      else if (daysSincePublished <= 90) freshnessScore = 70;
      else if (daysSincePublished <= 365) freshnessScore = 50;
      else freshnessScore = 30;
    }

    // 引用数
    const citationCount = resource.citationCount || 0;

    // 综合评分 (加权平均)
    const overallScore = Math.round(
      sourceCredibility * 0.3 +
        contentCompleteness * 0.3 +
        freshnessScore * 0.2 +
        Math.min(citationCount / 10, 100) * 0.2,
    );

    return {
      sourceCredibility,
      contentCompleteness,
      freshnessScore,
      citationCount,
      overallScore,
    };
  }

  /**
   * 6. 合并策略：保留更完整的资源
   */
  async mergeResources(
    existingId: string,
    newData: Partial<{
      title: string;
      content: string;
      aiSummary: string;
      metadata: Record<string, any>;
    }>,
  ): Promise<void> {
    const existing = await this.prisma.resource.findUnique({
      where: { id: existingId },
    });

    if (!existing) return;

    const updates: Record<string, any> = {};

    // 保留更长的标题
    if (
      newData.title &&
      (!existing.title || newData.title.length > existing.title.length)
    ) {
      updates.title = newData.title;
    }

    // 保留更长的内容
    if (
      newData.content &&
      (!existing.content ||
        newData.content.length > (existing.content?.length || 0))
    ) {
      updates.content = newData.content;
    }

    // 保留更长的摘要
    if (
      newData.aiSummary &&
      (!existing.aiSummary ||
        newData.aiSummary.length > existing.aiSummary.length)
    ) {
      updates.aiSummary = newData.aiSummary;
    }

    // 合并元数据
    if (newData.metadata) {
      updates.metadata = {
        ...((existing.metadata as Record<string, any>) || {}),
        ...newData.metadata,
      };
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.resource.update({
        where: { id: existingId },
        data: updates,
      });
      this.logger.log(`Merged resource: ${existingId}`);
    }
  }
}
```

#### 3.2.3 数据库 Schema 更新

**文件**: `backend/prisma/schema.prisma` (增量修改)

```prisma
model Resource {
  // ... 现有字段 ...

  // 新增：去重相关字段
  normalizedUrl      String?   @map("normalized_url")
  contentFingerprint String?   @map("content_fingerprint")

  // 新增：质量评估字段
  qualityScore       Int?      @map("quality_score")       // 0-100
  sourceCredibility  Int?      @map("source_credibility")  // 0-100
  contentCompleteness Int?     @map("content_completeness") // 0-100
  freshnessScore     Int?      @map("freshness_score")      // 0-100

  // 新增：科技洞察相关字段
  citationCount      Int?      @map("citation_count")
  influenceScore     Int?      @map("influence_score")     // 影响力 0-100
  maturityStage      String?   @map("maturity_stage")      // emerging/growing/mature/declining

  // 索引优化
  @@index([normalizedUrl])
  @@index([contentFingerprint])
  @@index([qualityScore])
  @@index([source, createdAt])
}

model RawData {
  // ... 现有字段 ...

  // 修复：确保与 Resource 的关联
  resourceId    String?   @unique @map("resource_id")
  resource      Resource? @relation(fields: [resourceId], references: [id])

  // 新增：处理状态
  processedAt   DateTime? @map("processed_at")
  processingError String? @map("processing_error")

  @@index([source, externalId])
  @@index([processedAt])
}
```

### 3.3 技术设计：RAG 引用精确化

#### 3.3.1 精确引用接口

**文件**: `ai-service/services/precise_citation.py`

```python
from dataclasses import dataclass
from typing import List, Optional
from enum import Enum

class ConfidenceLevel(str, Enum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

@dataclass
class PreciseCitation:
    """精确引用"""
    source_id: str
    paragraph_index: int
    exact_quote: str           # 原文引用
    confidence: ConfidenceLevel
    verifiable: bool           # 是否可验证
    hover_preview: str         # 悬浮预览文本

@dataclass
class ResponseWithCitations:
    """带引用的回答"""
    content: str
    citations: List[PreciseCitation]
    grounded_ratio: float      # 有据可查比例
    source_count: int          # 引用源数量
    overall_confidence: ConfidenceLevel

class PreciseCitationService:
    """精确引用服务"""

    def __init__(self, ai_client, vector_store):
        self.ai_client = ai_client
        self.vector_store = vector_store

    async def generate_with_citations(
        self,
        query: str,
        resources: List[dict],
        max_citations: int = 10
    ) -> ResponseWithCitations:
        """生成带精确引用的回答"""

        # 1. 将资源分割为段落
        paragraphs = []
        for resource in resources:
            resource_paragraphs = self._split_into_paragraphs(resource)
            paragraphs.extend(resource_paragraphs)

        # 2. 检索最相关的段落
        relevant_paragraphs = await self._retrieve_relevant(query, paragraphs, top_k=20)

        # 3. 构建带上下文的 prompt
        context = self._build_context(relevant_paragraphs)

        prompt = f"""基于以下资料回答问题。要求：
1. 只使用提供的资料，不要编造
2. 对每个关键论述，用 [数字] 标注来源
3. 如果资料不足以回答，明确说明
4. 优先引用高质量来源

资料：
{context}

问题：{query}

回答格式：
- 使用 [1], [2] 等标注引用
- 在回答末尾列出引用详情
"""

        # 4. 调用 AI 生成回答
        response = await self.ai_client.generate(prompt)

        # 5. 解析引用并验证
        citations = self._parse_and_verify_citations(response, relevant_paragraphs)

        # 6. 计算置信度
        grounded_ratio = len([c for c in citations if c.verifiable]) / max(len(citations), 1)

        overall_confidence = ConfidenceLevel.HIGH if grounded_ratio > 0.8 else \
                            ConfidenceLevel.MEDIUM if grounded_ratio > 0.5 else \
                            ConfidenceLevel.LOW

        return ResponseWithCitations(
            content=response,
            citations=citations,
            grounded_ratio=grounded_ratio,
            source_count=len(set(c.source_id for c in citations)),
            overall_confidence=overall_confidence
        )

    def _split_into_paragraphs(self, resource: dict) -> List[dict]:
        """将资源分割为段落"""
        content = resource.get('content', '')
        paragraphs = content.split('\n\n')

        return [
            {
                'source_id': resource['id'],
                'source_title': resource['title'],
                'paragraph_index': i,
                'text': p.strip(),
                'source_url': resource.get('sourceUrl', '')
            }
            for i, p in enumerate(paragraphs)
            if len(p.strip()) > 50  # 过滤太短的段落
        ]

    async def _retrieve_relevant(
        self,
        query: str,
        paragraphs: List[dict],
        top_k: int = 20
    ) -> List[dict]:
        """检索相关段落"""
        # 使用向量相似度检索
        query_embedding = await self.vector_store.embed(query)

        scored_paragraphs = []
        for p in paragraphs:
            p_embedding = await self.vector_store.embed(p['text'])
            similarity = self._cosine_similarity(query_embedding, p_embedding)
            scored_paragraphs.append((similarity, p))

        scored_paragraphs.sort(key=lambda x: x[0], reverse=True)
        return [p for _, p in scored_paragraphs[:top_k]]

    def _parse_and_verify_citations(
        self,
        response: str,
        paragraphs: List[dict]
    ) -> List[PreciseCitation]:
        """解析并验证引用"""
        import re

        citations = []
        citation_pattern = r'\[(\d+)\]'
        matches = re.findall(citation_pattern, response)

        for match in set(matches):
            idx = int(match) - 1
            if 0 <= idx < len(paragraphs):
                p = paragraphs[idx]

                # 验证引用是否真实存在于原文
                verifiable = self._verify_citation(response, p['text'])

                citations.append(PreciseCitation(
                    source_id=p['source_id'],
                    paragraph_index=p['paragraph_index'],
                    exact_quote=p['text'][:200] + '...' if len(p['text']) > 200 else p['text'],
                    confidence=ConfidenceLevel.HIGH if verifiable else ConfidenceLevel.MEDIUM,
                    verifiable=verifiable,
                    hover_preview=f"来源: {p['source_title']}\n\n{p['text'][:300]}..."
                ))

        return citations

    def _verify_citation(self, response: str, source_text: str) -> bool:
        """验证引用是否真实"""
        # 简单验证：检查回答中是否包含原文的关键词
        source_words = set(source_text.lower().split())
        response_words = set(response.lower().split())
        overlap = len(source_words & response_words) / max(len(source_words), 1)
        return overlap > 0.3
```

---

## 四、P1 阶段：核心差异化功能（Week 2-3）

### 4.1 任务分解

| ID   | 任务                 | 负责      | 工作量 | 依赖    |
| ---- | -------------------- | --------- | ------ | ------- |
| P1-1 | 趋势报告生成服务     | AI服务    | 2d     | P0 完成 |
| P1-2 | 趋势报告前端组件     | 前端      | 1d     | P1-1    |
| P1-3 | 技术对比矩阵服务     | AI服务    | 1.5d   | P0 完成 |
| P1-4 | 技术对比前端组件     | 前端      | 1d     | P1-3    |
| P1-5 | Command Palette 组件 | 前端      | 2d     | -       |
| P1-6 | 研究计划可视化       | 前端      | 2d     | -       |
| P1-7 | 斜杠命令系统         | 前端+后端 | 1.5d   | P1-5    |

### 4.2 技术设计：趋势报告生成

#### 4.2.1 服务接口

**文件**: `ai-service/services/trend_analysis.py`

```python
from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime
from enum import Enum

class MaturityStage(str, Enum):
    EMERGING = "emerging"      # 萌芽期
    GROWING = "growing"        # 成长期
    MATURE = "mature"          # 成熟期
    DECLINING = "declining"    # 衰退期

@dataclass
class TrendDataPoint:
    """趋势数据点"""
    date: datetime
    mention_count: int         # 提及次数
    sentiment_score: float     # 情感分数 -1 到 1
    key_papers: List[str]      # 关键论文 ID
    key_projects: List[str]    # 关键项目 ID

@dataclass
class TechnologyTrend:
    """技术趋势"""
    name: str
    maturity_stage: MaturityStage
    trend_direction: str       # rising/stable/declining
    confidence: float
    data_points: List[TrendDataPoint]
    key_insights: List[str]
    prediction: str            # 未来预测

@dataclass
class TrendReport:
    """趋势报告"""
    domain: str
    generated_at: datetime
    time_range: str
    summary: str
    hot_topics: List[dict]
    technologies: List[TechnologyTrend]
    hype_cycle_data: dict      # Gartner 风格成熟度数据
    predictions: List[str]
    source_count: int
    paper_count: int
    project_count: int

class TrendAnalysisService:
    """趋势分析服务"""

    def __init__(self, ai_client, prisma_client):
        self.ai = ai_client
        self.db = prisma_client

    async def generate_trend_report(
        self,
        domain: str,
        time_range: str = "3months"
    ) -> TrendReport:
        """生成技术趋势报告"""

        # 1. 收集领域相关资源
        resources = await self._collect_domain_resources(domain, time_range)

        # 2. 提取技术关键词和趋势
        technologies = await self._extract_technologies(resources)

        # 3. 分析每个技术的趋势
        trends = []
        for tech in technologies:
            trend = await self._analyze_technology_trend(tech, resources)
            trends.append(trend)

        # 4. 生成报告摘要
        summary = await self._generate_summary(domain, trends)

        # 5. 预测未来趋势
        predictions = await self._predict_trends(domain, trends)

        # 6. 构建 Hype Cycle 数据
        hype_cycle = self._build_hype_cycle(trends)

        return TrendReport(
            domain=domain,
            generated_at=datetime.now(),
            time_range=time_range,
            summary=summary,
            hot_topics=self._extract_hot_topics(resources),
            technologies=trends,
            hype_cycle_data=hype_cycle,
            predictions=predictions,
            source_count=len(resources),
            paper_count=len([r for r in resources if r['source'] == 'arxiv']),
            project_count=len([r for r in resources if r['source'] == 'github'])
        )

    async def _collect_domain_resources(
        self,
        domain: str,
        time_range: str
    ) -> List[dict]:
        """收集领域相关资源"""
        # 计算时间范围
        days = {'1month': 30, '3months': 90, '6months': 180, '1year': 365}.get(time_range, 90)
        since = datetime.now() - timedelta(days=days)

        # 查询数据库
        resources = await self.db.resource.find_many(
            where={
                'OR': [
                    {'title': {'contains': domain, 'mode': 'insensitive'}},
                    {'content': {'contains': domain, 'mode': 'insensitive'}},
                    {'tags': {'has': domain.lower()}}
                ],
                'createdAt': {'gte': since}
            },
            order_by={'createdAt': 'desc'},
            take=500
        )

        return resources

    async def _analyze_technology_trend(
        self,
        tech_name: str,
        resources: List[dict]
    ) -> TechnologyTrend:
        """分析单个技术的趋势"""

        # 筛选相关资源
        relevant = [r for r in resources if tech_name.lower() in (r.get('title', '') + r.get('content', '')).lower()]

        # 按月统计
        monthly_data = self._aggregate_by_month(relevant)

        # 计算趋势方向
        trend_direction = self._calculate_trend_direction(monthly_data)

        # 评估成熟度
        maturity = await self._assess_maturity(tech_name, relevant)

        # 生成洞察
        insights = await self._generate_insights(tech_name, relevant)

        return TechnologyTrend(
            name=tech_name,
            maturity_stage=maturity,
            trend_direction=trend_direction,
            confidence=0.8,
            data_points=monthly_data,
            key_insights=insights,
            prediction=await self._predict_single_tech(tech_name, monthly_data)
        )

    def _build_hype_cycle(self, trends: List[TechnologyTrend]) -> dict:
        """构建 Gartner 风格 Hype Cycle 数据"""
        stages = {
            'innovation_trigger': [],      # 技术萌芽期
            'peak_of_expectations': [],    # 期望膨胀期
            'trough_of_disillusionment': [], # 泡沫破裂低谷期
            'slope_of_enlightenment': [],  # 稳步爬升复苏期
            'plateau_of_productivity': []  # 生产力成熟期
        }

        for trend in trends:
            if trend.maturity_stage == MaturityStage.EMERGING:
                if trend.trend_direction == 'rising':
                    stages['innovation_trigger'].append(trend.name)
                else:
                    stages['peak_of_expectations'].append(trend.name)
            elif trend.maturity_stage == MaturityStage.GROWING:
                stages['slope_of_enlightenment'].append(trend.name)
            elif trend.maturity_stage == MaturityStage.MATURE:
                stages['plateau_of_productivity'].append(trend.name)
            elif trend.maturity_stage == MaturityStage.DECLINING:
                stages['trough_of_disillusionment'].append(trend.name)

        return stages
```

### 4.3 技术设计：Command Palette

#### 4.3.1 组件实现

**文件**: `frontend/components/ai-studio/CommandPalette.tsx`

```tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useHotkeys } from "react-hotkeys-hook";
import {
  TrendingUp,
  GitCompare,
  Network,
  Clock,
  FileText,
  Target,
  Presentation,
  Mic,
  Search,
  Upload,
  Star,
  Settings,
  Layout,
} from "lucide-react";

interface CommandItem {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "insight" | "search" | "resource" | "create" | "view";
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  onExecuteCommand: (command: string, args?: string) => void;
}

export function CommandPalette({ onExecuteCommand }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recentCommands, setRecentCommands] = useState<string[]>([]);

  // 快捷键绑定
  useHotkeys("mod+k", (e) => {
    e.preventDefault();
    setOpen(true);
  });

  // 命令定义
  const commands: CommandItem[] = useMemo(
    () => [
      // 洞察生成
      {
        id: "trend",
        name: "趋势报告",
        description: "生成技术领域趋势分析报告",
        icon: <TrendingUp className="h-4 w-4" />,
        category: "insight",
        shortcut: "/trend",
        action: () => onExecuteCommand("trend"),
      },
      {
        id: "compare",
        name: "技术对比",
        description: "对比多个技术/产品的多维度分析",
        icon: <GitCompare className="h-4 w-4" />,
        category: "insight",
        shortcut: "/compare",
        action: () => onExecuteCommand("compare"),
      },
      {
        id: "graph",
        name: "知识图谱",
        description: "生成技术概念关系图谱",
        icon: <Network className="h-4 w-4" />,
        category: "insight",
        shortcut: "/graph",
        action: () => onExecuteCommand("graph"),
      },
      {
        id: "timeline",
        name: "技术时间线",
        description: "展示技术演进历史",
        icon: <Clock className="h-4 w-4" />,
        category: "insight",
        shortcut: "/timeline",
        action: () => onExecuteCommand("timeline"),
      },
      {
        id: "summary",
        name: "研究摘要",
        description: "生成多论文综合摘要",
        icon: <FileText className="h-4 w-4" />,
        category: "insight",
        shortcut: "/summary",
        action: () => onExecuteCommand("summary"),
      },
      {
        id: "decision",
        name: "决策矩阵",
        description: "技术选型决策支持",
        icon: <Target className="h-4 w-4" />,
        category: "insight",
        shortcut: "/decision",
        action: () => onExecuteCommand("decision"),
      },

      // 搜索
      {
        id: "search",
        name: "智能搜索",
        description: "跨 arXiv + GitHub + 资讯搜索",
        icon: <Search className="h-4 w-4" />,
        category: "search",
        shortcut: "/search",
        action: () => onExecuteCommand("search"),
      },
      {
        id: "arxiv",
        name: "论文搜索",
        description: "仅搜索 arXiv 论文",
        icon: <FileText className="h-4 w-4" />,
        category: "search",
        shortcut: "/arxiv",
        action: () => onExecuteCommand("arxiv"),
      },

      // 资源操作
      {
        id: "upload",
        name: "上传文件",
        description: "上传 PDF/文档到资源库",
        icon: <Upload className="h-4 w-4" />,
        category: "resource",
        action: () => onExecuteCommand("upload"),
      },
      {
        id: "picks",
        name: "保存到 AI Picks",
        description: "将当前资源保存到收藏",
        icon: <Star className="h-4 w-4" />,
        category: "resource",
        shortcut: "/picks",
        action: () => onExecuteCommand("picks"),
      },

      // 内容创作
      {
        id: "ppt",
        name: "生成 PPT",
        description: "基于当前内容生成演示文稿",
        icon: <Presentation className="h-4 w-4" />,
        category: "create",
        shortcut: "/ppt",
        action: () => onExecuteCommand("ppt"),
      },
      {
        id: "podcast",
        name: "生成播客",
        description: "AI 生成技术播客音频",
        icon: <Mic className="h-4 w-4" />,
        category: "create",
        shortcut: "/podcast",
        action: () => onExecuteCommand("podcast"),
      },

      // 视图切换
      {
        id: "research-mode",
        name: "Research 模式",
        description: "研究模式：Top 85%, Bottom 15%",
        icon: <Layout className="h-4 w-4" />,
        category: "view",
        shortcut: "Cmd+1",
        action: () => onExecuteCommand("focus", "research"),
      },
      {
        id: "analysis-mode",
        name: "Analysis 模式",
        description: "分析模式：Top 30%, Bottom 70%",
        icon: <Layout className="h-4 w-4" />,
        category: "view",
        shortcut: "Cmd+2",
        action: () => onExecuteCommand("focus", "analysis"),
      },
    ],
    [onExecuteCommand],
  );

  // 过滤命令
  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    const lowerSearch = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerSearch) ||
        cmd.description.toLowerCase().includes(lowerSearch) ||
        cmd.shortcut?.toLowerCase().includes(lowerSearch),
    );
  }, [commands, search]);

  // 分组
  const groupedCommands = useMemo(() => {
    const groups: Record<string, CommandItem[]> = {
      insight: [],
      search: [],
      resource: [],
      create: [],
      view: [],
    };
    filteredCommands.forEach((cmd) => {
      groups[cmd.category].push(cmd);
    });
    return groups;
  }, [filteredCommands]);

  const categoryLabels: Record<string, string> = {
    insight: "洞察生成",
    search: "深度搜索",
    resource: "资源操作",
    create: "内容创作",
    view: "视图切换",
  };

  const handleSelect = useCallback((cmd: CommandItem) => {
    cmd.action();
    setOpen(false);
    setSearch("");

    // 记录最近使用
    setRecentCommands((prev) => {
      const updated = [cmd.id, ...prev.filter((id) => id !== cmd.id)].slice(
        0,
        5,
      );
      localStorage.setItem("recentCommands", JSON.stringify(updated));
      return updated;
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 max-w-2xl">
        <Command className="rounded-lg border shadow-md">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
            <Input
              placeholder="输入命令或搜索..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-12 w-full border-0 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-0"
            />
            <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
              ESC
            </kbd>
          </div>

          <CommandList className="max-h-[400px] overflow-y-auto p-2">
            {Object.entries(groupedCommands).map(
              ([category, items]) =>
                items.length > 0 && (
                  <CommandGroup
                    key={category}
                    heading={categoryLabels[category]}
                  >
                    {items.map((cmd) => (
                      <CommandItem
                        key={cmd.id}
                        onSelect={() => handleSelect(cmd)}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-background">
                          {cmd.icon}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{cmd.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {cmd.description}
                          </div>
                        </div>
                        {cmd.shortcut && (
                          <kbd className="pointer-events-none h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ),
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
```

### 4.4 技术设计：研究计划可视化

**文件**: `frontend/components/ai-studio/ResearchPlan.tsx`

```tsx
"use client";

import { useState } from "react";
import {
  Check,
  Circle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Edit2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed";

export interface ResearchStep {
  id: string;
  title: string;
  description: string;
  status: StepStatus;
  progress?: number;
  result?: string;
  substeps?: string[];
}

interface ResearchPlanProps {
  query: string;
  steps: ResearchStep[];
  onEditPlan?: () => void;
  className?: string;
}

export function ResearchPlan({
  query,
  steps,
  onEditPlan,
  className,
}: ResearchPlanProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  const completedCount = steps.filter((s) => s.status === "completed").length;
  const overallProgress = (completedCount / steps.length) * 100;

  const toggleExpand = (stepId: string) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepId)) {
      newExpanded.delete(stepId);
    } else {
      newExpanded.add(stepId);
    }
    setExpandedSteps(newExpanded);
  };

  const getStatusIcon = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return <Check className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case "failed":
        return <Circle className="h-4 w-4 text-red-500" />;
      default:
        return <Circle className="h-4 w-4 text-gray-300" />;
    }
  };

  const getStatusLabel = (status: StepStatus) => {
    switch (status) {
      case "completed":
        return "完成";
      case "in_progress":
        return "进行中";
      case "failed":
        return "失败";
      default:
        return "待开始";
    }
  };

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔍</span>
          <h3 className="font-medium">研究计划</h3>
        </div>
        {onEditPlan && (
          <Button variant="ghost" size="sm" onClick={onEditPlan}>
            <Edit2 className="h-4 w-4 mr-1" />
            编辑
          </Button>
        )}
      </div>

      {/* 研究问题 */}
      <div className="p-4 bg-muted/30 border-b">
        <p className="text-sm text-muted-foreground">研究问题</p>
        <p className="font-medium mt-1">{query}</p>
      </div>

      {/* 总体进度 */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between text-sm mb-2">
          <span>总体进度</span>
          <span className="text-muted-foreground">
            {completedCount}/{steps.length} 步骤
          </span>
        </div>
        <Progress value={overallProgress} className="h-2" />
      </div>

      {/* 步骤列表 */}
      <div className="divide-y">
        {steps.map((step, index) => (
          <div key={step.id} className="p-4">
            <div
              className="flex items-start gap-3 cursor-pointer"
              onClick={() => toggleExpand(step.id)}
            >
              {/* 序号和状态 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-5">
                  {index + 1}.
                </span>
                {getStatusIcon(step.status)}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "font-medium",
                      step.status === "completed" && "text-green-600",
                      step.status === "in_progress" && "text-blue-600",
                    )}
                  >
                    {step.title}
                  </span>
                  <span
                    className={cn(
                      "text-xs px-1.5 py-0.5 rounded",
                      step.status === "completed" &&
                        "bg-green-100 text-green-700",
                      step.status === "in_progress" &&
                        "bg-blue-100 text-blue-700",
                      step.status === "pending" && "bg-gray-100 text-gray-600",
                      step.status === "failed" && "bg-red-100 text-red-700",
                    )}
                  >
                    {getStatusLabel(step.status)}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {step.description}
                </p>

                {/* 进度条 (如果正在进行) */}
                {step.status === "in_progress" &&
                  step.progress !== undefined && (
                    <div className="mt-2">
                      <Progress value={step.progress} className="h-1.5" />
                      <span className="text-xs text-muted-foreground mt-1">
                        {step.progress}%
                      </span>
                    </div>
                  )}
              </div>

              {/* 展开/收起 */}
              <Button variant="ghost" size="sm" className="shrink-0">
                {expandedSteps.has(step.id) ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            </div>

            {/* 展开详情 */}
            {expandedSteps.has(step.id) && (
              <div className="mt-3 ml-10 p-3 bg-muted/30 rounded-md">
                {step.substeps && step.substeps.length > 0 && (
                  <div className="space-y-1">
                    {step.substeps.map((substep, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">•</span>
                        <span>{substep}</span>
                      </div>
                    ))}
                  </div>
                )}

                {step.result && (
                  <div className="mt-2 pt-2 border-t">
                    <p className="text-sm font-medium">结果</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {step.result}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 五、P2 阶段：体验增强（Week 4-5）

### 5.1 任务分解

| ID   | 任务                   | 负责   | 工作量 | 依赖    |
| ---- | ---------------------- | ------ | ------ | ------- |
| P2-1 | 知识图谱可视化 (D3.js) | 前端   | 4d     | P1 完成 |
| P2-2 | 知识图谱数据服务       | 后端   | 2d     | -       |
| P2-3 | Focus Modes 实现       | 前端   | 1.5d   | -       |
| P2-4 | 技术成熟度评估服务     | AI服务 | 2d     | P1-1    |
| P2-5 | Hype Cycle 图表组件    | 前端   | 1.5d   | P2-4    |
| P2-6 | 趋势预测模型           | AI服务 | 2d     | P1-1    |

### 5.2 技术设计：知识图谱可视化

**文件**: `frontend/components/ai-studio/KnowledgeGraph.tsx`

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";

export interface GraphNode {
  id: string;
  label: string;
  type: "concept" | "paper" | "project" | "person" | "technology";
  maturity?: "emerging" | "growing" | "mature" | "declining";
  size?: number;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: "related_to" | "implements" | "improves" | "cites" | "uses";
  weight?: number;
}

interface KnowledgeGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (node: GraphNode) => void;
  onNodeExpand?: (
    nodeId: string,
  ) => Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
  className?: string;
}

export function KnowledgeGraph({
  nodes,
  edges,
  onNodeClick,
  onNodeExpand,
  className,
}: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [zoom, setZoom] = useState(1);

  // 颜色映射
  const colorMap: Record<string, string> = {
    concept: "#3B82F6", // blue
    paper: "#10B981", // green
    project: "#8B5CF6", // purple
    person: "#F59E0B", // amber
    technology: "#EF4444", // red
  };

  const maturityColorMap: Record<string, string> = {
    emerging: "#22C55E", // green
    growing: "#EAB308", // yellow
    mature: "#3B82F6", // blue
    declining: "#EF4444", // red
  };

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || nodes.length === 0) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 600;

    // 清除之前的内容
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // 创建缩放容器
    const g = svg.append("g");

    // 缩放行为
    const zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setZoom(event.transform.k);
      });

    svg.call(zoomBehavior);

    // 力导向图模拟
    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(edges)
          .id((d: any) => d.id)
          .distance(100),
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(40));

    // 绘制边
    const link = g
      .append("g")
      .selectAll("line")
      .data(edges)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => Math.sqrt(d.weight || 1));

    // 绘制节点
    const node = g
      .append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, GraphNode>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended),
      );

    // 节点圆圈
    node
      .append("circle")
      .attr("r", (d) => d.size || 20)
      .attr("fill", (d) =>
        d.maturity ? maturityColorMap[d.maturity] : colorMap[d.type],
      )
      .attr("stroke", "#fff")
      .attr("stroke-width", 2);

    // 节点标签
    node
      .append("text")
      .text((d) => d.label)
      .attr("text-anchor", "middle")
      .attr("dy", (d) => (d.size || 20) + 15)
      .attr("font-size", "12px")
      .attr("fill", "#374151");

    // 节点交互
    node.on("click", (event, d) => {
      setSelectedNode(d);
      onNodeClick?.(d);
    });

    node.on("dblclick", async (event, d) => {
      if (onNodeExpand) {
        const newData = await onNodeExpand(d.id);
        // 扩展图谱...
      }
    });

    // 模拟更新
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // 拖拽函数
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [nodes, edges, onNodeClick, onNodeExpand]);

  // 搜索高亮
  const handleSearch = useCallback(() => {
    if (!searchQuery) return;

    const matchedNode = nodes.find((n) =>
      n.label.toLowerCase().includes(searchQuery.toLowerCase()),
    );

    if (matchedNode) {
      setSelectedNode(matchedNode);
      // TODO: 平移到该节点
    }
  }, [searchQuery, nodes]);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-medium">🗺️ 知识图谱</CardTitle>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索节点..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-8 w-48"
            />
          </div>
          <Button variant="outline" size="icon">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {/* 图例 */}
        <div className="flex items-center gap-4 px-4 py-2 border-b text-xs">
          <span className="text-muted-foreground">节点类型:</span>
          {Object.entries(colorMap).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>{type}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2 border-b text-xs">
          <span className="text-muted-foreground">成熟度:</span>
          {Object.entries(maturityColorMap).map(([stage, color]) => (
            <div key={stage} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span>
                {stage === "emerging"
                  ? "萌芽"
                  : stage === "growing"
                    ? "成长"
                    : stage === "mature"
                      ? "成熟"
                      : "衰退"}
              </span>
            </div>
          ))}
        </div>

        {/* 图谱容器 */}
        <div ref={containerRef} className="h-[500px] relative">
          <svg ref={svgRef} className="w-full h-full" />

          {/* 选中节点详情 */}
          {selectedNode && (
            <div className="absolute bottom-4 left-4 bg-background border rounded-lg p-4 shadow-lg max-w-xs">
              <h4 className="font-medium">{selectedNode.label}</h4>
              <p className="text-sm text-muted-foreground mt-1">
                类型: {selectedNode.type}
              </p>
              {selectedNode.maturity && (
                <p className="text-sm text-muted-foreground">
                  成熟度: {selectedNode.maturity}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline">
                  查看详情
                </Button>
                <Button size="sm">展开关联</Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 六、Store 设计

### 6.1 新增 Store 文件

**文件**: `frontend/stores/aiStudioStore.ts`

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

// 类型定义
export type FocusMode = "research" | "analysis" | "graph" | "report" | "zen";

export interface ResearchStep {
  id: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  progress?: number;
  result?: string;
}

export interface TrendData {
  domain: string;
  generatedAt: string;
  summary: string;
  technologies: any[];
  predictions: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  maturity?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
}

// Store 状态接口
interface AIStudioState {
  // Focus Mode
  focusMode: FocusMode;
  splitRatio: number;
  rightPanelOpen: boolean;

  // Research Plan
  researchQuery: string;
  researchSteps: ResearchStep[];
  researchStatus: "idle" | "planning" | "executing" | "completed";

  // Trend Analysis
  currentTrend: TrendData | null;
  trendLoading: boolean;

  // Knowledge Graph
  graphNodes: GraphNode[];
  graphEdges: GraphEdge[];
  selectedGraphNode: string | null;

  // Command Palette
  commandPaletteOpen: boolean;
  recentCommands: string[];

  // Actions
  setFocusMode: (mode: FocusMode) => void;
  setSplitRatio: (ratio: number) => void;
  toggleRightPanel: () => void;

  setResearchQuery: (query: string) => void;
  setResearchSteps: (steps: ResearchStep[]) => void;
  updateResearchStep: (stepId: string, updates: Partial<ResearchStep>) => void;
  startResearch: () => void;

  setCurrentTrend: (trend: TrendData | null) => void;
  setTrendLoading: (loading: boolean) => void;

  setGraphData: (nodes: GraphNode[], edges: GraphEdge[]) => void;
  selectGraphNode: (nodeId: string | null) => void;
  expandGraphNode: (
    nodeId: string,
    newNodes: GraphNode[],
    newEdges: GraphEdge[],
  ) => void;

  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  addRecentCommand: (command: string) => void;
}

// Focus Mode 预设
const focusModePresets: Record<
  FocusMode,
  { splitRatio: number; rightPanelOpen: boolean }
> = {
  research: { splitRatio: 85, rightPanelOpen: false },
  analysis: { splitRatio: 30, rightPanelOpen: false },
  graph: { splitRatio: 0, rightPanelOpen: true },
  report: { splitRatio: 0, rightPanelOpen: true },
  zen: { splitRatio: 0, rightPanelOpen: false },
};

export const useAIStudioStore = create<AIStudioState>()(
  persist(
    (set, get) => ({
      // 初始状态
      focusMode: "analysis",
      splitRatio: 50,
      rightPanelOpen: true,

      researchQuery: "",
      researchSteps: [],
      researchStatus: "idle",

      currentTrend: null,
      trendLoading: false,

      graphNodes: [],
      graphEdges: [],
      selectedGraphNode: null,

      commandPaletteOpen: false,
      recentCommands: [],

      // Actions
      setFocusMode: (mode) => {
        const preset = focusModePresets[mode];
        set({
          focusMode: mode,
          splitRatio: preset.splitRatio,
          rightPanelOpen: preset.rightPanelOpen,
        });
      },

      setSplitRatio: (ratio) => set({ splitRatio: ratio }),

      toggleRightPanel: () =>
        set((state) => ({ rightPanelOpen: !state.rightPanelOpen })),

      setResearchQuery: (query) => set({ researchQuery: query }),

      setResearchSteps: (steps) => set({ researchSteps: steps }),

      updateResearchStep: (stepId, updates) =>
        set((state) => ({
          researchSteps: state.researchSteps.map((step) =>
            step.id === stepId ? { ...step, ...updates } : step,
          ),
        })),

      startResearch: () => set({ researchStatus: "planning" }),

      setCurrentTrend: (trend) => set({ currentTrend: trend }),

      setTrendLoading: (loading) => set({ trendLoading: loading }),

      setGraphData: (nodes, edges) =>
        set({ graphNodes: nodes, graphEdges: edges }),

      selectGraphNode: (nodeId) => set({ selectedGraphNode: nodeId }),

      expandGraphNode: (nodeId, newNodes, newEdges) =>
        set((state) => ({
          graphNodes: [
            ...state.graphNodes,
            ...newNodes.filter(
              (n) => !state.graphNodes.find((existing) => existing.id === n.id),
            ),
          ],
          graphEdges: [...state.graphEdges, ...newEdges],
        })),

      openCommandPalette: () => set({ commandPaletteOpen: true }),

      closeCommandPalette: () => set({ commandPaletteOpen: false }),

      addRecentCommand: (command) =>
        set((state) => ({
          recentCommands: [
            command,
            ...state.recentCommands.filter((c) => c !== command),
          ].slice(0, 10),
        })),
    }),
    {
      name: "ai-studio-storage",
      partialize: (state) => ({
        focusMode: state.focusMode,
        recentCommands: state.recentCommands,
      }),
    },
  ),
);
```

---

## 七、测试计划

### 7.1 单元测试

| 模块                   | 测试文件                        | 覆盖目标 |
| ---------------------- | ------------------------------- | -------- |
| DeduplicationService   | `deduplication.service.spec.ts` | 90%      |
| TrendAnalysisService   | `trend_analysis_test.py`        | 85%      |
| PreciseCitationService | `precise_citation_test.py`      | 85%      |
| CommandPalette         | `CommandPalette.test.tsx`       | 80%      |
| KnowledgeGraph         | `KnowledgeGraph.test.tsx`       | 80%      |

### 7.2 集成测试

| 场景         | 描述                                 |
| ------------ | ------------------------------------ |
| 资源入库流程 | 测试完整的去重 → 质量评估 → 入库流程 |
| 趋势报告生成 | 测试从搜索到报告生成的完整链路       |
| 知识图谱交互 | 测试节点点击、展开、搜索功能         |

### 7.3 E2E 测试

| 场景           | 描述                                      |
| -------------- | ----------------------------------------- |
| 新用户研究流程 | 输入问题 → 搜索 → 选择资源 → 生成报告     |
| 技术对比流程   | 输入对比命令 → 选择技术 → 查看对比结果    |
| 知识探索流程   | 查看图谱 → 点击节点 → 展开关联 → 查看详情 |

---

## 八、风险与缓解

| 风险               | 概率 | 影响 | 缓解措施                     |
| ------------------ | ---- | ---- | ---------------------------- |
| 数据清洗耗时超预期 | 中   | 高   | 分批处理，优先处理高质量数据 |
| D3.js 性能问题     | 中   | 中   | 节点数量限制，虚拟化渲染     |
| AI 服务响应慢      | 低   | 高   | 添加缓存层，异步处理         |
| 用户体验复杂       | 中   | 中   | 渐进式引导，默认简化模式     |

---

## 九、验收标准

### 9.1 P0 完成标准

- [ ] 资源去重率 > 95%（同一 URL 不重复入库）
- [ ] 资源信息完整率 > 90%（标题、摘要、来源均有值）
- [ ] RAG 引用准确率 > 90%（引用可追溯到原文）
- [ ] 数据清洗脚本执行成功，历史数据修复完成

### 9.2 P1 完成标准

- [ ] 趋势报告生成时间 < 30s
- [ ] 技术对比支持 2-5 项技术同时对比
- [ ] Command Palette 响应时间 < 100ms
- [ ] 研究计划可视化正确显示所有步骤状态

### 9.3 P2 完成标准

- [ ] 知识图谱支持 500+ 节点流畅渲染
- [ ] Focus Modes 切换动画流畅
- [ ] Hype Cycle 图表数据准确
- [ ] 趋势预测有置信度标注

---

## 十、附录

### 10.1 相关文档

| 文档          | 路径                                      |
| ------------- | ----------------------------------------- |
| PRD v3.1      | `docs/prd/ai_studio_optimization_v3.1.md` |
| 架构总览      | `docs/architecture/overview.md`           |
| API 文档      | `docs/api/readme.md`                      |
| 数据库 Schema | `backend/prisma/schema.prisma`            |

### 10.2 参考资源

- [OpenAI Deep Research](https://openai.com/index/introducing-deep-research/)
- [CB Insights](https://www.cbinsights.com/)
- [D3.js Force-Directed Graph](https://observablehq.com/@d3/force-directed-graph)
- [Gartner Hype Cycle](https://www.gartner.com/en/research/methodologies/gartner-hype-cycle)

---

**文档版本**: v1.0
**创建日期**: 2025-11-28
**状态**: 待评审
