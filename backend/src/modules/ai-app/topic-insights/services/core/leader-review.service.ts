/**
 * Leader Review Service
 *
 * 负责审核和分析相关功能：
 * - 任务结果审核（reviewTaskResult）
 * - 章节输出审核（reviewSectionOutput）
 * - 维度结果整合（integrateDimensionResults）
 * - 事实断言提取（extractClaims）
 * - 假设验证（verifyHypotheses）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { AIModelType, LeaderDecisionType } from "@prisma/client";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import { MissionKernelBridgeService } from "./mission-kernel-bridge.service";
import {
  LEADER_REVIEW_PROMPT,
  SECTION_REVIEW_PROMPT,
  getLanguageInstruction,
} from "../../prompts";
import type {
  ReviewDecision,
  SectionPlan,
  SectionReviewDecision,
  IntegratedDimensionResult,
  LeaderModelInfo,
} from "../../types/leader.types";
import type {
  GeneratedChart,
  FigureReference,
} from "../../types/research.types";

@Injectable()
export class LeaderReviewService {
  private readonly logger = new Logger(LeaderReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
    private readonly kernelBridge: MissionKernelBridgeService,
  ) {}

  /**
   * 获取推理模型信息
   * ★ 委托给 AIEngineFacade 处理模型选择逻辑
   */
  async getReasoningModel(): Promise<LeaderModelInfo | null> {
    this.logger.debug("[getReasoningModel] Starting model selection");

    const allModels = await this.chatFacade.getAvailableModelsExtended();
    this.logger.debug(
      `[getReasoningModel] Found ${allModels.length} available models`,
    );

    // 使用 AIEngineFacade 的能力获取推理模型
    const modelInfo = await this.chatFacade.getReasoningModel();

    if (!modelInfo) {
      this.logger.error("[getReasoningModel] AI Engine returned no model");
      return null;
    }

    this.logger.log(
      `[getReasoningModel] AI Engine selected: ${modelInfo.id} (${modelInfo.provider}, isReasoning: ${modelInfo.isReasoning})`,
    );

    // 警告：如果选择的不是推理模型
    if (!modelInfo.isReasoning) {
      this.logger.warn(
        `[getReasoningModel] Selected model ${modelInfo.id} is not a reasoning model, fallback occurred`,
      );
    }

    return {
      modelId: modelInfo.id,
      modelName: modelInfo.name,
      provider: modelInfo.provider,
      isReasoning: modelInfo.isReasoning ?? false,
    };
  }

  /**
   * Leader 审核任务结果
   */
  async reviewTaskResult(
    missionId: string,
    taskId: string,
    result: string | Record<string, unknown>,
    dimensionName?: string,
    topicDescription?: string,
  ): Promise<ReviewDecision> {
    this.logger.log(`[reviewTaskResult] Reviewing task ${taskId}`);

    // 获取推理模型
    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      throw new Error("No reasoning model available for Leader");
    }

    // ★ 约束验证：从主题描述中提取约束并校验输出
    const resultStr =
      typeof result === "string" ? result : JSON.stringify(result, null, 2);
    const constraints = topicDescription
      ? this.kernelBridge.extractResearchConstraints(topicDescription)
      : [];

    let constraintSection = "";
    if (constraints.length > 0) {
      const validation = await this.kernelBridge.validateResearchOutput(
        resultStr,
        constraints,
      );
      if (!validation.isValid) {
        this.logger.warn(
          `[reviewTaskResult] Constraint violations: ${validation.violations.join("; ")}`,
        );
        constraintSection = `\n\n## 约束违规报告\n${validation.report}\n请在审核时考虑以上违规情况。`;
      }

      const promptConstraints =
        this.kernelBridge.formatConstraintsForPrompt(constraints);
      if (promptConstraints) {
        constraintSection =
          `\n\n## 研究约束\n${promptConstraints}` + constraintSection;
      }
    }

    // 构建 prompt
    const prompt = LEADER_REVIEW_PROMPT.replace(
      "{taskType}",
      "dimension_research",
    )
      .replace("{dimensionName}", dimensionName || "未知")
      .replace("{result}", resultStr);

    // 调用 AI 审核（chatStructured 自动 JSON 解析 + 重试）
    const startTime = Date.now();
    const { data: review } = await this.chatFacade.chatStructured<{
      status: "approved" | "needs_revision" | "rejected";
      feedback?: string;
      suggestions?: string[];
      revisionInstructions?: string;
    }>({
      messages: [{ role: "user", content: prompt + constraintSection }],
      systemPrompt: "你是研究质量审核专家，请输出 JSON 格式的审核决策。",
      model: leaderModel.modelId,
      taskProfile: { creativity: "low", outputLength: "medium" },
      schema: {
        type: "object",
        properties: {
          status: {
            type: "string",
            description: "approved | needs_revision | rejected",
          },
          feedback: { type: "string" },
          suggestions: { type: "array", items: { type: "string" } },
          revisionInstructions: { type: "string" },
        },
        required: ["status"],
      },
      maxRetries: 1,
      throwOnParseError: false,
    });
    const latencyMs = Date.now() - startTime;

    if (!review.status) {
      this.logger.warn(
        "[reviewTaskResult] Failed to parse review, defaulting to approved",
      );
      return {
        taskId,
        status: "approved",
        feedback: "审核通过（解析失败，默认通过）",
      };
    }

    // 记录决策
    await this.recordDecision(
      missionId,
      LeaderDecisionType.REVIEW,
      {
        taskId,
        dimensionName,
      },
      review,
      review.feedback || "",
      leaderModel.modelId,
      latencyMs,
    );

    return {
      taskId,
      status: review.status ?? "approved",
      feedback: review.feedback || "",
      suggestions: review.suggestions,
      revisionInstructions: review.revisionInstructions,
    };
  }

  /**
   * Leader 审核章节输出
   *
   * 多轮审核机制：
   * - 检查是否完成要求
   * - 不通过则返回修改指导
   * - 最多允许 3 次修订
   */
  async reviewSectionOutput(
    section: SectionPlan,
    content: string,
    revisionCount: number = 0,
    charts?: {
      generatedCharts?: GeneratedChart[];
      figureReferences?: FigureReference[];
    },
    previousSections?: Array<{ title: string; content: string }>,
    topicLanguage?: string | null,
  ): Promise<SectionReviewDecision> {
    this.logger.log(
      `[reviewSectionOutput] Reviewing section: ${section.title} (revision ${revisionCount})`,
    );

    const leaderModel = await this.getReasoningModel();
    if (!leaderModel) {
      // 无推理模型时，默认通过
      return {
        sectionId: section.id,
        approved: true,
        score: 70,
        feedback: "审核通过（无推理模型，默认通过）",
      };
    }

    const previousSummary =
      previousSections && previousSections.length > 0
        ? previousSections
            .map((s) => `### ${s.title}\n${s.content.substring(0, 800)}...`)
            .join("\n\n")
        : "无前置章节";

    let prompt = SECTION_REVIEW_PROMPT.replace("{sectionTitle}", section.title)
      .replace("{sectionDescription}", section.description)
      .replace("{keyPoints}", section.keyPoints.join(", "))
      .replace("{targetWords}", String(section.targetWords))
      .replace(
        "{minReferences}",
        String(section.evidenceRequirements.minReferences),
      )
      .replace("{sectionContent}", content)
      .replace("{previousSectionsSummary}", previousSummary)
      .replace(
        "{languageInstruction}",
        getLanguageInstruction(topicLanguage || "zh"),
      );

    // ★ 注入图表数据供审核
    if (charts?.generatedCharts?.length || charts?.figureReferences?.length) {
      prompt += `\n\n## 章节图表数据\n\`\`\`json\n${JSON.stringify(charts, null, 2)}\n\`\`\``;
    }

    const response = await this.chatFacade.chatWithSkills({
      messages: [
        {
          role: "system",
          content: "你是研究质量审核专家，请输出 JSON 格式的审核决策。",
        },
        { role: "user", content: prompt },
      ],
      additionalSkills: ["section-review"],
      model: leaderModel.modelId,
      taskProfile: {
        creativity: "low",
        outputLength: "medium",
      },
    });

    const review = this.extractJsonFromResponse<{
      approved: boolean;
      score: number;
      feedback: string;
      revisionInstructions?: string;
    }>(response.content, "approved"); // requiredKey for validation

    if (!review) {
      // 解析失败，默认通过
      return {
        sectionId: section.id,
        approved: true,
        score: 70,
        feedback: "审核通过（解析失败，默认通过）",
      };
    }

    // 如果已经修订多次，强制通过
    if (!review.approved && revisionCount >= 2) {
      this.logger.warn(
        `[reviewSectionOutput] Max revisions reached, forcing approval for ${section.title}`,
      );
      return {
        sectionId: section.id,
        approved: true,
        score: Math.max(review.score, 60),
        feedback: `${review.feedback}（已达最大修订次数，强制通过）`,
      };
    }

    return {
      sectionId: section.id,
      approved: review.approved,
      score: review.score,
      feedback: review.feedback,
      revisionInstructions: review.revisionInstructions,
    };
  }

  /**
   * Leader 整合各章节内容
   *
   * 将多个章节整合成完整报告：
   * - 添加过渡语句
   * - 提取关键发现
   * - 生成总结
   */
  async integrateDimensionResults(
    dimension: { name: string; description?: string | null },
    sectionResults: Array<{ title: string; content: string }>,
  ): Promise<IntegratedDimensionResult> {
    this.logger.log(
      `[integrateDimensionResults] Integrating ${sectionResults.length} sections for ${dimension.name}`,
    );

    // 如果只有一个章节，直接返回（但仍提取关键发现）
    if (sectionResults.length === 1) {
      const content = sectionResults[0].content;
      const keyFindings = this.extractKeyFindingsFromContent(content);
      return {
        content: `# ${dimension.name}\n\n${content}`,
        metadata: {
          summary: content.substring(0, 200),
          keyFindings,
          confidenceLevel: "medium",
        },
        evidenceUsed: this.extractEvidenceIds(content),
        totalWords: content.length,
      };
    }

    const leaderModel = await this.getReasoningModel();

    // 构建章节内容
    const sectionsContent = sectionResults
      .map((s, i) => `### ${i + 1}. ${s.title}\n\n${s.content}`)
      .join("\n\n---\n\n");

    // 如果没有推理模型，使用简单拼接（但仍提取关键发现）
    if (!leaderModel) {
      const content = `# ${dimension.name}\n\n${sectionsContent}`;
      const keyFindings = this.extractKeyFindingsFromContent(content);
      return {
        content,
        metadata: {
          summary: `关于"${dimension.name}"的分析报告。`,
          keyFindings,
          confidenceLevel: "medium",
        },
        evidenceUsed: this.extractEvidenceIds(content),
        totalWords: content.length,
      };
    }

    // ★ 保留完整章节内容（不压缩），仅用AI提取摘要和关键发现
    const fullContent = `# ${dimension.name}\n\n${sectionsContent}`;
    const totalWords = fullContent.length;

    // 用AI提取摘要和关键发现（但不重写正文）
    let summary = `关于"${dimension.name}"的深度分析报告。`;
    let keyFindings = this.extractKeyFindingsFromContent(fullContent);

    try {
      const metaPrompt = `请阅读以下研究内容，输出JSON格式的摘要和关键发现：

维度：${dimension.name}
${dimension.description || ""}

内容（前8000字）：
${fullContent.substring(0, 8000)}

输出格式：
\`\`\`json
{
  "summary": "200-300字的维度总结摘要",
  "keyFindings": ["关键发现1（50-100字）", "关键发现2", ...]
}
\`\`\`
要求：summary 200-300字，keyFindings 5-8条，每条50-100字。`;

      const metaResponse = await this.chatFacade.chatWithSkills({
        messages: [
          { role: "system", content: "你是研究报告整合专家，请输出JSON。" },
          { role: "user", content: metaPrompt },
        ],
        additionalSkills: ["dimension-synthesizer"],
        model: leaderModel.modelId,
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      const metaResult = this.extractJsonFromResponse<{
        summary?: string;
        keyFindings?: string[];
      }>(metaResponse.content, "summary");

      if (metaResult?.summary) summary = metaResult.summary;
      if (metaResult?.keyFindings?.length) keyFindings = metaResult.keyFindings;
    } catch (err) {
      this.logger.warn(
        `[integrateDimensionResults] Meta extraction failed, using fallback: ${(err as Error).message}`,
      );
    }

    this.logger.log(
      `[integrateDimensionResults] Preserved ${sectionResults.length} sections (${totalWords} chars), ${keyFindings.length} keyFindings`,
    );

    return {
      content: fullContent,
      metadata: {
        summary,
        keyFindings,
        confidenceLevel: "medium",
      },
      evidenceUsed: this.extractEvidenceIds(fullContent),
      totalWords,
    };
  }

  /**
   * V5 L3: 从章节内容中提取事实断言
   * 使用 CHAT_FAST 模型批量处理
   */
  async extractClaims(
    sectionId: string,
    sectionContent: string,
  ): Promise<import("../../types/v5-research.types").ExtractedClaim[]> {
    this.logger.log(
      `[extractClaims] Extracting claims from section ${sectionId}`,
    );

    const { CLAIM_EXTRACTION_PROMPT } =
      await import("../../prompts/v5-research.prompt");
    const prompt = CLAIM_EXTRACTION_PROMPT.replace(
      "{sectionContent}",
      sectionContent.substring(0, 4000),
    ).replace("{sectionId}", sectionId);

    try {
      const { data } = await this.chatFacade.chatStructured<{
        claims: import("../../types/v5-research.types").ExtractedClaim[];
      }>({
        messages: [{ role: "user", content: prompt }],
        systemPrompt:
          "你是事实核查专家，精确提取可验证的事实断言。请输出 JSON 格式。",
        modelType: AIModelType.CHAT_FAST,
        taskProfile: { creativity: "deterministic", outputLength: "medium" },
        schema: {
          type: "object",
          properties: {
            claims: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  source: { type: "string" },
                  confidence: { type: "number" },
                },
                required: ["text"],
              },
            },
          },
          required: ["claims"],
        },
        maxRetries: 1,
        throwOnParseError: false,
      });

      if (data?.claims?.length) {
        this.logger.log(
          `[extractClaims] Extracted ${data.claims.length} claims from section ${sectionId}`,
        );
        return data.claims;
      }

      this.logger.warn(
        `[extractClaims] Failed to parse claims for section ${sectionId}`,
      );
      return [];
    } catch (error) {
      this.logger.error(`[extractClaims] Error extracting claims: ${error}`);
      return [];
    }
  }

  /**
   * V5 L3: 验证研究假设
   * 根据收集到的证据验证 L1 阶段提出的假设
   */
  async verifyHypotheses(
    hypotheses: import("../../types/v5-research.types").ResearchHypothesis[],
    evidenceSummary: string,
  ): Promise<
    import("../../types/v5-research.types").HypothesisVerificationResult[]
  > {
    if (hypotheses.length === 0) return [];

    this.logger.log(
      `[verifyHypotheses] Verifying ${hypotheses.length} hypotheses`,
    );

    const { HYPOTHESIS_VERIFICATION_PROMPT } =
      await import("../../prompts/v5-research.prompt");
    const prompt = HYPOTHESIS_VERIFICATION_PROMPT.replace(
      "{hypothesesJson}",
      JSON.stringify(hypotheses, null, 2),
    ).replace("{evidenceSummary}", evidenceSummary.substring(0, 6000));

    try {
      const { data } = await this.chatFacade.chatStructured<{
        results: import("../../types/v5-research.types").HypothesisVerificationResult[];
      }>({
        messages: [{ role: "user", content: prompt }],
        systemPrompt:
          "你是研究方法论专家，严谨验证研究假设。请输出 JSON 格式。",
        modelType: AIModelType.CHAT_FAST,
        taskProfile: { creativity: "low", outputLength: "medium" },
        schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  status: {
                    type: "string",
                    description: "supported | contradicted | inconclusive",
                  },
                  evidence: { type: "string" },
                },
                required: ["status"],
              },
            },
          },
          required: ["results"],
        },
        maxRetries: 1,
        throwOnParseError: false,
      });

      if (data?.results?.length) {
        this.logger.log(
          `[verifyHypotheses] Verified ${data.results.length} hypotheses`,
        );
        return data.results;
      }

      this.logger.warn(
        `[verifyHypotheses] Failed to parse hypothesis verification results`,
      );
      return [];
    } catch (error) {
      this.logger.error(`[verifyHypotheses] Error: ${error}`);
      return [];
    }
  }

  /**
   * 从 AI 响应中提取 JSON
   * 使用增强的 extractJsonFromAIResponse 工具，支持截断响应修复
   */
  private extractJsonFromResponse<T>(
    response: string,
    requiredKey?: string,
  ): T | null {
    // 处理空响应
    if (!response || response.trim().length === 0) {
      this.logger.warn("[extractJsonFromResponse] Empty response received");
      return null;
    }

    const result = extractJsonFromAIResponse<T>(response, { requiredKey });

    if (result.success && result.data) {
      this.logger.debug(
        `[extractJsonFromResponse] Extracted via method: ${result.method}`,
      );
      return result.data;
    }

    this.logger.error(
      `[extractJsonFromResponse] Could not extract JSON: ${result.error || "unknown error"}`,
    );
    return null;
  }

  /**
   * 记录 Leader 决策
   */
  private async recordDecision(
    missionId: string,
    type: LeaderDecisionType,
    input: Record<string, unknown>,
    decision: Record<string, unknown>,
    reasoning: string,
    modelUsed?: string,
    latencyMs?: number,
  ): Promise<void> {
    try {
      await this.prisma.leaderDecision.create({
        data: {
          missionId,
          type,
          input: toPrismaJson(input),
          decision: toPrismaJson(decision),
          reasoning,
          modelUsed,
          latencyMs,
        },
      });
    } catch (error) {
      this.logger.error(`[recordDecision] Failed to record decision: ${error}`);
    }
  }

  /**
   * 从内容中提取证据 ID
   */
  private extractEvidenceIds(content: string): string[] {
    const matches = content.match(/\[temp-\d+-\d+\]/g) || [];
    return [...new Set(matches.map((m) => m.slice(1, -1)))];
  }

  /**
   * 从内容中自动提取关键发现
   * 用于 fallback 场景（单章节、无推理模型、整合失败等）
   * 策略：
   * 1. 查找带有特定标记的句子（如"关键"、"重要"、"核心"等）
   * 2. 查找 Markdown 标题后的第一句话
   * 3. 提取带引用的观点
   */
  private extractKeyFindingsFromContent(content: string): string[] {
    const findings: string[] = [];

    // 1. 查找明确标注的关键发现（如"关键发现："后面的内容）
    const markedFindingsMatch = content.match(
      /(?:关键发现|核心观点|主要结论|重要发现)[：:]\s*([^\n]+)/g,
    );
    if (markedFindingsMatch) {
      for (const match of markedFindingsMatch) {
        const finding = match
          .replace(/(?:关键发现|核心观点|主要结论|重要发现)[：:]\s*/, "")
          .trim();
        if (finding.length > 10 && finding.length < 200) {
          findings.push(finding);
        }
      }
    }

    // 2. 从列表项中提取（Markdown 列表）
    const listItemMatches = content.match(/^[-*]\s+.{20,150}(?:。|$)/gm);
    if (listItemMatches && findings.length < 5) {
      for (const item of listItemMatches.slice(0, 5 - findings.length)) {
        const finding = item.replace(/^[-*]\s+/, "").trim();
        if (!findings.includes(finding)) {
          findings.push(finding);
        }
      }
    }

    // 3. 从标题下方第一句话提取（Markdown 标题）
    const headerMatches = content.match(
      /^#{2,4}\s+[^\n]+\n+([^#\n][^\n]{20,150})/gm,
    );
    if (headerMatches && findings.length < 5) {
      for (const match of headerMatches.slice(0, 3)) {
        const lines = match.split("\n").filter((l) => l.trim());
        if (lines.length > 1) {
          const sentence = lines[1].trim().replace(/^[-*]\s+/, "");
          if (sentence.length > 20 && !findings.includes(sentence)) {
            findings.push(sentence);
          }
        }
      }
    }

    // 去重并限制数量
    return [...new Set(findings)].slice(0, 5);
  }
}
