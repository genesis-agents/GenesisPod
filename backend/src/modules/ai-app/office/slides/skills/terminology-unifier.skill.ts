/**
 * Slides Engine v4.0 - Terminology Unifier Skill
 *
 * 术语统一技能 (Layer: Quality)：检测并统一演示文稿中的术语使用
 * 确保同一概念在整个演示中使用一致的术语
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  ISkill,
  SkillContext,
  SkillResult,
  SkillLayer,
  SKILL_LAYERS,
  SkillResultMetadata,
} from "@/modules/ai-engine/skills/abstractions/skill.interface";
import { AIModelService } from "../../core/ai-model.service";
import {
  AiChatService,
  ChatMessage,
} from "@/modules/ai-engine/llm/services/ai-chat.service";
import { PageState } from "../checkpoint/checkpoint.types";

/**
 * 术语统一技能输入
 */
export interface TerminologyUnifierInput {
  /** 页面状态列表 */
  pages: PageState[];
}

/**
 * MissionOrchestrator 传递的输入格式
 */
interface OrchestratorInput {
  task?: string;
  context?: {
    input?: {
      pages?: PageState[];
    };
    [key: string]: unknown;
  };
  previousOutputs?: Record<string, unknown>;
}

/**
 * 术语统一技能结果
 */
export interface TerminologyUnifierResult extends TerminologyCheckResult {}

/**
 * 术语变体
 */
export interface TerminologyVariation {
  /** 首选术语 */
  preferred: string;
  /** 其他变体 */
  alternatives: string[];
  /** 出现位置 */
  occurrences: {
    page: number;
    text: string;
    context: string;
  }[];
}

/**
 * 术语修复建议
 */
export interface TerminologyFix {
  /** 页码 */
  page: number;
  /** 原始文本 */
  original: string;
  /** 建议文本 */
  suggested: string;
  /** 术语 */
  term: string;
}

/**
 * 术语检查结果
 */
export interface TerminologyCheckResult {
  /** 检测到的术语变体 */
  variations: TerminologyVariation[];
  /** 修复建议 */
  fixes: TerminologyFix[];
  /** 一致性评分 (0-100) */
  consistencyScore: number;
  /** 检查时间 */
  checkedAt: Date;
}

/**
 * 常见术语变体映射 (用于快速检测)
 */
const COMMON_VARIATIONS: Record<string, string[]> = {
  AI: [
    "人工智能",
    "artificial intelligence",
    "A.I.",
    "Artificial Intelligence",
  ],
  ML: ["机器学习", "machine learning", "Machine Learning"],
  用户: ["客户", "使用者", "消费者"],
  数据: ["数据资源", "信息"],
  平台: ["系统", "解决方案"],
  API: ["接口", "API接口"],
  ROI: ["投资回报率", "投资回报"],
  KPI: ["关键指标", "核心指标", "绩效指标"],
  SaaS: ["云服务", "软件即服务"],
  B2B: ["企业级", "To B"],
  B2C: ["消费级", "To C"],
};

/**
 * 术语统一系统提示词
 */
const TERMINOLOGY_SYSTEM_PROMPT = `你是一位专业的术语一致性检查专家。

## 任务

分析演示文稿中的术语使用情况，识别不一致的术语并提供统一建议。

## 分析重点

1. **同义词变体**：同一概念使用了不同词汇（如"用户"和"客户"）
2. **中英文混用**：同一术语有中英文两种形式
3. **缩写不一致**：有时使用缩写，有时使用全称
4. **大小写不一致**：如 "AI" vs "ai" vs "Ai"

## 输出格式

\`\`\`json
{
  "variations": [
    {
      "preferred": "首选术语",
      "alternatives": ["变体1", "变体2"],
      "occurrences": [
        {"page": 1, "text": "出现的文本", "context": "上下文"}
      ]
    }
  ],
  "fixes": [
    {"page": 1, "original": "原始文本", "suggested": "建议文本", "term": "相关术语"}
  ],
  "consistencyScore": 85
}
\`\`\`

## 原则

1. 选择最专业、最常用的术语作为首选
2. 考虑目标受众的熟悉程度
3. 保持中英文术语的一致性策略
4. 优先使用行业标准术语`;

@Injectable()
export class TerminologyUnifierSkill
  implements ISkill<TerminologyUnifierInput, TerminologyUnifierResult>
{
  readonly id = "slides-terminology-unifier";
  readonly name = "术语统一";
  readonly description = "统一幻灯片中的术语表达";
  readonly layer: SkillLayer = SKILL_LAYERS.QUALITY;
  readonly domain = "slides";
  readonly tags = ["slides", "quality", "terminology"];
  readonly version = "4.0.0";

  private readonly logger = new Logger(TerminologyUnifierSkill.name);

  constructor(
    @Optional() private readonly aiModelService: AIModelService,
    @Optional() private readonly aiChatService: AiChatService,
  ) {}

  /**
   * 执行术语检查技能
   *
   * 支持两种输入格式：
   * 1. 直接调用: { pages: PageState[] }
   * 2. MissionOrchestrator 格式: { task, context, previousOutputs }
   */
  async execute(
    input: TerminologyUnifierInput | OrchestratorInput,
    context: SkillContext,
  ): Promise<SkillResult<TerminologyUnifierResult>> {
    const startTime = new Date();

    // 处理 Orchestrator 输入格式
    const actualInput = this.normalizeInput(input);
    if (!actualInput.pages || actualInput.pages.length === 0) {
      return {
        success: false,
        error: {
          code: "INVALID_INPUT",
          message: "Missing pages in input",
          retryable: false,
        },
        metadata: {
          executionId: context.executionId,
          startTime,
          endTime: new Date(),
          duration: Date.now() - startTime.getTime(),
        },
      };
    }

    const { pages } = actualInput;

    this.logger.log(
      `[execute] Checking terminology across ${pages.length} pages`,
    );

    try {
      // 首先使用规则引擎快速检测
      const ruleBasedVariations = this.detectWithRules(pages);

      let result: TerminologyCheckResult;

      // 如果规则检测到较多问题，使用 AI 进行深度分析
      if (ruleBasedVariations.length > 0 || pages.length > 5) {
        result = await this.checkWithAI(pages, ruleBasedVariations, context);
      } else {
        // 否则返回规则检测结果
        result = {
          variations: ruleBasedVariations,
          fixes: this.generateFixes(ruleBasedVariations),
          consistencyScore: this.calculateScore(
            ruleBasedVariations,
            pages.length,
          ),
          checkedAt: new Date(),
        };
      }

      const endTime = new Date();
      const metadata: SkillResultMetadata = {
        executionId: context.executionId,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
      };

      return {
        success: true,
        data: result,
        metadata,
      };
    } catch (error) {
      const endTime = new Date();
      const metadata: SkillResultMetadata = {
        executionId: context.executionId,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
      };

      this.logger.error(`[execute] Terminology check failed:`, error);

      return {
        success: false,
        error: {
          code: "TERMINOLOGY_CHECK_FAILED",
          message:
            error instanceof Error ? error.message : "Unknown error occurred",
          retryable: true,
        },
        metadata,
      };
    }
  }

  /**
   * 使用规则引擎检测
   */
  private detectWithRules(pages: PageState[]): TerminologyVariation[] {
    const variations: TerminologyVariation[] = [];
    const termOccurrences: Map<
      string,
      { page: number; text: string; context: string }[]
    > = new Map();

    // 遍历所有页面内容
    for (const page of pages) {
      if (!page.content) continue;

      const pageText = this.extractPageText(page);

      // 检查常见变体
      for (const [preferred, alternatives] of Object.entries(
        COMMON_VARIATIONS,
      )) {
        const allTerms = [preferred, ...alternatives];

        for (const term of allTerms) {
          const regex = new RegExp(term, "gi");
          const matches = pageText.match(regex);

          if (matches) {
            for (const match of matches) {
              const key = preferred;
              if (!termOccurrences.has(key)) {
                termOccurrences.set(key, []);
              }
              termOccurrences.get(key)!.push({
                page: page.pageNumber,
                text: match,
                context: this.extractContext(pageText, match),
              });
            }
          }
        }
      }
    }

    // 转换为变体列表
    for (const [preferred, occurrences] of termOccurrences) {
      const uniqueTerms = new Set(occurrences.map((o) => o.text.toLowerCase()));

      if (uniqueTerms.size > 1) {
        const alternatives = Array.from(uniqueTerms).filter(
          (t) => t.toLowerCase() !== preferred.toLowerCase(),
        );

        variations.push({
          preferred,
          alternatives,
          occurrences,
        });
      }
    }

    return variations;
  }

  /**
   * 使用 AI 进行深度检查
   */
  private async checkWithAI(
    pages: PageState[],
    ruleBasedVariations: TerminologyVariation[],
    _context: SkillContext, // 保留参数以供将来扩展
  ): Promise<TerminologyCheckResult> {
    const pageTexts = pages
      .map((p) => `[第${p.pageNumber}页] ${this.extractPageText(p)}`)
      .join("\n\n");

    const userMessage = `## 页面内容

${pageTexts.substring(0, 8000)}${pageTexts.length > 8000 ? "\n\n[...内容已截断...]" : ""}

## 规则检测结果

已发现 ${ruleBasedVariations.length} 个术语变体：
${ruleBasedVariations.map((v) => `- ${v.preferred}: ${v.alternatives.join(", ")}`).join("\n")}

## 请求

请深度分析术语一致性，输出完整的检查报告（JSON 格式）。`;

    // 使用数据库配置的模型（严禁硬编码模型名！）
    if (!this.aiModelService || !this.aiChatService) {
      this.logger.warn(
        "[checkWithAI] AIModelService or AiChatService not available, using rule-based result",
      );
      return {
        variations: ruleBasedVariations,
        fixes: this.generateFixes(ruleBasedVariations),
        consistencyScore: this.calculateScore(
          ruleBasedVariations,
          pages.length,
        ),
        checkedAt: new Date(),
      };
    }

    const model = await this.aiModelService.getDefaultTextModel();
    this.logger.debug(
      `[checkWithAI] Using model: ${model.displayName} (${model.modelId})`,
    );

    const messages: ChatMessage[] = [{ role: "user", content: userMessage }];

    const response = await this.aiChatService.chat({
      provider: model.provider,
      model: model.modelId,
      apiKey: model.apiKey || "",
      apiEndpoint: model.apiEndpoint || undefined,
      systemPrompt: TERMINOLOGY_SYSTEM_PROMPT,
      messages,
      maxTokens: model.maxTokens || 4096,
      temperature: model.temperature || 0.1,
    });

    if (!response) {
      this.logger.error("[checkWithAI] AI call returned no content");
      return {
        variations: ruleBasedVariations,
        fixes: this.generateFixes(ruleBasedVariations),
        consistencyScore: this.calculateScore(
          ruleBasedVariations,
          pages.length,
        ),
        checkedAt: new Date(),
      };
    }

    return this.parseResponse(
      response.content,
      ruleBasedVariations,
      pages.length,
    );
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    fallbackVariations: TerminologyVariation[],
    pageCount: number,
  ): TerminologyCheckResult {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);

      const variations: TerminologyVariation[] = Array.isArray(
        parsed.variations,
      )
        ? parsed.variations.map((v: Record<string, unknown>) => ({
            preferred: String(v.preferred || ""),
            alternatives: Array.isArray(v.alternatives)
              ? v.alternatives.map(String)
              : [],
            occurrences: Array.isArray(v.occurrences)
              ? v.occurrences.map((o: Record<string, unknown>) => ({
                  page: typeof o.page === "number" ? o.page : 1,
                  text: String(o.text || ""),
                  context: String(o.context || ""),
                }))
              : [],
          }))
        : fallbackVariations;

      const fixes: TerminologyFix[] = Array.isArray(parsed.fixes)
        ? parsed.fixes.map((f: Record<string, unknown>) => ({
            page: typeof f.page === "number" ? f.page : 1,
            original: String(f.original || ""),
            suggested: String(f.suggested || ""),
            term: String(f.term || ""),
          }))
        : this.generateFixes(variations);

      const consistencyScore =
        typeof parsed.consistencyScore === "number"
          ? parsed.consistencyScore
          : this.calculateScore(variations, pageCount);

      return {
        variations,
        fixes,
        consistencyScore,
        checkedAt: new Date(),
      };
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return {
        variations: fallbackVariations,
        fixes: this.generateFixes(fallbackVariations),
        consistencyScore: this.calculateScore(fallbackVariations, pageCount),
        checkedAt: new Date(),
      };
    }
  }

  /**
   * 提取页面文本
   */
  private extractPageText(page: PageState): string {
    const parts: string[] = [];

    if (page.content) {
      parts.push(page.content.title);
      if (page.content.subtitle) parts.push(page.content.subtitle);

      for (const section of page.content.sections) {
        if (typeof section.content === "string") {
          parts.push(section.content);
        } else if (Array.isArray(section.content)) {
          parts.push(section.content.join(" "));
        }
      }
    }

    if (page.outline) {
      parts.push(page.outline.title);
      parts.push(...page.outline.keyElements);
    }

    return parts.join(" ");
  }

  /**
   * 提取上下文
   */
  private extractContext(text: string, term: string): string {
    const index = text.toLowerCase().indexOf(term.toLowerCase());
    if (index === -1) return "";

    const start = Math.max(0, index - 20);
    const end = Math.min(text.length, index + term.length + 20);

    return text.substring(start, end);
  }

  /**
   * 生成修复建议
   */
  private generateFixes(variations: TerminologyVariation[]): TerminologyFix[] {
    const fixes: TerminologyFix[] = [];

    for (const variation of variations) {
      for (const occurrence of variation.occurrences) {
        if (
          occurrence.text.toLowerCase() !== variation.preferred.toLowerCase()
        ) {
          fixes.push({
            page: occurrence.page,
            original: occurrence.text,
            suggested: variation.preferred,
            term: variation.preferred,
          });
        }
      }
    }

    return fixes;
  }

  /**
   * 计算一致性评分
   */
  private calculateScore(
    variations: TerminologyVariation[],
    pageCount: number,
  ): number {
    if (variations.length === 0) return 100;

    // 每个变体扣分
    let deduction = 0;
    for (const variation of variations) {
      const inconsistentCount = variation.occurrences.filter(
        (o) => o.text.toLowerCase() !== variation.preferred.toLowerCase(),
      ).length;
      deduction += inconsistentCount * 3; // 每个不一致扣3分
    }

    // 基于页数调整
    const maxDeduction = pageCount * 5;
    const normalizedDeduction = Math.min(deduction, maxDeduction);

    return Math.max(0, 100 - normalizedDeduction);
  }

  /**
   * 规范化输入格式
   * 支持直接调用格式和 MissionOrchestrator 格式
   */
  private normalizeInput(
    input: TerminologyUnifierInput | OrchestratorInput,
  ): TerminologyUnifierInput {
    // 检查是否是直接调用格式（有 pages 属性）
    if ("pages" in input && Array.isArray(input.pages)) {
      return input as TerminologyUnifierInput;
    }

    // 处理 Orchestrator 格式
    const orchestratorInput = input as OrchestratorInput;
    const missionInput = orchestratorInput.context?.input;

    if (missionInput?.pages && Array.isArray(missionInput.pages)) {
      return {
        pages: missionInput.pages,
      };
    }

    // 尝试从 context 的其他位置获取 pages
    const context = orchestratorInput.context;
    if (context) {
      // 检查 context 是否直接有 pages
      if (Array.isArray((context as Record<string, unknown>).pages)) {
        return {
          pages: (context as Record<string, unknown>).pages as PageState[],
        };
      }
    }

    // 返回空输入，让调用者处理错误
    this.logger.warn(
      `[normalizeInput] Could not extract pages from input: ${JSON.stringify(Object.keys(input))}`,
    );
    return { pages: [] };
  }
}
