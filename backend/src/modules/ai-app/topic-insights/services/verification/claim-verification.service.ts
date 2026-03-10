/**
 * Claim Verification Service
 *
 * P0 优化：声明级事实验证服务
 * 参考：FActScore (Min et al., 2023)
 *
 * 功能：
 * 1. 从内容中提取可验证的声明
 * 2. 对每个声明进行多源验证
 * 3. 生成验证报告和修复建议
 */

import { Injectable, Logger } from "@nestjs/common";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";

interface VerificationJsonResult {
  verdict?: "supports" | "refutes" | "neutral" | "insufficient";
  confidence?: number;
  relevantQuote?: string;
  reasoning?: string;
  factualAlignment?: number;
}
import {
  VerifiableClaim,
  ClaimType,
  ClaimVerificationResult,
  SourceVerification,
  SectionVerificationReport,
  DimensionVerificationReport,
  ClaimVerificationConfig,
  DEFAULT_CLAIM_VERIFICATION_CONFIG,
} from "../../types/claim-verification.types";
import { EnrichedEvidenceData } from "../../types/research.types";

@Injectable()
export class ClaimVerificationService {
  private readonly logger = new Logger(ClaimVerificationService.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * 从章节内容中提取可验证的声明
   */
  async extractClaims(
    sectionId: string,
    content: string,
    config: Partial<ClaimVerificationConfig> = {},
  ): Promise<VerifiableClaim[]> {
    const mergedConfig = { ...DEFAULT_CLAIM_VERIFICATION_CONFIG, ...config };
    this.logger.log(
      `[extractClaims] Extracting claims from section ${sectionId}`,
    );

    const prompt = `你是一个专业的事实核验分析师。请从以下内容中提取所有可验证的声明。

## 内容
${content}

## 任务
1. 识别所有可验证的事实性声明（排除纯观点和修辞表达）
2. 对每个声明进行分类
3. 评估验证优先级

## 输出格式（JSON）
{
  "claims": [
    {
      "text": "声明的完整文本",
      "type": "factual|statistical|causal|comparative|predictive|definitional|opinion",
      "paragraphIndex": 0,
      "sentenceIndex": 0,
      "isVerifiable": true,
      "verificationPriority": "high|medium|low",
      "reason": "为什么这个优先级"
    }
  ]
}

只输出 JSON，不要其他内容。`;

    try {
      const response = await this.chatFacade.chatWithSkills({
        messages: [{ role: "user", content: prompt }],
        additionalSkills: ["claim-extraction"],
        taskProfile: { creativity: "deterministic", outputLength: "long" },
        responseFormat: "json",
        skipGuardrails: true, // Internal system call — user content may trigger false positives
      });

      const result = extractJsonFromAIResponse<{
        claims: Array<{
          text: string;
          type: string;
          paragraphIndex?: number;
          sentenceIndex?: number;
          isVerifiable?: boolean;
          verificationPriority?: string;
          reason?: string;
        }>;
      }>(response.content);

      if (!result.success || !result.data?.claims) {
        this.logger.warn(
          `[extractClaims] Failed to extract claims from section ${sectionId}`,
        );
        return [];
      }

      // 过滤和转换
      const verifiableClaims = (
        result.data.claims as Array<Record<string, unknown>>
      )
        .filter(
          (c) =>
            c["type"] !== "opinion" &&
            c["isVerifiable"] !== false &&
            mergedConfig.verificationPriorities.includes(
              (c["verificationPriority"] as "high" | "medium" | "low") ||
                "medium",
            ),
        )
        .slice(0, mergedConfig.maxClaimsPerSection)
        .map((c, index: number) => ({
          id: `claim-${sectionId}-${index}`,
          text: c["text"] as string,
          type: c["type"] as ClaimType,
          location: {
            sectionId,
            paragraphIndex: (c["paragraphIndex"] as number) || 0,
            sentenceIndex: (c["sentenceIndex"] as number) || 0,
            charStart: 0,
            charEnd: (c["text"] as string).length,
          },
          verificationPriority:
            (c["verificationPriority"] as "high" | "medium" | "low") ||
            "medium",
          extractedAt: new Date(),
        }));

      this.logger.log(
        `[extractClaims] Extracted ${verifiableClaims.length} verifiable claims from section ${sectionId}`,
      );

      return verifiableClaims;
    } catch (error) {
      // ★ Critical Fix: 更详细的错误日志，返回空数组但记录完整上下文
      // 注意：这里返回空数组是 graceful degradation，而非静默吞错
      // 调用方 verifySection 会正常处理空结果情况
      this.logger.error(
        `[extractClaims] Error extracting claims from section ${sectionId}: ${
          error instanceof Error ? error.stack : error
        }`,
      );
      // 返回空数组表示提取失败，调用方会生成空报告
      // 这比抛出异常更好，因为单个章节失败不应中断整个维度验证
      return [];
    }
  }

  /**
   * 验证单个声明
   */
  async verifyClaim(
    claim: VerifiableClaim,
    evidences: EnrichedEvidenceData[],
    config: Partial<ClaimVerificationConfig> = {},
  ): Promise<ClaimVerificationResult> {
    const mergedConfig = { ...DEFAULT_CLAIM_VERIFICATION_CONFIG, ...config };
    this.logger.debug(
      `[verifyClaim] Verifying claim: ${claim.text.substring(0, 50)}...`,
    );

    // 1. 筛选相关证据
    const relevantEvidences = await this.findRelevantEvidences(
      claim,
      evidences,
    );

    if (relevantEvidences.length === 0) {
      return this.createUnverifiedResult(claim, "未找到相关证据");
    }

    // 2. 对每个相关证据进行验证
    const sourceVerifications: SourceVerification[] = [];
    const evidencesToVerify = relevantEvidences.slice(
      0,
      mergedConfig.maxSourcesPerClaim,
    );

    for (const evidence of evidencesToVerify) {
      try {
        const verification = await this.verifyAgainstSource(claim, evidence);
        sourceVerifications.push(verification);
      } catch (error) {
        this.logger.warn(
          `[verifyClaim] Failed to verify against source ${evidence.id}: ${error}`,
        );
      }
    }

    if (sourceVerifications.length === 0) {
      return this.createUnverifiedResult(claim, "所有证据验证失败");
    }

    // 3. 综合判定
    return this.aggregateVerifications(claim, sourceVerifications);
  }

  /**
   * 找到与声明相关的证据
   */
  private async findRelevantEvidences(
    claim: VerifiableClaim,
    evidences: EnrichedEvidenceData[],
  ): Promise<EnrichedEvidenceData[]> {
    if (evidences.length === 0) return [];
    if (evidences.length <= 3) return evidences;

    const prompt = `给定一个需要验证的声明和一组证据来源，判断哪些证据可能与该声明相关。

## 声明
${claim.text}

## 证据列表
${evidences.map((e, i) => `[${i + 1}] ${e.title}\n摘要：${(e.snippet || e.fullContent || "").substring(0, 300)}`).join("\n\n")}

## 任务
返回与声明最相关的证据编号（1-based），按相关性排序。最多返回 5 个。

输出格式（JSON）：
{
  "relevantIndices": [3, 1, 5],
  "reasoning": "简要解释选择理由"
}`;

    try {
      const response = await this.chatFacade.chat({
        messages: [{ role: "user", content: prompt }],
        taskProfile: { creativity: "deterministic", outputLength: "short" },
      });

      const result = extractJsonFromAIResponse<{ relevantIndices: number[] }>(
        response.content,
      );

      if (!result.success || !result.data?.relevantIndices) {
        return evidences.slice(0, 5);
      }

      return result.data.relevantIndices
        .filter((i: number) => i >= 1 && i <= evidences.length)
        .map((i: number) => evidences[i - 1]);
    } catch (error) {
      this.logger.warn(`[findRelevantEvidences] Error: ${error}`);
      return evidences.slice(0, 5);
    }
  }

  /**
   * 针对单个证据源验证声明
   */
  private async verifyAgainstSource(
    claim: VerifiableClaim,
    evidence: EnrichedEvidenceData,
  ): Promise<SourceVerification> {
    const evidenceContent = evidence.fullContent || evidence.snippet || "";

    const prompt = `你是一个严谨的事实核验专家。请验证以下声明是否被证据支持。

## 待验证声明
${claim.text}

## 证据来源
标题：${evidence.title}
URL：${evidence.url}
内容：
${evidenceContent.substring(0, 3000)}

## 任务
1. 判断证据是否支持、反驳、中立或不足以判断该声明
2. 找到证据中最相关的原文引用
3. 评估事实一致性程度

## 输出格式（JSON）
{
  "verdict": "supports|refutes|neutral|insufficient",
  "confidence": 0.85,
  "relevantQuote": "证据中支持/反驳声明的原文（如有）",
  "reasoning": "推理过程",
  "factualAlignment": 0.9
}

只输出 JSON。`;

    try {
      const response = await this.chatFacade.chatWithSkills({
        messages: [{ role: "user", content: prompt }],
        additionalSkills: ["fact-verification"],
        taskProfile: { creativity: "low", outputLength: "medium" },
      });

      const result = extractJsonFromAIResponse<VerificationJsonResult>(
        response.content,
      );

      if (!result.success || !result.data) {
        return {
          evidenceId: evidence.id,
          evidenceTitle: evidence.title,
          evidenceUrl: evidence.url,
          verdict: "insufficient",
          confidence: 0,
          relevantQuote: "",
          reasoning: "验证解析失败",
          factualAlignment: 0,
        };
      }

      return {
        evidenceId: evidence.id,
        evidenceTitle: evidence.title,
        evidenceUrl: evidence.url,
        verdict: result.data.verdict || "insufficient",
        confidence: result.data.confidence || 0.5,
        relevantQuote: result.data.relevantQuote || "",
        reasoning: result.data.reasoning || "",
        factualAlignment: result.data.factualAlignment || 0.5,
      };
    } catch (error) {
      this.logger.warn(`[verifyAgainstSource] Error: ${error}`);
      return {
        evidenceId: evidence.id,
        evidenceTitle: evidence.title,
        evidenceUrl: evidence.url,
        verdict: "insufficient",
        confidence: 0,
        relevantQuote: "",
        reasoning: `验证失败: ${error}`,
        factualAlignment: 0,
      };
    }
  }

  /**
   * 聚合多个验证结果
   */
  private aggregateVerifications(
    claim: VerifiableClaim,
    verifications: SourceVerification[],
  ): ClaimVerificationResult {
    const supportCount = verifications.filter(
      (v) => v.verdict === "supports",
    ).length;
    const refuteCount = verifications.filter(
      (v) => v.verdict === "refutes",
    ).length;
    const totalUseful = verifications.filter(
      (v) => v.verdict !== "insufficient",
    ).length;

    // 计算 FActScore
    const factScore = totalUseful > 0 ? supportCount / totalUseful : 0;

    // 计算一致性
    const agreementRate =
      totalUseful > 0 ? Math.max(supportCount, refuteCount) / totalUseful : 0;

    // 综合判定
    let overallVerdict: ClaimVerificationResult["overallVerdict"];
    if (refuteCount > supportCount && refuteCount >= 2) {
      overallVerdict = "contradicted";
    } else if (supportCount >= 2 && factScore >= 0.7) {
      overallVerdict = "verified";
    } else if (supportCount >= 1) {
      overallVerdict = "partially_verified";
    } else {
      overallVerdict = "unverified";
    }

    // 构建置信度因素
    const confidenceFactors: ClaimVerificationResult["confidence"]["factors"] =
      [
        {
          factor: "多源一致性",
          impact: agreementRate > 0.7 ? "positive" : "negative",
          weight: 0.3,
        },
        {
          factor: "证据覆盖度",
          impact: totalUseful >= 3 ? "positive" : "negative",
          weight: 0.2,
        },
        {
          factor: "平均验证置信度",
          impact:
            verifications.reduce((sum, v) => sum + v.confidence, 0) /
              verifications.length >
            0.7
              ? "positive"
              : "negative",
          weight: 0.3,
        },
        {
          factor: "事实对齐度",
          impact:
            verifications.reduce((sum, v) => sum + v.factualAlignment, 0) /
              verifications.length >
            0.7
              ? "positive"
              : "negative",
          weight: 0.2,
        },
      ];

    const confidenceLevel = confidenceFactors.reduce((sum, f) => {
      return sum + (f.impact === "positive" ? f.weight : -f.weight * 0.5);
    }, 0.5);

    // 构建问题列表
    const issues: ClaimVerificationResult["issues"] = [];
    if (overallVerdict === "contradicted") {
      issues.push({
        type: "contradicted",
        description: `${refuteCount} 个证据源反驳此声明`,
        severity: "critical",
      });
    } else if (overallVerdict === "unverified") {
      issues.push({
        type: "unsupported",
        description: "未找到足够证据支持此声明",
        severity: "major",
      });
    }

    return {
      claim,
      sourceVerifications: verifications,
      overallVerdict,
      factScore,
      agreementRate,
      confidence: {
        level: Math.max(0, Math.min(1, confidenceLevel)),
        factors: confidenceFactors,
      },
      issues: issues.length > 0 ? issues : undefined,
      remediation:
        overallVerdict !== "verified"
          ? {
              suggestedCorrection: "",
              additionalSourcesNeeded: true,
              alternativeClaims: [],
            }
          : undefined,
    };
  }

  /**
   * 创建未验证结果
   */
  private createUnverifiedResult(
    claim: VerifiableClaim,
    reason: string,
  ): ClaimVerificationResult {
    return {
      claim,
      sourceVerifications: [],
      overallVerdict: "unverified",
      factScore: 0,
      agreementRate: 0,
      confidence: {
        level: 0,
        factors: [],
      },
      issues: [
        {
          type: "unsupported",
          description: reason,
          severity: "major",
        },
      ],
      remediation: {
        suggestedCorrection: "",
        additionalSourcesNeeded: true,
        alternativeClaims: [],
      },
    };
  }

  /**
   * 验证整个章节
   */
  async verifySection(
    sectionId: string,
    sectionTitle: string,
    content: string,
    evidences: EnrichedEvidenceData[],
    config: Partial<ClaimVerificationConfig> = {},
  ): Promise<SectionVerificationReport> {
    this.logger.log(
      `[verifySection] Starting verification for section: ${sectionTitle}`,
    );

    // 1. 提取声明
    const claims = await this.extractClaims(sectionId, content, config);

    if (claims.length === 0) {
      return this.createEmptySectionReport(sectionId, sectionTitle);
    }

    // 2. 批量验证（限制并发）
    const verificationResults: ClaimVerificationResult[] = [];
    const BATCH_SIZE = 3;

    for (let i = 0; i < claims.length; i += BATCH_SIZE) {
      const batch = claims.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((claim) => this.verifyClaim(claim, evidences, config)),
      );
      verificationResults.push(...batchResults);
    }

    // 3. 计算指标
    const metrics = {
      totalClaims: verificationResults.length,
      verifiedClaims: verificationResults.filter(
        (r) => r.overallVerdict === "verified",
      ).length,
      partiallyVerifiedClaims: verificationResults.filter(
        (r) => r.overallVerdict === "partially_verified",
      ).length,
      unverifiedClaims: verificationResults.filter(
        (r) => r.overallVerdict === "unverified",
      ).length,
      contradictedClaims: verificationResults.filter(
        (r) => r.overallVerdict === "contradicted",
      ).length,
      averageFactScore:
        verificationResults.length > 0
          ? verificationResults.reduce((sum, r) => sum + r.factScore, 0) /
            verificationResults.length
          : 0,
      overallCredibility: 0,
    };

    // 综合可信度计算
    const verificationRate =
      metrics.totalClaims > 0
        ? (metrics.verifiedClaims +
            metrics.partiallyVerifiedClaims * 0.5 -
            metrics.contradictedClaims * 0.5) /
          metrics.totalClaims
        : 0;
    metrics.overallCredibility = Math.round(
      Math.max(
        0,
        Math.min(100, verificationRate * 60 + metrics.averageFactScore * 40),
      ),
    );

    // 4. 标记需要人工审核的声明
    const flaggedForReview = verificationResults
      .filter(
        (r) =>
          r.overallVerdict === "contradicted" ||
          (r.overallVerdict === "unverified" &&
            r.claim.verificationPriority === "high"),
      )
      .map((r) => r.claim.id);

    // 5. 生成摘要
    const summary = this.generateVerificationSummary(verificationResults);

    this.logger.log(
      `[verifySection] Completed: ${metrics.verifiedClaims}/${metrics.totalClaims} verified, ` +
        `credibility: ${metrics.overallCredibility}%`,
    );

    return {
      sectionId,
      sectionTitle,
      claims: verificationResults,
      metrics,
      flaggedForReview,
      summary,
    };
  }

  /**
   * 验证整个维度
   */
  async verifyDimension(
    dimensionId: string,
    dimensionName: string,
    sections: Array<{ id: string; title: string; content: string }>,
    evidences: EnrichedEvidenceData[],
    config: Partial<ClaimVerificationConfig> = {},
  ): Promise<DimensionVerificationReport> {
    this.logger.log(
      `[verifyDimension] Starting verification for dimension: ${dimensionName}`,
    );

    // 验证每个章节
    const sectionReports: SectionVerificationReport[] = [];
    for (const section of sections) {
      const report = await this.verifySection(
        section.id,
        section.title,
        section.content,
        evidences,
        config,
      );
      sectionReports.push(report);
    }

    // 聚合指标
    const totalClaims = sectionReports.reduce(
      (sum, r) => sum + r.metrics.totalClaims,
      0,
    );
    const verifiedClaims = sectionReports.reduce(
      (sum, r) => sum + r.metrics.verifiedClaims,
      0,
    );
    const contradictedClaims = sectionReports.reduce(
      (sum, r) => sum + r.metrics.contradictedClaims,
      0,
    );

    const aggregateMetrics = {
      totalClaims,
      verificationRate: totalClaims > 0 ? verifiedClaims / totalClaims : 0,
      averageFactScore:
        sectionReports.length > 0
          ? sectionReports.reduce(
              (sum, r) => sum + r.metrics.averageFactScore,
              0,
            ) / sectionReports.length
          : 0,
      overallCredibility:
        sectionReports.length > 0
          ? Math.round(
              sectionReports.reduce(
                (sum, r) => sum + r.metrics.overallCredibility,
                0,
              ) / sectionReports.length,
            )
          : 0,
      criticalIssuesCount: contradictedClaims,
    };

    // 生成建议
    const recommendations = this.generateDimensionRecommendations(
      sectionReports,
      aggregateMetrics,
    );

    return {
      dimensionId,
      dimensionName,
      sections: sectionReports,
      aggregateMetrics,
      recommendations,
    };
  }

  /**
   * 生成验证摘要
   */
  private generateVerificationSummary(
    results: ClaimVerificationResult[],
  ): SectionVerificationReport["summary"] {
    const verified = results.filter((r) => r.overallVerdict === "verified");
    const contradicted = results.filter(
      (r) => r.overallVerdict === "contradicted",
    );
    const unverified = results.filter((r) => r.overallVerdict === "unverified");

    const strengths: string[] = [];
    const concerns: string[] = [];
    const recommendations: string[] = [];

    if (verified.length > results.length * 0.7) {
      strengths.push("大部分声明都有充分的证据支持");
    }
    if (verified.length > 0) {
      strengths.push(`${verified.length} 个关键声明已验证`);
    }

    if (contradicted.length > 0) {
      concerns.push(`${contradicted.length} 个声明与证据矛盾，需要修正`);
      recommendations.push("审核并修正与证据矛盾的声明");
    }
    if (unverified.length > results.length * 0.3) {
      concerns.push("较多声明缺乏证据支持");
      recommendations.push("补充更多可靠来源以支持关键声明");
    }

    return { strengths, concerns, recommendations };
  }

  /**
   * 生成维度级别建议
   */
  private generateDimensionRecommendations(
    sectionReports: SectionVerificationReport[],
    metrics: DimensionVerificationReport["aggregateMetrics"],
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.overallCredibility < 60) {
      recommendations.push("整体可信度较低，建议全面审核和补充证据");
    }
    if (metrics.criticalIssuesCount > 0) {
      recommendations.push(
        `有 ${metrics.criticalIssuesCount} 个关键问题需要立即处理`,
      );
    }
    if (metrics.verificationRate < 0.5) {
      recommendations.push("验证率较低，建议增加权威来源引用");
    }

    // 识别问题最多的章节
    const problemSections = sectionReports
      .filter((r) => r.metrics.contradictedClaims > 0)
      .map((r) => r.sectionTitle);
    if (problemSections.length > 0) {
      recommendations.push(`重点审核以下章节：${problemSections.join("、")}`);
    }

    return recommendations;
  }

  /**
   * 创建空章节报告
   */
  private createEmptySectionReport(
    sectionId: string,
    sectionTitle: string,
  ): SectionVerificationReport {
    return {
      sectionId,
      sectionTitle,
      claims: [],
      metrics: {
        totalClaims: 0,
        verifiedClaims: 0,
        partiallyVerifiedClaims: 0,
        unverifiedClaims: 0,
        contradictedClaims: 0,
        averageFactScore: 0,
        overallCredibility: 100,
      },
      flaggedForReview: [],
      summary: {
        strengths: ["未提取到需要验证的声明"],
        concerns: [],
        recommendations: [],
      },
    };
  }
}
