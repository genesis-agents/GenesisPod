import { Injectable, Logger } from "@nestjs/common";
import { AIEngineFacade } from "@/modules/ai-engine/facade";
import { AIModelType } from "@prisma/client";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type { DimensionAnalysisResult } from "../types/research.types";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";

/**
 * 审核质量等级
 */
export enum ReviewQualityLevel {
  EXCELLENT = "excellent", // 优秀，可直接使用
  GOOD = "good", // 良好，可使用但有改进空间
  ACCEPTABLE = "acceptable", // 可接受，建议改进
  NEEDS_REVISION = "needs_revision", // 需要修订
  REJECTED = "rejected", // 拒绝，需要重新研究
}

/**
 * 单维度审核结果
 */
export interface DimensionReviewResult {
  dimensionId: string;
  dimensionName: string;
  qualityLevel: ReviewQualityLevel;
  overallScore: number; // 0-100
  scores: {
    breadth: number; // 广度得分
    depth: number; // 深度得分
    evidence: number; // 证据支撑得分
    coherence: number; // 逻辑连贯性得分
    currency: number; // 时效性得分
  };
  issues: ReviewIssue[];
  suggestions: string[];
  needsReresearch: boolean;
  reresearchFocus?: string[];
  actualModelId?: string; // ★ 实际使用的模型
}

/**
 * 审核问题
 */
export interface ReviewIssue {
  type:
    | "missing_coverage" // 缺少覆盖
    | "weak_evidence" // 证据薄弱
    | "outdated_info" // 信息过时
    | "logical_gap" // 逻辑漏洞
    | "shallow_analysis" // 分析浅显
    | "missing_perspective"; // 缺少视角
  severity: "critical" | "major" | "minor";
  description: string;
  affectedSection?: string;
}

/**
 * 全局审核结果
 */
export interface OverallReviewResult {
  topicId: string;
  topicName: string;
  qualityLevel: ReviewQualityLevel;
  overallScore: number;
  dimensionReviews: DimensionReviewResult[];
  crossDimensionIssues: ReviewIssue[];
  coverageAnalysis: {
    coveredAspects: string[];
    missingAspects: string[];
    coverageScore: number;
  };
  recommendations: string[];
  needsReresearch: boolean;
  dimensionsToReresearch: string[];
}

/**
 * AI 审核响应
 */
interface AIReviewResponse {
  qualityLevel: ReviewQualityLevel;
  overallScore: number;
  scores: {
    breadth: number;
    depth: number;
    evidence: number;
    coherence: number;
    currency: number;
  };
  issues: Array<{
    type: string;
    severity: string;
    description: string;
    affectedSection?: string;
  }>;
  suggestions: string[];
  needsReresearch: boolean;
  reresearchFocus?: string[];
}

/**
 * Research Reviewer Service
 *
 * 质量审核员服务 - 负责审核研究质量
 *
 * 职责：
 * 1. 审核每个维度的研究质量
 * 2. 检查研究广度（是否覆盖关键角度）
 * 3. 检查研究深度（是否有足够证据支撑）
 * 4. 评估逻辑连贯性和时效性
 * 5. 提出改进建议或触发重新研究
 *
 * 质量标准：
 * - 广度：每个维度必须覆盖主要方面，不能遗漏关键角度
 * - 深度：每个发现必须有至少2个证据支撑，分析要深入本质
 * - 证据：证据来源多样，可信度高，时效性好
 * - 连贯：分析逻辑清晰，结论有依据
 * - 时效：信息来源不超过6个月，关注最新动态
 */
@Injectable()
export class ResearchReviewerService {
  private readonly logger = new Logger(ResearchReviewerService.name);

  // 质量阈值
  private readonly QUALITY_THRESHOLDS = {
    excellent: 90,
    good: 75,
    acceptable: 60,
    needsRevision: 40,
  };

  // 最低可接受分数
  private readonly MIN_ACCEPTABLE_SCORE = 60;

  constructor(private readonly aiFacade: AIEngineFacade) {}

  /**
   * 审核单个维度的研究质量
   */
  async reviewDimension(
    topic: ResearchTopic,
    dimension: TopicDimension,
    analysis: DimensionAnalysisResult,
    evidenceCount: number,
  ): Promise<DimensionReviewResult> {
    this.logger.log(
      `Reviewing dimension: ${dimension.name} for topic: ${topic.name}`,
    );

    const systemPrompt = this.buildDimensionReviewSystemPrompt();
    const userPrompt = this.buildDimensionReviewUserPrompt(
      topic,
      dimension,
      analysis,
      evidenceCount,
    );

    try {
      const response = await this.aiFacade.chat({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        modelType: AIModelType.CHAT,
        taskProfile: {
          creativity: "low",
          outputLength: "medium",
        },
      });

      // Use robust JSON extraction to handle markdown code blocks
      const extractionResult = extractJsonFromAIResponse<AIReviewResponse>(
        response.content,
        { requiredKey: "qualityLevel" },
      );

      if (!extractionResult.success || !extractionResult.data) {
        this.logger.error(
          `Failed to parse review response for dimension ${dimension.name}:`,
          extractionResult.error,
        );
        throw new Error(
          extractionResult.error || "Failed to parse AI response",
        );
      }

      const reviewData = extractionResult.data;

      const result: DimensionReviewResult = {
        dimensionId: dimension.id,
        dimensionName: dimension.name,
        qualityLevel: this.determineQualityLevel(reviewData.overallScore),
        overallScore: reviewData.overallScore,
        scores: reviewData.scores,
        issues: reviewData.issues.map((issue) => ({
          type: issue.type as ReviewIssue["type"],
          severity: issue.severity as ReviewIssue["severity"],
          description: issue.description,
          affectedSection: issue.affectedSection,
        })),
        suggestions: reviewData.suggestions,
        needsReresearch:
          reviewData.needsReresearch ||
          reviewData.overallScore < this.MIN_ACCEPTABLE_SCORE,
        reresearchFocus: reviewData.reresearchFocus,
        actualModelId: response.model, // ★ 记录实际使用的模型
      };

      // ★ 空内容/拒写检测：检查 detailedContent 是否过短或包含拒写关键词
      const refusalKeywords = [
        "I cannot",
        "I'm unable",
        "I apologize",
        "I'm sorry",
        "I am unable",
        "I'm not able",
        "cannot provide",
        "cannot generate",
        "I do not have",
        "don't have access",
        "beyond my capabilities",
        "outside my scope",
        "Unfortunately, I",
        "I must decline",
        "无法提供",
        "无法生成",
        "无法完成",
        "无法回答",
        "抱歉",
        "我无法",
        "超出范围",
        "不在我的能力",
        "As an AI",
        "作为AI",
        "I don't have access",
      ];
      const contentLength = analysis.detailedContent?.length || 0;
      const hasRefusal = refusalKeywords.some((kw) =>
        analysis.detailedContent?.toLowerCase().includes(kw.toLowerCase()),
      );

      // 只有当内容短且包含拒写关键词时才自动标记为 NEEDS_REVISION
      // 如果只是短内容（< 100）但没有拒写，仅作为警告不强制重做
      if (contentLength < 100 && hasRefusal) {
        this.logger.warn(
          `Dimension ${dimension.name}: empty/refused content detected (length=${contentLength}, hasRefusal=${hasRefusal})`,
        );
        result.needsReresearch = true;
        result.qualityLevel = ReviewQualityLevel.NEEDS_REVISION;
        result.issues.push({
          type: "shallow_analysis",
          severity: "critical",
          description: `内容疑似拒写且严重不足（长度: ${contentLength} 字符，低于 100 字符最低要求）`,
        });
      } else if (contentLength < 100) {
        // 仅短内容，警告但不强制重做
        this.logger.warn(
          `Dimension ${dimension.name}: short content (length=${contentLength})`,
        );
        result.issues.push({
          type: "shallow_analysis",
          severity: "major",
          description: `内容较短（仅 ${contentLength} 字符，低于 100 字符建议值），但未检测到拒写`,
        });
      } else if (hasRefusal) {
        // 有拒写但长度足够（可能是部分拒写），标记为需重做
        this.logger.warn(
          `Dimension ${dimension.name}: refusal detected (length=${contentLength})`,
        );
        result.needsReresearch = true;
        result.qualityLevel = ReviewQualityLevel.NEEDS_REVISION;
        result.issues.push({
          type: "shallow_analysis",
          severity: "critical",
          description: `内容包含拒写关键词（长度: ${contentLength} 字符）`,
        });
      }

      this.logger.log(
        `Dimension ${dimension.name} review complete: ${result.qualityLevel} (${result.overallScore}/100)`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to review dimension ${dimension.name}:`, error);
      // 返回一个需要重新研究的结果
      return this.createFailedReviewResult(dimension, error);
    }
  }

  /**
   * 审核整体研究质量
   */
  async reviewOverall(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    dimensionReviews: DimensionReviewResult[],
  ): Promise<OverallReviewResult> {
    this.logger.log(`Performing overall review for topic: ${topic.name}`);

    // 计算整体分数
    const overallScore =
      dimensionReviews.length > 0
        ? dimensionReviews.reduce((sum, r) => sum + r.overallScore, 0) /
          dimensionReviews.length
        : 0;

    // 检查跨维度问题
    const crossDimensionIssues = await this.analyzeCrossDimensionIssues(
      topic,
      dimensions,
      dimensionReviews,
    );

    // 分析覆盖度
    const coverageAnalysis = this.analyzeCoverage(topic, dimensions);

    // 确定需要重新研究的维度
    const dimensionsToReresearch = dimensionReviews
      .filter((r) => r.needsReresearch)
      .map((r) => r.dimensionId);

    // 生成总体建议
    const recommendations = this.generateOverallRecommendations(
      dimensionReviews,
      crossDimensionIssues,
      coverageAnalysis,
    );

    const result: OverallReviewResult = {
      topicId: topic.id,
      topicName: topic.name,
      qualityLevel: this.determineQualityLevel(overallScore),
      overallScore,
      dimensionReviews,
      crossDimensionIssues,
      coverageAnalysis,
      recommendations,
      needsReresearch: dimensionsToReresearch.length > 0,
      dimensionsToReresearch,
    };

    this.logger.log(
      `Overall review complete: ${result.qualityLevel} (${result.overallScore.toFixed(1)}/100), ` +
        `${dimensionsToReresearch.length} dimensions need reresearch`,
    );

    return result;
  }

  /**
   * V5 L3: 交叉验证 Claims
   * 使用 LLM 语义匹配（非关键词），批量验证每 5 个 claims
   */
  async validateClaims(
    claims: import("../types/v5-research.types").ExtractedClaim[],
    evidenceSummary: string,
  ): Promise<import("../types/v5-research.types").ClaimValidationBatchResult> {
    if (claims.length === 0) {
      return {
        results: [],
        stats: { verified: 0, unverified: 0, disputed: 0, total: 0 },
      };
    }

    this.logger.log(
      `[validateClaims] Validating ${claims.length} claims in batches of 5`,
    );

    const { CLAIM_VALIDATION_PROMPT } =
      await import("../prompts/v5-research.prompt");
    const allResults: import("../types/v5-research.types").ClaimValidationResult[] =
      [];
    const BATCH_SIZE = 5;

    // Process in batches of 5
    for (let i = 0; i < claims.length; i += BATCH_SIZE) {
      const batch = claims.slice(i, i + BATCH_SIZE);
      const prompt = CLAIM_VALIDATION_PROMPT.replace(
        "{claimsJson}",
        JSON.stringify(batch, null, 2),
      ).replace("{evidenceSummary}", evidenceSummary.substring(0, 6000));

      try {
        const response = await this.aiFacade.chat({
          messages: [
            {
              role: "system",
              content: "你是严谨的事实核查专家。请输出 JSON 格式。",
            },
            { role: "user", content: prompt },
          ],
          modelType: AIModelType.CHAT_FAST,
          taskProfile: {
            creativity: "deterministic",
            outputLength: "medium",
          },
        });

        const result = extractJsonFromAIResponse<{
          results: import("../types/v5-research.types").ClaimValidationResult[];
        }>(response.content, { requiredKey: "results" });

        if (result.success && result.data?.results) {
          allResults.push(...result.data.results);
        }
      } catch (error) {
        this.logger.warn(
          `[validateClaims] Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${error}`,
        );
        // Mark batch claims as unverified on failure
        for (const claim of batch) {
          allResults.push({
            claimId: claim.id,
            status: "unverified",
            supportingSourceIndices: [],
            contradictingSourceIndices: [],
            explanation: "验证过程出错",
          });
        }
      }
    }

    const stats = {
      verified: allResults.filter((r) => r.status === "verified").length,
      unverified: allResults.filter((r) => r.status === "unverified").length,
      disputed: allResults.filter((r) => r.status === "disputed").length,
      total: allResults.length,
    };

    this.logger.log(
      `[validateClaims] Validation complete: ${stats.verified} verified, ${stats.unverified} unverified, ${stats.disputed} disputed`,
    );

    return { results: allResults, stats };
  }

  /**
   * V5 L5: 事实核查报告
   * 提取报告中 [n] 引用及上下文，核对与原始证据是否一致
   * 仅 thorough 模式启用
   */
  async factCheckReport(
    reportContent: string,
    evidenceData: Array<{ id: string; title: string; snippet: string | null }>,
  ): Promise<import("../types/v5-research.types").FactCheckResult> {
    this.logger.log(`[factCheckReport] Starting fact check`);

    // Extract citations [n] with surrounding context
    const citationPattern = /([^.]*?\[(\d+)\][^.]*\.)/g;
    const citations: Array<{ mark: string; context: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = citationPattern.exec(reportContent)) !== null) {
      if (citations.length >= 30) break; // Limit to 30 citations
      citations.push({
        mark: `[${match[2]}]`,
        context: match[1].trim().substring(0, 200),
      });
    }

    if (citations.length === 0) {
      this.logger.log(`[factCheckReport] No citations found, skipping`);
      return { citations: [], accuracyScore: 100, issues: [] };
    }

    const citationsText = citations
      .map((c) => `- ${c.mark}: "${c.context}"`)
      .join("\n");

    const evidenceText = evidenceData
      .slice(0, 30)
      .map(
        (e, i) =>
          `[${i + 1}] ${e.title}: ${(e.snippet || "").substring(0, 300)}`,
      )
      .join("\n");

    const { FACT_CHECK_PROMPT } = await import("../prompts/v5-research.prompt");
    const prompt = FACT_CHECK_PROMPT.replace(
      "{citationsWithContext}",
      citationsText,
    ).replace("{originalEvidence}", evidenceText);

    try {
      const response = await this.aiFacade.chat({
        messages: [
          {
            role: "system",
            content: "你是严谨的事实核查编辑。请输出 JSON 格式。",
          },
          { role: "user", content: prompt },
        ],
        modelType: AIModelType.CHAT_FAST,
        taskProfile: {
          creativity: "deterministic",
          outputLength: "medium",
        },
      });

      const result = extractJsonFromAIResponse<
        import("../types/v5-research.types").FactCheckResult
      >(response.content, { requiredKey: "citations" });

      if (result.success && result.data) {
        this.logger.log(
          `[factCheckReport] Fact check complete: accuracy ${result.data.accuracyScore}/100`,
        );
        return result.data;
      }
    } catch (error) {
      this.logger.error(`[factCheckReport] Error: ${error}`);
    }

    return { citations: [], accuracyScore: 0, issues: ["事实核查过程出错"] };
  }

  /**
   * 构建维度审核系统提示词
   */
  private buildDimensionReviewSystemPrompt(): string {
    return `你是一位资深的研究质量审核专家，负责审核 AI 研究团队产出的研究报告质量。

## 你的职责

你需要从以下五个维度严格评估研究质量：

### 1. 广度 (Breadth) - 25%权重
- 是否覆盖了该维度的主要方面？
- 是否遗漏了关键视角？
- 是否考虑了不同利益相关方的观点？
- 评分标准：
  - 90-100: 全面覆盖所有关键方面，无明显遗漏
  - 75-89: 覆盖大部分方面，有少量遗漏
  - 60-74: 覆盖基本方面，有一些遗漏
  - 40-59: 覆盖不足，多处遗漏
  - 0-39: 严重遗漏关键方面

### 2. 深度 (Depth) - 25%权重
- 分析是否深入本质？
- 是否仅停留在表面描述？
- 是否揭示了深层原因和影响？
- 评分标准：
  - 90-100: 分析深入透彻，揭示本质规律
  - 75-89: 分析较深入，有一定洞察
  - 60-74: 分析一般，缺乏深度
  - 40-59: 分析浅显，多为表面描述
  - 0-39: 分析严重不足

### 3. 证据支撑 (Evidence) - 25%权重
- 每个关键发现是否有足够证据支撑？
- 证据来源是否多样、可靠？
- 是否有原始引用？
- 评分标准：
  - 90-100: 证据充分、来源可靠多样
  - 75-89: 证据较充分，来源较可靠
  - 60-74: 证据基本足够，来源有限
  - 40-59: 证据不足，来源单一
  - 0-39: 证据严重不足或不可靠

### 4. 逻辑连贯 (Coherence) - 15%权重
- 分析逻辑是否清晰？
- 结论是否有依据？
- 是否存在逻辑跳跃或矛盾？
- 评分标准：
  - 90-100: 逻辑严密，论证清晰
  - 75-89: 逻辑较清晰，论证较完整
  - 60-74: 逻辑基本清晰，有少量问题
  - 40-59: 逻辑不清，论证不完整
  - 0-39: 逻辑混乱，结论无依据

### 5. 时效性 (Currency) - 10%权重
- 信息来源是否足够新？
- 是否关注了最新动态？
- 是否有过时信息？
- 评分标准：
  - 90-100: 信息非常新，关注最新动态
  - 75-89: 信息较新，时效性好
  - 60-74: 信息时效性一般
  - 40-59: 部分信息过时
  - 0-39: 大量信息过时

## 输出格式

返回 JSON 格式：
{
  "qualityLevel": "excellent|good|acceptable|needs_revision|rejected",
  "overallScore": <0-100的整数>,
  "scores": {
    "breadth": <0-100>,
    "depth": <0-100>,
    "evidence": <0-100>,
    "coherence": <0-100>,
    "currency": <0-100>
  },
  "issues": [
    {
      "type": "missing_coverage|weak_evidence|outdated_info|logical_gap|shallow_analysis|missing_perspective",
      "severity": "critical|major|minor",
      "description": "问题描述",
      "affectedSection": "受影响的部分（可选）"
    }
  ],
  "suggestions": ["改进建议1", "改进建议2"],
  "needsReresearch": true/false,
  "reresearchFocus": ["需要重新研究的重点方向"]
}

## 审核原则

1. **高标准严要求**：作为质量守门人，你的标准必须严格
2. **具体可操作**：问题描述和建议必须具体，可以指导改进
3. **实事求是**：基于实际内容评分，不主观臆断
4. **建设性反馈**：指出问题的同时给出改进方向`;
  }

  /**
   * 构建维度审核用户提示词
   */
  private buildDimensionReviewUserPrompt(
    topic: ResearchTopic,
    dimension: TopicDimension,
    analysis: DimensionAnalysisResult,
    evidenceCount: number,
  ): string {
    return `请审核以下研究内容：

## 研究主题
${topic.name}

## 研究维度
名称：${dimension.name}
描述：${dimension.description || "无"}

## 研究结果

### 核心摘要
${analysis.summary}

### 关键发现 (${analysis.keyFindings.length} 条)
${analysis.keyFindings.map((f, i) => `${i + 1}. [${f.significance}重要性] ${f.finding} (${f.evidenceIds.length}个证据支撑)`).join("\n")}

### 趋势分析 (${analysis.trends.length} 条)
${analysis.trends.map((t, i) => `${i + 1}. [${t.direction}] ${t.trend} (时间范围: ${t.timeframe}, ${t.evidenceIds.length}个证据)`).join("\n")}

### 挑战分析 (${analysis.challenges.length} 条)
${analysis.challenges.map((c, i) => `${i + 1}. ${c.challenge}\n   影响: ${c.impact} (${c.evidenceIds.length}个证据)`).join("\n")}

### 机会分析 (${analysis.opportunities.length} 条)
${analysis.opportunities.map((o, i) => `${i + 1}. ${o.opportunity}\n   潜力: ${o.potential} (${o.evidenceIds.length}个证据)`).join("\n")}

### 置信度
${analysis.confidenceLevel}

### 证据统计
- 总证据数: ${evidenceCount}
- 已使用证据: ${analysis.evidenceUsed}

### 详细内容
${analysis.detailedContent.substring(0, 6000)}${analysis.detailedContent.length > 6000 ? "...(已截断)" : ""}

---

请严格按照审核标准评估这份研究报告，输出 JSON 格式的审核结果。`;
  }

  /**
   * 分析跨维度问题
   */
  private async analyzeCrossDimensionIssues(
    _topic: ResearchTopic,
    dimensions: TopicDimension[],
    dimensionReviews: DimensionReviewResult[],
  ): Promise<ReviewIssue[]> {
    const issues: ReviewIssue[] = [];

    // 如果有多个维度分数很低，可能存在系统性问题
    const lowScoreDimensions = dimensionReviews.filter(
      (r) => r.overallScore < 60,
    );
    if (lowScoreDimensions.length >= dimensions.length * 0.5) {
      issues.push({
        type: "shallow_analysis",
        severity: "critical",
        description: `超过一半的维度 (${lowScoreDimensions.length}/${dimensions.length}) 研究质量不达标，可能存在系统性问题`,
      });
    }

    // 检查证据支撑普遍不足
    const weakEvidenceDimensions = dimensionReviews.filter(
      (r) => r.scores.evidence < 60,
    );
    if (weakEvidenceDimensions.length >= dimensions.length * 0.3) {
      issues.push({
        type: "weak_evidence",
        severity: "major",
        description: `多个维度 (${weakEvidenceDimensions.length}/${dimensions.length}) 证据支撑不足，需要加强数据收集`,
      });
    }

    return issues;
  }

  /**
   * 分析研究覆盖度
   */
  private analyzeCoverage(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
  ): OverallReviewResult["coverageAnalysis"] {
    // 根据主题类型确定应该覆盖的方面
    const expectedAspects = this.getExpectedAspects(topic.type);
    const coveredAspects = dimensions.map((d) => d.name);

    // 找出缺失的方面
    const missingAspects = expectedAspects.filter(
      (aspect) =>
        !coveredAspects.some(
          (covered) =>
            covered.includes(aspect) ||
            aspect.includes(covered) ||
            this.areRelatedAspects(covered, aspect),
        ),
    );

    const coverageScore =
      ((expectedAspects.length - missingAspects.length) /
        expectedAspects.length) *
      100;

    return {
      coveredAspects,
      missingAspects,
      coverageScore: Math.round(coverageScore),
    };
  }

  /**
   * 获取期望覆盖的方面
   */
  private getExpectedAspects(topicType: string): string[] {
    switch (topicType) {
      case "MACRO":
        return [
          "政策法规",
          "市场格局",
          "技术趋势",
          "竞争态势",
          "投资动向",
          "人才状况",
          "国际比较",
          "未来展望",
        ];
      case "TECHNOLOGY":
        return [
          "技术原理",
          "发展现状",
          "应用场景",
          "技术难点",
          "竞争格局",
          "未来趋势",
        ];
      case "COMPANY":
        return [
          "公司概况",
          "业务分析",
          "财务状况",
          "竞争优势",
          "战略方向",
          "风险因素",
        ];
      default:
        return ["现状分析", "趋势预测", "竞争格局", "机会与挑战"];
    }
  }

  /**
   * 判断两个方面是否相关
   */
  private areRelatedAspects(aspect1: string, aspect2: string): boolean {
    const relatedPairs = [
      ["市场", "行业"],
      ["竞争", "格局"],
      ["技术", "创新"],
      ["政策", "法规"],
      ["投资", "融资"],
      ["人才", "团队"],
    ];

    return relatedPairs.some(
      (pair) =>
        (aspect1.includes(pair[0]) && aspect2.includes(pair[1])) ||
        (aspect1.includes(pair[1]) && aspect2.includes(pair[0])),
    );
  }

  /**
   * 生成总体建议
   */
  private generateOverallRecommendations(
    dimensionReviews: DimensionReviewResult[],
    crossDimensionIssues: ReviewIssue[],
    coverageAnalysis: OverallReviewResult["coverageAnalysis"],
  ): string[] {
    const recommendations: string[] = [];

    // 根据缺失覆盖提建议
    if (coverageAnalysis.missingAspects.length > 0) {
      recommendations.push(
        `建议补充以下研究维度: ${coverageAnalysis.missingAspects.join(", ")}`,
      );
    }

    // 根据低分维度提建议
    const worstDimensions = dimensionReviews
      .filter((r) => r.overallScore < 70)
      .sort((a, b) => a.overallScore - b.overallScore)
      .slice(0, 3);

    if (worstDimensions.length > 0) {
      recommendations.push(
        `重点改进以下维度: ${worstDimensions.map((d) => `${d.dimensionName}(${d.overallScore}分)`).join(", ")}`,
      );
    }

    // 根据跨维度问题提建议
    const criticalIssues = crossDimensionIssues.filter(
      (i) => i.severity === "critical",
    );
    if (criticalIssues.length > 0) {
      recommendations.push(
        `需要解决的关键问题: ${criticalIssues.map((i) => i.description).join("; ")}`,
      );
    }

    // 通用建议
    const avgEvidenceScore =
      dimensionReviews.reduce((sum, r) => sum + r.scores.evidence, 0) /
      dimensionReviews.length;
    if (avgEvidenceScore < 70) {
      recommendations.push(
        "建议增加高质量证据来源，特别是权威机构报告和学术论文",
      );
    }

    const avgDepthScore =
      dimensionReviews.reduce((sum, r) => sum + r.scores.depth, 0) /
      dimensionReviews.length;
    if (avgDepthScore < 70) {
      recommendations.push(
        "建议深入分析因果关系和底层逻辑，避免停留在表面描述",
      );
    }

    return recommendations;
  }

  /**
   * 确定质量等级
   */
  private determineQualityLevel(score: number): ReviewQualityLevel {
    if (score >= this.QUALITY_THRESHOLDS.excellent)
      return ReviewQualityLevel.EXCELLENT;
    if (score >= this.QUALITY_THRESHOLDS.good) return ReviewQualityLevel.GOOD;
    if (score >= this.QUALITY_THRESHOLDS.acceptable)
      return ReviewQualityLevel.ACCEPTABLE;
    if (score >= this.QUALITY_THRESHOLDS.needsRevision)
      return ReviewQualityLevel.NEEDS_REVISION;
    return ReviewQualityLevel.REJECTED;
  }

  /**
   * 创建失败的审核结果
   */
  private createFailedReviewResult(
    dimension: TopicDimension,
    error: unknown,
  ): DimensionReviewResult {
    return {
      dimensionId: dimension.id,
      dimensionName: dimension.name,
      qualityLevel: ReviewQualityLevel.NEEDS_REVISION,
      overallScore: 0,
      scores: {
        breadth: 0,
        depth: 0,
        evidence: 0,
        coherence: 0,
        currency: 0,
      },
      issues: [
        {
          type: "shallow_analysis",
          severity: "critical",
          description: `审核过程出错: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      suggestions: ["需要重新进行研究和审核"],
      needsReresearch: true,
      reresearchFocus: ["全部内容"],
    };
  }
}
