/**
 * Slides Engine v3.0 - Task Decomposition Skill
 *
 * 任务分解技能：分析源材料，规划 PPT 结构
 * 使用 Architect 角色 (CHAT + QUALITY_FIRST)
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import {
  TaskDecomposition,
  Chapter,
  TodoItem,
  DesignStrategy,
  SourceAnalysis,
  DataPoint,
} from "../checkpoint/checkpoint.types";

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
- 为每个数据点建议最适合的图表类型`;

@Injectable()
export class TaskDecompositionSkill {
  private readonly logger = new Logger(TaskDecompositionSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行任务分解
   */
  async execute(input: TaskDecompositionInput): Promise<TaskDecomposition> {
    this.logger.log(
      `[execute] Starting task decomposition, source length: ${input.sourceText.length}`,
    );

    const userMessage = this.buildUserMessage(input);

    const roleCall: RoleCallInput = {
      role: "architect",
      messages: [
        { role: "system", content: TASK_DECOMPOSITION_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 4096,
      temperature: 0.3,
      metadata: {
        sessionId: input.sessionId,
        phase: "task_decomposition",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[execute] AI call failed:", result.error);
      throw new Error(`Task decomposition failed: ${result.error}`);
    }

    // 解析 JSON 响应
    const decomposition = this.parseResponse(result.content);

    this.logger.log(
      `[execute] Task decomposition complete: ${decomposition.totalPages} pages, ${decomposition.chapters.length} chapters`,
    );

    return decomposition;
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
