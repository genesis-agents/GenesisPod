/**
 * Critique-Refine Service
 *
 * P1 优化：批评-改进循环服务
 * 参考：Reflexion (Shinn et al., 2023)
 *
 * 功能：
 * 1. 对内容进行多维度批评
 * 2. 基于批评进行针对性改进
 * 3. 迭代循环直到达到质量标准
 */

import { Injectable, Logger } from "@nestjs/common";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { extractJsonFromAIResponse } from "@/common/utils/json-extraction.utils";
import {
  CritiqueCategory,
  CritiqueSeverity,
  CritiqueItem,
  CritiqueResult,
  RefineResult,
  CritiqueRefineIteration,
  CritiqueRefineLoopResult,
  CritiqueRefineConfig,
  DEFAULT_CRITIQUE_REFINE_CONFIG,
} from "../../types/quality-enhancement.types";

export interface CritiqueRefineRequest {
  content: string;
  context: {
    topicName: string;
    dimensionName: string;
    targetAudience?: string;
    qualityExpectation?: string;
  };
  config?: Partial<CritiqueRefineConfig>;
}

@Injectable()
export class CritiqueRefineService {
  private readonly logger = new Logger(CritiqueRefineService.name);

  constructor(private readonly chatFacade: ChatFacade) {}

  /**
   * 执行完整的批评-改进循环
   */
  async runCritiqueRefineLoop(
    request: CritiqueRefineRequest,
  ): Promise<CritiqueRefineLoopResult> {
    const startTime = Date.now();
    const config = { ...DEFAULT_CRITIQUE_REFINE_CONFIG, ...request.config };

    this.logger.log(
      `[runCritiqueRefineLoop] Starting for dimension: ${request.context.dimensionName}`,
    );

    const iterations: CritiqueRefineIteration[] = [];
    let currentContent = request.content;
    let totalChanges = 0;

    for (let i = 0; i < config.maxIterations; i++) {
      const iterationNumber = i + 1;

      this.logger.log(
        `[runCritiqueRefineLoop] Iteration ${iterationNumber}/${config.maxIterations}`,
      );

      // 1. 批评当前内容
      const critique = await this.critiqueContent(
        currentContent,
        request.context,
        config,
      );

      // 2. 检查是否需要继续
      if (this.shouldStop(critique, config, iterations)) {
        this.logger.log(
          `[runCritiqueRefineLoop] Stopping at iteration ${iterationNumber}: ${this.getStopReason(critique, config, iterations)}`,
        );
        break;
      }

      // 3. 改进内容
      const refinement = await this.refineContent(
        currentContent,
        critique,
        request.context,
      );

      // 4. 记录迭代
      const iteration: CritiqueRefineIteration = {
        iterationNumber,
        critique,
        refinement,
        contentBefore: currentContent,
        contentAfter: refinement.refinedContent,
        scoreChange: refinement.scoreImprovement,
        timestamp: new Date(),
      };

      iterations.push(iteration);
      totalChanges += refinement.changesApplied.length;
      currentContent = refinement.refinedContent;

      // 4. 检查改进是否足够
      if (refinement.scoreImprovement < config.minImprovementThreshold) {
        this.logger.log(
          `[runCritiqueRefineLoop] Stopping: improvement ${refinement.scoreImprovement.toFixed(3)} below threshold`,
        );
        break;
      }
    }

    // 最终评估
    const finalCritique = await this.critiqueContent(
      currentContent,
      request.context,
      config,
    );

    const initialScore =
      iterations.length > 0
        ? iterations[0].critique.overallScore
        : finalCritique.overallScore;
    const finalScore = finalCritique.overallScore;

    const result: CritiqueRefineLoopResult = {
      finalContent: currentContent,
      iterations,
      finalScore,
      totalScoreImprovement: finalScore - initialScore,
      totalChanges,
      reachedTargetScore: finalScore >= config.targetScore,
      stopReason: this.determineStopReason(finalCritique, config, iterations),
      metadata: {
        totalIterations: iterations.length,
        totalTimeMs: Date.now() - startTime,
        tokensUsed: 0, // Would be tracked in real implementation
      },
    };

    this.logger.log(
      `[runCritiqueRefineLoop] Completed: ${iterations.length} iterations, ` +
        `score ${initialScore.toFixed(2)} -> ${finalScore.toFixed(2)}`,
    );

    return result;
  }

  /**
   * 批评内容
   */
  async critiqueContent(
    content: string,
    context: CritiqueRefineRequest["context"],
    config: CritiqueRefineConfig,
  ): Promise<CritiqueResult> {
    const prompt = `你是一个严格的内容质量审核专家。请对以下研究内容进行多维度批评。

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}
- 目标受众：${context.targetAudience || "专业人士"}
- 质量期望：${context.qualityExpectation || "高质量研究报告"}

## 待审核内容
${content}

## 输出格式（JSON）
{
  "overallScore": 0.75,
  "categoryScores": {
    "factual": 0.8,
    "logical": 0.7,
    "coverage": 0.75,
    "clarity": 0.8
  },
  "items": [
    {
      "id": "issue-1",
      "category": "factual",
      "severity": "major",
      "location": {
        "type": "paragraph",
        "reference": "第2段",
        "quote": "相关引文"
      },
      "issue": "问题描述",
      "suggestion": "改进建议",
      "exampleFix": "修正示例"
    }
  ],
  "strengths": ["优点1", "优点2"],
  "improvementPriorities": ["优先改进1", "优先改进2"],
  "summary": "综合评语"
}

只输出 JSON。`;

    try {
      const response = await this.chatFacade.chatWithSkills({
        messages: [{ role: "user", content: prompt }],
        additionalSkills: ["content-critique"],
        skipGuardrails: true, // 内部系统调用，内容审查
        taskProfile: { creativity: "low", outputLength: "long" },
        responseFormat: "json",
      });

      const result = extractJsonFromAIResponse<{
        overallScore: number;
        categoryScores: Record<string, number>;
        items: Array<{
          id?: string;
          category: string;
          severity: string;
          location?: {
            type: string;
            reference: string;
            quote?: string;
          };
          issue?: string;
          suggestion?: string;
          exampleFix?: string;
          relatedEvidence?: unknown;
        }>;
        strengths: string[];
        improvementPriorities: string[];
        summary: string;
      }>(response.content);

      if (result.success && result.data) {
        const items: CritiqueItem[] = (result.data.items || []).map(
          (item, index: number) => ({
            id: item.id || `issue-${index + 1}`,
            category: this.parseCategory(item.category),
            severity: this.parseSeverity(item.severity),
            location: item.location
              ? {
                  type: item.location.type as
                    | "paragraph"
                    | "sentence"
                    | "section"
                    | "document",
                  reference: item.location.reference,
                  quote: item.location.quote,
                }
              : {
                  type: "document" as const,
                  reference: "全文",
                },
            issue: item.issue || "",
            suggestion: item.suggestion || "",
            exampleFix: item.exampleFix,
            relatedEvidence: item.relatedEvidence
              ? (item.relatedEvidence as string[])
              : undefined,
          }),
        );

        const criticalIssues = items.filter(
          (item) => item.severity === CritiqueSeverity.CRITICAL,
        );

        const overallScore = Math.max(
          0,
          Math.min(1, result.data.overallScore || 0.5),
        );

        return {
          overallScore,
          categoryScores: this.normalizeCategoryScores(
            result.data.categoryScores,
            config.enabledCategories,
          ),
          items,
          strengths: result.data.strengths || [],
          criticalIssues,
          improvementPriorities: result.data.improvementPriorities || [],
          summary: result.data.summary || "",
          meetsQualityStandard: this.checkQualityStandard(
            overallScore,
            criticalIssues.length,
            items.filter((i) => i.severity === CritiqueSeverity.MAJOR).length,
            config,
          ),
          suggestedRefinementRounds: this.suggestRefinementRounds(
            overallScore,
            criticalIssues.length,
          ),
        };
      }
    } catch (error) {
      this.logger.error(`[critiqueContent] Error: ${error}`);
    }

    // 回退：保守评估
    return this.createFallbackCritique(config);
  }

  /**
   * 改进内容
   */
  async refineContent(
    content: string,
    critique: CritiqueResult,
    context: CritiqueRefineRequest["context"],
  ): Promise<RefineResult> {
    // 按优先级排序问题
    const prioritizedIssues = [...critique.items].sort((a, b) => {
      const severityOrder = {
        [CritiqueSeverity.CRITICAL]: 0,
        [CritiqueSeverity.MAJOR]: 1,
        [CritiqueSeverity.MINOR]: 2,
        [CritiqueSeverity.SUGGESTION]: 3,
      };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // 只处理重要问题
    const issuesToFix = prioritizedIssues.filter(
      (issue) =>
        issue.severity === CritiqueSeverity.CRITICAL ||
        issue.severity === CritiqueSeverity.MAJOR,
    );

    if (issuesToFix.length === 0) {
      return {
        refinedContent: content,
        changesApplied: [],
        remainingIssues: critique.items.filter(
          (i) =>
            i.severity === CritiqueSeverity.MINOR ||
            i.severity === CritiqueSeverity.SUGGESTION,
        ),
        scoreImprovement: 0,
        refinementSummary: "无需修改，内容已达到质量标准",
      };
    }

    const issuesText = issuesToFix
      .map(
        (issue, i) =>
          `${i + 1}. [${issue.severity}] ${issue.issue}\n   位置: ${issue.location.reference}\n   建议: ${issue.suggestion}${issue.exampleFix ? `\n   示例: ${issue.exampleFix}` : ""}`,
      )
      .join("\n\n");

    const prompt = `你是一个专业的内容改进专家。请根据以下批评意见修改内容。

## 研究背景
- 主题：${context.topicName}
- 维度：${context.dimensionName}

## 原始内容
${content}

## 需要修正的问题
${issuesText}

## 输出格式（JSON）
{
  "refinedContent": "修改后的完整内容",
  "changesApplied": [
    {
      "critiqueItemId": "issue-1",
      "original": "原文片段",
      "revised": "修改后的片段",
      "reason": "修改原因",
      "changeType": "correction"
    }
  ],
  "remainingIssues": ["无法修复的问题ID"],
  "refinementSummary": "改进摘要"
}

只输出 JSON。`;

    try {
      const response = await this.chatFacade.chatWithSkills({
        messages: [{ role: "user", content: prompt }],
        additionalSkills: ["content-refine"],
        skipGuardrails: true, // 内部系统调用，内容优化
        taskProfile: { creativity: "low", outputLength: "long" },
        responseFormat: "json",
      });

      const result = extractJsonFromAIResponse<{
        refinedContent: string;
        changesApplied: Array<{
          critiqueItemId?: string;
          original?: string;
          revised?: string;
          reason?: string;
          changeType?: string;
        }>;
        remainingIssues: string[];
        refinementSummary: string;
      }>(response.content);

      if (result.success && result.data) {
        const remainingIssueIds = new Set(result.data.remainingIssues || []);
        const remainingIssues = critique.items.filter(
          (item) =>
            remainingIssueIds.has(item.id) ||
            item.severity === CritiqueSeverity.MINOR ||
            item.severity === CritiqueSeverity.SUGGESTION,
        );

        // 估算分数提升
        const fixedCount = issuesToFix.length - remainingIssueIds.size;
        const scoreImprovement =
          fixedCount * 0.05 * (1 - critique.overallScore);

        return {
          refinedContent: result.data.refinedContent || content,
          changesApplied: (result.data.changesApplied || []).map((change) => ({
            critiqueItemId: change.critiqueItemId || "",
            original: change.original || "",
            revised: change.revised || "",
            reason: change.reason || "",
            changeType: (change.changeType ||
              "improvement") as RefineResult["changesApplied"][0]["changeType"],
          })),
          remainingIssues,
          scoreImprovement: Math.max(0, Math.min(0.3, scoreImprovement)),
          refinementSummary:
            result.data.refinementSummary || `修复了 ${fixedCount} 个问题`,
        };
      }
    } catch (error) {
      this.logger.error(`[refineContent] Error: ${error}`);
    }

    // 回退：返回原内容
    return {
      refinedContent: content,
      changesApplied: [],
      remainingIssues: critique.items,
      scoreImprovement: 0,
      refinementSummary: "改进失败，保留原内容",
    };
  }

  /**
   * 判断是否应该停止循环
   * ★ Major Fix: 增加收敛检测，防止分数振荡浪费资源
   */
  private shouldStop(
    critique: CritiqueResult,
    config: CritiqueRefineConfig,
    iterations: CritiqueRefineIteration[],
  ): boolean {
    // 达到目标分数
    if (critique.overallScore >= config.targetScore) {
      return true;
    }

    // 无关键问题
    if (config.stopOnNoCritical && critique.criticalIssues.length === 0) {
      return true;
    }

    // 无改进
    if (config.stopOnNoImprovement && iterations.length > 0) {
      const lastIteration = iterations[iterations.length - 1];
      if (lastIteration.scoreChange < config.minImprovementThreshold) {
        return true;
      }
    }

    // ★ 收敛检测：检测分数振荡（3次迭代后分数在±0.05范围内波动）
    if (iterations.length >= 3) {
      const recentScores = iterations
        .slice(-3)
        .map((it) => it.critique.overallScore);
      const minScore = Math.min(...recentScores);
      const maxScore = Math.max(...recentScores);
      if (maxScore - minScore < 0.05) {
        this.logger.log(
          `[shouldStop] Detected score oscillation: scores ${recentScores.map((s) => s.toFixed(3)).join(", ")} within 0.05 range`,
        );
        return true;
      }
    }

    return false;
  }

  /**
   * 获取停止原因
   * ★ Major Fix: 增加收敛检测原因
   */
  private getStopReason(
    critique: CritiqueResult,
    config: CritiqueRefineConfig,
    iterations: CritiqueRefineIteration[],
  ): string {
    if (critique.overallScore >= config.targetScore) {
      return "target_reached";
    }
    if (config.stopOnNoCritical && critique.criticalIssues.length === 0) {
      return "no_critical_issues";
    }
    if (config.stopOnNoImprovement && iterations.length > 0) {
      const lastIteration = iterations[iterations.length - 1];
      if (lastIteration.scoreChange < config.minImprovementThreshold) {
        return "no_improvement";
      }
    }
    // ★ 收敛检测
    if (iterations.length >= 3) {
      const recentScores = iterations
        .slice(-3)
        .map((it) => it.critique.overallScore);
      const minScore = Math.min(...recentScores);
      const maxScore = Math.max(...recentScores);
      if (maxScore - minScore < 0.05) {
        return "score_converged";
      }
    }
    return "max_iterations";
  }

  /**
   * 确定最终停止原因
   * ★ Major Fix: 增加收敛检测原因
   */
  private determineStopReason(
    critique: CritiqueResult,
    config: CritiqueRefineConfig,
    iterations: CritiqueRefineIteration[],
  ): CritiqueRefineLoopResult["stopReason"] {
    if (critique.overallScore >= config.targetScore) {
      return "target_reached";
    }
    if (critique.criticalIssues.length === 0) {
      return "no_critical_issues";
    }
    if (iterations.length > 0) {
      const lastIteration = iterations[iterations.length - 1];
      if (lastIteration.scoreChange < config.minImprovementThreshold) {
        return "no_improvement";
      }
    }
    // ★ 收敛检测
    if (iterations.length >= 3) {
      const recentScores = iterations
        .slice(-3)
        .map((it) => it.critique.overallScore);
      const minScore = Math.min(...recentScores);
      const maxScore = Math.max(...recentScores);
      if (maxScore - minScore < 0.05) {
        return "no_improvement"; // 使用 no_improvement 作为收敛的兼容值
      }
    }
    return "max_iterations";
  }

  /**
   * 解析类别
   */
  private parseCategory(category: string): CritiqueCategory {
    const mapping: Record<string, CritiqueCategory> = {
      factual: CritiqueCategory.FACTUAL,
      logical: CritiqueCategory.LOGICAL,
      coverage: CritiqueCategory.COVERAGE,
      clarity: CritiqueCategory.CLARITY,
      style: CritiqueCategory.STYLE,
      depth: CritiqueCategory.DEPTH,
      relevance: CritiqueCategory.RELEVANCE,
      citation: CritiqueCategory.CITATION,
    };
    return mapping[category?.toLowerCase()] || CritiqueCategory.FACTUAL;
  }

  /**
   * 解析严重程度
   */
  private parseSeverity(severity: string): CritiqueSeverity {
    const mapping: Record<string, CritiqueSeverity> = {
      critical: CritiqueSeverity.CRITICAL,
      major: CritiqueSeverity.MAJOR,
      minor: CritiqueSeverity.MINOR,
      suggestion: CritiqueSeverity.SUGGESTION,
    };
    return mapping[severity?.toLowerCase()] || CritiqueSeverity.MINOR;
  }

  /**
   * 标准化类别分数
   */
  private normalizeCategoryScores(
    scores: Record<string, number>,
    enabledCategories: CritiqueCategory[],
  ): Record<CritiqueCategory, number> {
    const result = {} as Record<CritiqueCategory, number>;
    for (const category of enabledCategories) {
      result[category] = Math.max(0, Math.min(1, scores[category] || 0.5));
    }
    return result;
  }

  /**
   * 检查质量标准
   */
  private checkQualityStandard(
    overallScore: number,
    criticalCount: number,
    majorCount: number,
    config: CritiqueRefineConfig,
  ): boolean {
    return (
      overallScore >= config.qualityStandard.minOverallScore &&
      criticalCount <= config.qualityStandard.maxCriticalIssues &&
      majorCount <= config.qualityStandard.maxMajorIssues
    );
  }

  /**
   * 建议改进轮数
   */
  private suggestRefinementRounds(
    overallScore: number,
    criticalCount: number,
  ): number {
    if (criticalCount > 0) return 3;
    if (overallScore < 0.6) return 3;
    if (overallScore < 0.75) return 2;
    if (overallScore < 0.85) return 1;
    return 0;
  }

  /**
   * 创建回退批评结果
   */
  private createFallbackCritique(config: CritiqueRefineConfig): CritiqueResult {
    const categoryScores = {} as Record<CritiqueCategory, number>;
    for (const category of config.enabledCategories) {
      categoryScores[category] = 0.6;
    }

    return {
      overallScore: 0.6,
      categoryScores,
      items: [],
      strengths: [],
      criticalIssues: [],
      improvementPriorities: ["建议人工审核"],
      summary: "自动批评失败，建议人工审核",
      meetsQualityStandard: false,
      suggestedRefinementRounds: 1,
    };
  }
}
