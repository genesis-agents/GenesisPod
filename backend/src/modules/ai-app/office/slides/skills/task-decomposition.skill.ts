/**
 * Slides Engine v4.0 - Task Decomposition Skill
 *
 * 任务分解技能：分析源材料，规划 PPT 结构
 * 实现 AI Engine ISkill 接口，注册到 SkillRegistry
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
  SKILL_LAYERS,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import { LLMFactory } from "@/modules/ai-engine/llm/factory/llm-factory";
import { LLMRequestOptions } from "@/modules/ai-engine/llm/abstractions/llm-adapter.interface";
import {
  TaskDecomposition,
  Chapter,
  TodoItem,
  DesignStrategy,
  SourceAnalysis,
  DataPoint,
} from "../checkpoint/checkpoint.types";
import { SearchService } from "../../../../ai-engine/search/search.service";

/**
 * 任务分解输入
 */
export interface TaskDecompositionInput {
  /** 源文本内容 */
  sourceText: string;
  /** 用户需求描述 */
  userRequirement?: string;
  /** 目标页数（可选，自动推断） */
  targetPages?: number;
  /** 风格偏好 */
  stylePreference?: "dark" | "light" | "custom";
  /** 目标受众 */
  targetAudience?: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 任务分解系统提示词 - 增强版：强化数据提取
 */
const TASK_DECOMPOSITION_SYSTEM_PROMPT = `你是一位专业的 PPT 架构师，负责分析源材料并规划 PPT 结构。你特别擅长从文本中提取可视化数据。

## 你的任务

分析用户提供的文本内容，输出结构化的任务分解结果，包括：
1. **页面规划**：确定总页数和章节划分
2. **章节结构**：每个章节的标题、页面范围、关键点
3. **待办事项**：生成每页需要完成的具体任务
4. **设计策略**：确定整体视觉风格
5. **源内容分析**：**深度提取**所有数据点、引用、关键洞察

## 数据提取要求（最重要！）

你必须从源文本中尽可能多地提取数据：

### 数据点类型
- **percentage**: 百分比（如 85%、增长 20%）
- **currency**: 金额（如 100万、$1.2B）
- **number**: 数字（如 500人、3个）
- **date**: 日期时间（如 2025年Q1、上半年）
- **comparison**: 对比数据（如 A比B高30%）

### 提取策略
1. **主动挖掘**：即使数据不明确，也要从上下文推断
2. **单位标准化**：统一转换为标准单位
3. **上下文关联**：记录每个数据点的业务含义
4. **可视化建议**：为每个数据点建议图表类型

### 示例
文本："我们的用户在过去一年增长了三倍"
提取：{ "type": "number", "value": "3x", "context": "用户年增长倍数", "chartType": "bar" }

文本："移动端占比超过七成"
提取：{ "type": "percentage", "value": "70%+", "context": "移动端用户占比", "chartType": "pie" }

## 输出格式

\`\`\`json
{
  "totalPages": 18,
  "chapters": [
    {
      "id": "ch1",
      "title": "章节标题",
      "pageRange": [1, 3],
      "keyPoints": ["要点1", "要点2"],
      "emphasis": "high"
    }
  ],
  "todoList": [
    {
      "id": "todo1",
      "content": "创建封面页，包含标题和副标题",
      "status": "pending",
      "pageNumber": 1
    }
  ],
  "designStrategy": {
    "colorScheme": "dark",
    "accentColor": "#D4AF37",
    "styleReference": "McKinsey-style",
    "fontFamily": "Noto Sans SC",
    "targetAudience": "企业高管"
  },
  "sourceAnalysis": {
    "totalWords": 5000,
    "language": "zh-CN",
    "topics": ["AI", "商业模式", "技术趋势"],
    "dataPoints": [
      {
        "type": "percentage",
        "value": "86%",
        "context": "英伟达GPU市场份额",
        "source": "第3章",
        "chartType": "pie",
        "relatedData": [
          {"name": "NVIDIA", "value": 86},
          {"name": "AMD", "value": 10},
          {"name": "Other", "value": 4}
        ]
      },
      {
        "type": "currency",
        "value": "$26.9B",
        "context": "英伟达Q3营收",
        "source": "财报数据",
        "chartType": "bar",
        "trend": "up",
        "change": "+94% YoY"
      }
    ],
    "quotes": ["AI正在重塑每一个行业", "数据是新时代的石油"],
    "keyInsights": [
      "GPU需求持续强劲，供不应求",
      "AI基础设施投资进入爆发期"
    ]
  }
}
\`\`\`

## 规划原则

1. **封面 + 目录**：至少预留 2 页
2. **每章节 2-4 页**：内容不要过于密集
3. **数据仪表盘页**：每 3-4 页安排一个数据密集型页面
4. **总结/建议页**：结尾预留 1-2 页
5. **数据驱动**：确保每个章节都有数据支撑
6. **故事线**：用数据串联逻辑，形成说服力

## 特别注意

- 数据点提取要**尽可能多**，不要遗漏任何可量化的信息
- 如果原文数据不足，可以根据上下文**合理推断**补充数据
- 为每个数据点建议最适合的图表类型

## ✅ 章节生成方法论（必须严格遵守！）

### Step 1: 识别源文本核心主题
首先阅读源文本，识别：
- **核心主题关键词**：如"渥太华KANATA"、"AI芯片"、"电商运营"
- **主要实体**：公司、产品、地区、人物等
- **核心观点**：源文本想表达的主要信息

### Step 2: 提取章节结构
从源文本的**实际内容**中提取章节：
- 章节标题必须直接来自源文本的段落主题
- 使用源文本中的专有名词和术语
- 保留源文本的逻辑结构

### Step 3: 验证章节合规性
在输出前，对每个章节进行检查：
- ✅ 章节标题是否包含源文本的核心关键词？
- ✅ 章节内容是否在源文本中有对应段落？
- ❌ 是否有任何关于"设计"、"风格"、"模板"的内容？

**示例（假设源文本主题是"渥太华KANATA"）：**
- ✅ 正确：["KANATA概述", "地理位置与交通", "科技产业园区", "生活配套设施"]
- ❌ 错误：["商务简约设计", "视觉风格", "PPT制作理念"]

## ⛔ 严禁事项（违反将导致任务失败！）

**绝对禁止生成以下类型的章节或内容：**
1. 关于"设计风格"、"商务简约"、"视觉设计"的章节
2. 关于"PPT制作方法"、"幻灯片设计技巧"的章节
3. 任何自我描述性内容（如"本演示文稿采用XX风格"）

**所有章节标题和内容必须100%基于源文本的实际主题！**
- 如果源文本讲的是"渥太华KANATA"，则所有章节都必须关于渥太华KANATA
- 如果源文本讲的是"AI发展"，则所有章节都必须关于AI发展
- 绝不能生成与源文本主题无关的通用商务内容`;

@Injectable()
export class TaskDecompositionSkill
  implements ISkill<TaskDecompositionInput, TaskDecomposition>
{
  private readonly logger = new Logger(TaskDecompositionSkill.name);

  // ISkill 接口必需属性
  readonly id = "slides-task-decomposition";
  readonly name = "任务分解";
  readonly description = "分析源材料，规划 PPT 结构，提取数据点和章节";
  readonly layer: SkillLayer = SKILL_LAYERS.PLANNING;
  readonly domain = "slides";
  readonly tags = ["slides", "planning", "decomposition", "analysis"];
  readonly version = "4.0.0";

  constructor(
    @Optional() private readonly llmFactory: LLMFactory,
    @Optional() private readonly searchService: SearchService,
  ) {}

  /**
   * 执行任务分解 (ISkill 接口实现)
   */
  async execute(
    input: TaskDecompositionInput,
    context: SkillContext,
  ): Promise<SkillResult<TaskDecomposition>> {
    const startTime = new Date();
    let tokensUsed = 0;

    this.logger.log(
      `[execute] Starting task decomposition, source length: ${input.sourceText.length}, executionId: ${context.executionId}`,
    );

    try {
      // 第一步：尝试从源文本中搜索补充数据（如果源文本较短）
      let enrichedSourceText = input.sourceText;
      if (this.searchService && input.sourceText.length < 2000) {
        const searchEnrichment = await this.enrichWithSearch(input.sourceText);
        if (searchEnrichment) {
          enrichedSourceText = `${input.sourceText}\n\n## 补充资料（来自网络搜索）\n\n${searchEnrichment}`;
          this.logger.log(
            `[execute] Enriched source text with ${searchEnrichment.length} chars from search`,
          );
        }
      }

      const userMessage = this.buildUserMessage({
        ...input,
        sourceText: enrichedSourceText,
      });

      // 使用 LLMFactory 调用 LLM
      const llmOptions: LLMRequestOptions = {
        messages: [
          { role: "system", content: TASK_DECOMPOSITION_SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        model: "gpt-4o",
        maxTokens: 4096,
        temperature: 0.3,
        responseFormat: "json",
        metadata: {
          sessionId: context.sessionId,
          skillId: this.id,
          phase: "task_decomposition",
        },
      };

      if (!this.llmFactory) {
        throw new Error("LLMFactory not available");
      }

      const adapter = this.llmFactory.getAdapter();
      if (!adapter) {
        throw new Error("No LLM adapter available");
      }

      const response = await adapter.chat(llmOptions);

      if (!response.content) {
        throw new Error("Empty response from LLM");
      }

      tokensUsed = response.usage?.totalTokens || 0;

      // 解析 JSON 响应
      const decomposition = this.parseResponse(response.content);

      this.logger.log(
        `[execute] Task decomposition complete: ${decomposition.totalPages} pages, ${decomposition.chapters.length} chapters, ${decomposition.sourceAnalysis?.dataPoints?.length || 0} data points`,
      );

      return {
        success: true,
        data: decomposition,
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
          tokensUsed,
        },
      };
    } catch (error) {
      this.logger.error(`[execute] Task decomposition failed: ${error}`);

      return {
        success: false,
        error: {
          code: "TASK_DECOMPOSITION_FAILED",
          message: error instanceof Error ? error.message : String(error),
          retryable: true,
        },
        data: this.createFallbackDecomposition(),
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
          tokensUsed,
        },
        usedFallback: true,
      };
    }
  }

  /**
   * 兼容旧接口的执行方法
   * @deprecated 使用 execute(input, context) 代替
   */
  async executeCompat(
    input: TaskDecompositionInput,
  ): Promise<TaskDecomposition> {
    const context: SkillContext = {
      executionId: `compat-${Date.now()}`,
      skillId: this.id,
      createdAt: new Date(),
    };
    const result = await this.execute(input, context);
    if (result.success && result.data) {
      return result.data;
    }
    throw new Error(result.error?.message || "Task decomposition failed");
  }

  /**
   * 使用搜索服务补充数据
   * 当源文本较短时，尝试搜索相关信息补充数据点
   */
  private async enrichWithSearch(sourceText: string): Promise<string | null> {
    try {
      // 提取源文本中的关键词作为搜索查询
      const keywords = this.extractKeywords(sourceText);
      if (!keywords) {
        this.logger.debug("[enrichWithSearch] No keywords extracted");
        return null;
      }

      this.logger.log(`[enrichWithSearch] Searching for: ${keywords}`);

      const searchResult = await this.searchService.search(keywords, 3);

      if (!searchResult.success || searchResult.results.length === 0) {
        this.logger.debug("[enrichWithSearch] No search results found");
        return null;
      }

      // 组合搜索结果
      const enrichment = searchResult.results
        .map(
          (r, i) =>
            `### 资料${i + 1}: ${r.title}\n${r.content}\n来源: ${r.url}`,
        )
        .join("\n\n");

      return enrichment;
    } catch (error) {
      this.logger.warn(`[enrichWithSearch] Search failed: ${error}`);
      return null;
    }
  }

  /**
   * 从文本中提取关键词用于搜索
   */
  private extractKeywords(text: string): string | null {
    // 简单的关键词提取：取前200字符中的名词短语
    const sample = text.slice(0, 500);

    // 匹配中文词组、英文词组、数字+单位
    const patterns = [
      /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g, // 英文专有名词
      /[\u4e00-\u9fa5]{2,8}/g, // 中文词组
      /\d+(?:亿|万|%|美元|人民币)/g, // 数字+单位
    ];

    const keywords: string[] = [];
    for (const pattern of patterns) {
      const matches = sample.match(pattern) || [];
      keywords.push(...matches.slice(0, 3));
    }

    if (keywords.length === 0) return null;

    // 去重并取前5个
    const unique = [...new Set(keywords)].slice(0, 5);
    return unique.join(" ");
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(input: TaskDecompositionInput): string {
    let message = `## 源材料\n\n${input.sourceText}\n\n`;

    if (input.userRequirement) {
      message += `## 用户需求\n\n${input.userRequirement}\n\n`;
    }

    if (input.targetPages) {
      message += `## 目标页数\n\n${input.targetPages} 页\n\n`;
    }

    if (input.stylePreference) {
      message += `## 风格偏好\n\n${input.stylePreference === "dark" ? "深色主题" : input.stylePreference === "light" ? "浅色主题" : "自定义"}\n\n`;
    }

    if (input.targetAudience) {
      message += `## 目标受众\n\n${input.targetAudience}\n\n`;
    }

    message += "请分析以上内容，输出任务分解结果（JSON 格式）。";

    return message;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(content: string): TaskDecomposition {
    // 提取 JSON 块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed);
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);

      // 尝试提取部分有效内容
      return this.createFallbackDecomposition();
    }
  }

  /**
   * 验证并规范化解析结果
   */
  private validateAndNormalize(
    parsed: Record<string, unknown>,
  ): TaskDecomposition {
    // 确保必需字段存在
    const totalPages =
      typeof parsed.totalPages === "number" ? parsed.totalPages : 10;

    const chapters: Chapter[] = Array.isArray(parsed.chapters)
      ? parsed.chapters.map((ch: Record<string, unknown>, index: number) => ({
          id: String(ch.id || `ch${index + 1}`),
          title: String(ch.title || `章节 ${index + 1}`),
          pageRange: Array.isArray(ch.pageRange)
            ? (ch.pageRange as [number, number])
            : [1, 1],
          keyPoints: Array.isArray(ch.keyPoints)
            ? ch.keyPoints.map(String)
            : [],
          emphasis: (ch.emphasis as "high" | "medium" | "low") || "medium",
        }))
      : [];

    const todoList: TodoItem[] = Array.isArray(parsed.todoList)
      ? parsed.todoList.map((todo: Record<string, unknown>, index: number) => ({
          id: String(todo.id || `todo${index + 1}`),
          content: String(todo.content || "待办事项"),
          status: "pending" as const,
          pageNumber:
            typeof todo.pageNumber === "number" ? todo.pageNumber : undefined,
        }))
      : this.generateDefaultTodoList(totalPages);

    const designStrategyRaw = parsed.designStrategy as
      | Record<string, unknown>
      | undefined;
    const designStrategy: DesignStrategy = {
      colorScheme:
        (designStrategyRaw?.colorScheme as "dark" | "light" | "custom") ||
        "dark",
      accentColor: String(designStrategyRaw?.accentColor || "#D4AF37"),
      styleReference: String(
        designStrategyRaw?.styleReference || "McKinsey-style",
      ),
      fontFamily: designStrategyRaw?.fontFamily
        ? String(designStrategyRaw.fontFamily)
        : undefined,
      targetAudience: designStrategyRaw?.targetAudience
        ? String(designStrategyRaw.targetAudience)
        : undefined,
    };

    const sourceAnalysisRaw = parsed.sourceAnalysis as
      | Record<string, unknown>
      | undefined;
    const sourceAnalysis: SourceAnalysis | undefined = sourceAnalysisRaw
      ? {
          totalWords:
            typeof sourceAnalysisRaw.totalWords === "number"
              ? sourceAnalysisRaw.totalWords
              : 0,
          language: String(sourceAnalysisRaw.language || "zh-CN"),
          topics: Array.isArray(sourceAnalysisRaw.topics)
            ? sourceAnalysisRaw.topics.map(String)
            : [],
          dataPoints: this.parseDataPoints(sourceAnalysisRaw.dataPoints),
          quotes: Array.isArray(sourceAnalysisRaw.quotes)
            ? sourceAnalysisRaw.quotes.map(String)
            : [],
          keyInsights: Array.isArray(sourceAnalysisRaw.keyInsights)
            ? sourceAnalysisRaw.keyInsights.map(String)
            : [],
        }
      : undefined;

    return {
      totalPages,
      chapters,
      todoList,
      designStrategy,
      sourceAnalysis,
    };
  }

  /**
   * 解析数据点
   */
  private parseDataPoints(raw: unknown): DataPoint[] {
    if (!Array.isArray(raw)) return [];

    return raw.map((dp: Record<string, unknown>) => ({
      type: (dp.type as DataPoint["type"]) || "number",
      value: String(dp.value || ""),
      context: String(dp.context || ""),
      source: dp.source ? String(dp.source) : undefined,
    }));
  }

  /**
   * 生成默认待办列表
   */
  private generateDefaultTodoList(totalPages: number): TodoItem[] {
    const todos: TodoItem[] = [];

    for (let i = 1; i <= totalPages; i++) {
      todos.push({
        id: `todo${i}`,
        content: `完成第 ${i} 页内容`,
        status: "pending",
        pageNumber: i,
      });
    }

    return todos;
  }

  /**
   * 创建降级分解结果
   */
  private createFallbackDecomposition(): TaskDecomposition {
    return {
      totalPages: 10,
      chapters: [
        {
          id: "ch1",
          title: "封面与目录",
          pageRange: [1, 2],
          keyPoints: ["标题", "目录"],
          emphasis: "high",
        },
        {
          id: "ch2",
          title: "主要内容",
          pageRange: [3, 8],
          keyPoints: ["核心观点"],
          emphasis: "high",
        },
        {
          id: "ch3",
          title: "总结与建议",
          pageRange: [9, 10],
          keyPoints: ["总结", "建议"],
          emphasis: "medium",
        },
      ],
      todoList: this.generateDefaultTodoList(10),
      designStrategy: {
        colorScheme: "dark",
        accentColor: "#D4AF37",
        styleReference: "McKinsey-style",
      },
    };
  }
}
