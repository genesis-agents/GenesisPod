/**
 * Slides Engine v3.0 - Intent Analyzer Skill
 *
 * 意图分析技能 (Layer 1)：分析用户源文本和需求，理解演示意图
 * 使用 Architect 角色 (CHAT + QUALITY_FIRST)
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  MultiModelService,
  RoleCallInput,
} from "../orchestrator/multi-model.service";
import {
  IntentAnalysis,
  PresentationPurpose,
  PresentationTone,
  AudienceInfo,
  PresentationConstraints,
} from "../checkpoint/checkpoint.types";

/**
 * 意图分析输入
 */
export interface IntentAnalyzerInput {
  /** 源文本内容 */
  sourceText: string;
  /** 用户需求描述 (可选) */
  userRequirement?: string;
  /** 目标页数 (可选) */
  targetPages?: number;
  /** 目标受众描述 (可选) */
  targetAudience?: string;
  /** 会话 ID */
  sessionId?: string;
}

/**
 * 意图分析系统提示词
 */
const INTENT_ANALYSIS_SYSTEM_PROMPT = `你是一位专业的演示文稿策略顾问，负责分析用户的真实意图和演示目标。

## 你的任务

分析用户提供的源文本和需求描述，输出结构化的意图分析结果：

1. **演示目的** (purpose)：判断这是什么类型的演示
   - inform: 信息传达（产品介绍、技术分享、知识普及）
   - persuade: 说服影响（融资路演、销售提案、政策推动）
   - instruct: 教学指导（培训课程、操作指南、最佳实践）
   - inspire: 激励鼓舞（愿景演讲、团队动员、文化宣讲）
   - report: 汇报总结（项目汇报、季度总结、研究报告）

2. **目标受众** (audience)：谁会看这个演示
   - type: 受众类型（investor/customer/internal/public/executive/technical）
   - expertise: 专业程度（expert/general/novice）
   - expectations: 他们的期望和关注点

3. **演示语调** (tone)：应该用什么风格
   - formal: 正式（政府、学术、法律场合）
   - professional: 专业（商务、企业、行业）
   - casual: 休闲（内部分享、创意行业）
   - inspiring: 激励（愿景、变革、激励）
   - analytical: 分析性（研究、数据、技术）

4. **核心信息** (keyMessage)：一句话总结演示的核心观点

5. **预期成果** (expectedOutcome)：演示结束后希望达成什么

6. **约束条件** (constraints)：有什么限制

## 输出格式

严格按照以下 JSON 格式输出：

\`\`\`json
{
  "purpose": "inform|persuade|instruct|inspire|report",
  "audience": {
    "type": "investor|customer|internal|public|executive|technical",
    "expertise": "expert|general|novice",
    "expectations": ["期望1", "期望2", "期望3"]
  },
  "tone": "formal|professional|casual|inspiring|analytical",
  "keyMessage": "一句话核心信息",
  "expectedOutcome": "演示结束后的预期成果",
  "constraints": {
    "timeLimit": null,
    "pageLimit": null,
    "brandGuidelines": null
  },
  "confidence": 0.85
}
\`\`\`

## 分析原则

1. **优先从源文本推断**：源文本是最可靠的意图来源
2. **参考用户需求**：用户明确表达的需求优先级高
3. **合理假设**：当信息不足时，基于行业惯例做出合理假设
4. **诚实置信度**：对不确定的分析给出较低的置信度`;

@Injectable()
export class IntentAnalyzerSkill {
  private readonly logger = new Logger(IntentAnalyzerSkill.name);

  constructor(private readonly multiModel: MultiModelService) {}

  /**
   * 执行意图分析
   */
  async execute(input: IntentAnalyzerInput): Promise<IntentAnalysis> {
    this.logger.log(
      `[execute] Starting intent analysis, source length: ${input.sourceText.length}`,
    );

    const userMessage = this.buildUserMessage(input);

    const roleCall: RoleCallInput = {
      role: "architect",
      messages: [
        { role: "system", content: INTENT_ANALYSIS_SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      maxTokens: 2048,
      temperature: 0.2,
      metadata: {
        sessionId: input.sessionId,
        phase: "intent_analysis",
      },
    };

    const result = await this.multiModel.callByRole(roleCall);

    if (!result.success || !result.content) {
      this.logger.error("[execute] AI call failed:", result.error);
      return this.createFallbackAnalysis(input);
    }

    const analysis = this.parseResponse(result.content, input);

    this.logger.log(
      `[execute] Intent analysis complete: purpose=${analysis.purpose}, tone=${analysis.tone}, confidence=${analysis.confidence}`,
    );

    return analysis;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(input: IntentAnalyzerInput): string {
    const { sourceText, userRequirement, targetPages, targetAudience } = input;

    // 截取源文本的关键部分（开头和结尾最重要）
    const textPreview = this.extractKeyParts(sourceText, 3000);

    return `## 源文本内容

${textPreview}

## 用户需求描述

${userRequirement || "用户未提供具体需求描述"}

## 已知信息

- 目标页数: ${targetPages || "未指定"}
- 目标受众: ${targetAudience || "未指定"}
- 源文本总长度: ${sourceText.length} 字符

## 请求

请分析以上内容，输出结构化的意图分析结果（JSON 格式）。`;
  }

  /**
   * 提取源文本的关键部分
   */
  private extractKeyParts(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    // 提取开头 40%、中间 20%、结尾 40%
    const headLength = Math.floor(maxLength * 0.4);
    const tailLength = Math.floor(maxLength * 0.4);
    const midLength = maxLength - headLength - tailLength;

    const head = text.substring(0, headLength);
    const mid = text.substring(
      Math.floor(text.length / 2) - Math.floor(midLength / 2),
      Math.floor(text.length / 2) + Math.floor(midLength / 2),
    );
    const tail = text.substring(text.length - tailLength);

    return `${head}\n\n[...中间内容省略...]\n\n${mid}\n\n[...中间内容省略...]\n\n${tail}`;
  }

  /**
   * 解析 AI 响应
   */
  private parseResponse(
    content: string,
    input: IntentAnalyzerInput,
  ): IntentAnalysis {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : content;

    try {
      const parsed = JSON.parse(jsonStr);
      return this.validateAndNormalize(parsed, input);
    } catch (error) {
      this.logger.error("[parseResponse] JSON parse error:", error);
      return this.createFallbackAnalysis(input);
    }
  }

  /**
   * 验证并规范化解析结果
   */
  private validateAndNormalize(
    parsed: Record<string, unknown>,
    input: IntentAnalyzerInput,
  ): IntentAnalysis {
    // 验证 purpose
    const validPurposes: PresentationPurpose[] = [
      "inform",
      "persuade",
      "instruct",
      "inspire",
      "report",
    ];
    const purpose: PresentationPurpose = validPurposes.includes(
      parsed.purpose as PresentationPurpose,
    )
      ? (parsed.purpose as PresentationPurpose)
      : "report";

    // 验证 tone
    const validTones: PresentationTone[] = [
      "formal",
      "professional",
      "casual",
      "inspiring",
      "analytical",
    ];
    const tone: PresentationTone = validTones.includes(
      parsed.tone as PresentationTone,
    )
      ? (parsed.tone as PresentationTone)
      : "professional";

    // 解析 audience
    const audienceRaw = parsed.audience as Record<string, unknown> | undefined;
    const audience: AudienceInfo = {
      type: String(audienceRaw?.type || input.targetAudience || "general"),
      expertise:
        (audienceRaw?.expertise as AudienceInfo["expertise"]) || "general",
      expectations: Array.isArray(audienceRaw?.expectations)
        ? audienceRaw.expectations.map(String)
        : ["了解核心内容", "获取关键信息"],
    };

    // 解析 constraints
    const constraintsRaw = parsed.constraints as
      | Record<string, unknown>
      | undefined;
    const constraints: PresentationConstraints = {
      timeLimit:
        typeof constraintsRaw?.timeLimit === "number"
          ? constraintsRaw.timeLimit
          : undefined,
      pageLimit: input.targetPages || undefined,
      brandGuidelines: constraintsRaw?.brandGuidelines
        ? String(constraintsRaw.brandGuidelines)
        : undefined,
    };

    return {
      purpose,
      audience,
      tone,
      keyMessage: String(parsed.keyMessage || "核心信息待提取"),
      expectedOutcome: String(parsed.expectedOutcome || "让受众理解核心内容"),
      constraints,
      confidence:
        typeof parsed.confidence === "number"
          ? Math.min(1, Math.max(0, parsed.confidence))
          : 0.7,
      analyzedAt: new Date(),
    };
  }

  /**
   * 创建降级分析结果
   */
  private createFallbackAnalysis(input: IntentAnalyzerInput): IntentAnalysis {
    // 基于简单规则推断
    const sourceText = input.sourceText.toLowerCase();

    // 推断目的
    let purpose: PresentationPurpose = "report";
    if (
      sourceText.includes("融资") ||
      sourceText.includes("投资") ||
      sourceText.includes("提案")
    ) {
      purpose = "persuade";
    } else if (
      sourceText.includes("教程") ||
      sourceText.includes("指南") ||
      sourceText.includes("培训")
    ) {
      purpose = "instruct";
    } else if (
      sourceText.includes("愿景") ||
      sourceText.includes("使命") ||
      sourceText.includes("激励")
    ) {
      purpose = "inspire";
    } else if (
      sourceText.includes("介绍") ||
      sourceText.includes("产品") ||
      sourceText.includes("功能")
    ) {
      purpose = "inform";
    }

    // 推断语调
    let tone: PresentationTone = "professional";
    if (sourceText.includes("数据") || sourceText.includes("分析")) {
      tone = "analytical";
    }

    return {
      purpose,
      audience: {
        type: input.targetAudience || "general",
        expertise: "general",
        expectations: ["了解核心内容"],
      },
      tone,
      keyMessage: "核心信息待提取",
      expectedOutcome: "让受众理解核心内容",
      constraints: {
        pageLimit: input.targetPages,
      },
      confidence: 0.5,
      analyzedAt: new Date(),
    };
  }
}
