/**
 * Quality Metrics Types
 *
 * P0-P1 优化效果评估和呈现类型定义
 * 用于显性化功能使用和效果评估
 */

// ==================== RAG-Fusion 指标 ====================

/**
 * RAG-Fusion 执行指标
 */
export interface RAGFusionMetrics {
  /** 是否启用 */
  enabled: boolean;
  /** 使用的查询变体数 */
  variantsGenerated: number;
  /** 成功执行的变体数 */
  successfulVariants: number;
  /** 变体类型分布 */
  variantTypeDistribution: Record<string, number>;
  /** 融合前结果数（去重前） */
  rawResultCount: number;
  /** 融合后唯一结果数 */
  fusedResultCount: number;
  /** 平均覆盖度（结果被多少变体命中） */
  averageCoverage: number;
  /** 融合方法 */
  fusionMethod: string;
  /** 执行时间 (ms) */
  executionTimeMs: number;
  /** 效果评估 */
  effectiveness: {
    /** 召回提升估计 (相比单查询) */
    recallImprovementEstimate: number;
    /** 多样性分数 (0-1) */
    diversityScore: number;
    /** 对比查询贡献（反面证据数量） */
    contrastiveContributions: number;
  };
}

// ==================== Claim Verification 指标 ====================

/**
 * 声明验证执行指标
 */
export interface ClaimVerificationMetrics {
  /** 是否启用 */
  enabled: boolean;
  /** 提取的总声明数 */
  totalClaimsExtracted: number;
  /** 验证的声明数 */
  claimsVerified: number;
  /** 按验证结果分布 */
  verdictDistribution: {
    verified: number;
    partiallyVerified: number;
    unverified: number;
    contradicted: number;
  };
  /** 平均 FactScore */
  averageFactScore: number;
  /** 关键问题数（需要修复） */
  criticalIssuesCount: number;
  /** 按章节的验证率 */
  sectionVerificationRates: Array<{
    sectionId: string;
    sectionTitle: string;
    verificationRate: number;
    factScore: number;
  }>;
  /** 执行时间 (ms) */
  executionTimeMs: number;
  /** 效果评估 */
  effectiveness: {
    /** 整体可信度分数 (0-100) */
    overallCredibilityScore: number;
    /** 高置信度声明比例 */
    highConfidenceRatio: number;
    /** 需要人工审核的声明数 */
    flaggedForReviewCount: number;
  };
}

// ==================== Critique-Refine 指标 ====================

/**
 * 批评-改进循环执行指标
 */
export interface CritiqueRefineMetrics {
  /** 是否启用 */
  enabled: boolean;
  /** 触发改进的章节数 */
  sectionsRefined: number;
  /** 总迭代次数 */
  totalIterations: number;
  /** 每章节平均迭代次数 */
  averageIterationsPerSection: number;
  /** 应用的修改总数 */
  totalChangesApplied: number;
  /** 初始平均分数 */
  initialAverageScore: number;
  /** 最终平均分数 */
  finalAverageScore: number;
  /** 分数提升 */
  scoreImprovement: number;
  /** 停止原因分布 */
  stopReasonDistribution: Record<string, number>;
  /** 执行时间 (ms) */
  executionTimeMs: number;
  /** 效果评估 */
  effectiveness: {
    /** 质量提升百分比 */
    qualityImprovementPercent: number;
    /** 达到目标分数的章节比例 */
    targetReachedRatio: number;
    /** 批评类别分布 */
    critiqueCategories: Record<string, number>;
  };
}

// ==================== Specialized Agent 指标 ====================

/**
 * 专业角色协作执行指标
 */
export interface SpecializedAgentMetrics {
  /** 是否启用 */
  enabled: boolean;
  /** 参与的角色数 */
  participatingRoles: string[];
  /** 生成的洞察数 */
  insightsGenerated: number;
  /** 共识点数 */
  consensusPointsCount: number;
  /** 分歧点数 */
  divergencePointsCount: number;
  /** 是否执行辩论 */
  debateExecuted: boolean;
  /** 辩论轮数（如果执行） */
  debateRounds?: number;
  /** 最终共识率 */
  consensusRate: number;
  /** 执行时间 (ms) */
  executionTimeMs: number;
  /** 效果评估 */
  effectiveness: {
    /** 视角多样性分数 */
    perspectiveDiversityScore: number;
    /** 深度分析分数 */
    analysisDepthScore: number;
    /** 角色贡献分布 */
    roleContributions: Record<string, number>;
  };
}

// ==================== 综合质量增强报告 ====================

/**
 * 综合质量增强报告
 * 用于前端展示和效果评估
 */
export interface QualityMetricsReport {
  /** 研究主题 ID */
  topicId: string;
  /** 维度 ID（如果是维度级别） */
  dimensionId?: string;
  /** 生成时间 */
  generatedAt: Date;

  /** 各功能指标 */
  metrics: {
    ragFusion?: RAGFusionMetrics;
    claimVerification?: ClaimVerificationMetrics;
    critiqueRefine?: CritiqueRefineMetrics;
    specializedAgents?: SpecializedAgentMetrics;
  };

  /** 综合评估 */
  summary: {
    /** 启用的功能列表 */
    enabledFeatures: string[];
    /** 总执行时间 */
    totalExecutionTimeMs: number;
    /** 综合质量分数 (0-100) */
    overallQualityScore: number;
    /** 质量等级 */
    qualityGrade: "A" | "B" | "C" | "D" | "F";
    /** 关键亮点 */
    highlights: string[];
    /** 改进建议 */
    recommendations: string[];
  };

  /** 对比基线（不启用优化时的预估） */
  baselineComparison?: {
    /** 基线质量分数估计 */
    estimatedBaselineScore: number;
    /** 质量提升百分比 */
    qualityImprovementPercent: number;
    /** 召回提升百分比 */
    recallImprovementPercent: number;
    /** 可信度提升百分比 */
    credibilityImprovementPercent: number;
  };
}

/**
 * 质量等级计算
 */
export function calculateQualityGrade(
  score: number,
): QualityMetricsReport["summary"]["qualityGrade"] {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * 生成质量亮点
 */
export function generateQualityHighlights(
  metrics: QualityMetricsReport["metrics"],
): string[] {
  const highlights: string[] = [];

  if (metrics.ragFusion?.enabled) {
    if (metrics.ragFusion.effectiveness.diversityScore > 0.7) {
      highlights.push(
        `RAG-Fusion 提供了 ${metrics.ragFusion.variantsGenerated} 个查询变体，显著提升了搜索覆盖率`,
      );
    }
    if (metrics.ragFusion.effectiveness.contrastiveContributions > 0) {
      highlights.push(
        `对比查询发现了 ${metrics.ragFusion.effectiveness.contrastiveContributions} 条反面证据，增强了分析平衡性`,
      );
    }
  }

  if (metrics.claimVerification?.enabled) {
    const verifiedRatio =
      metrics.claimVerification.verdictDistribution.verified /
      Math.max(1, metrics.claimVerification.claimsVerified);
    if (verifiedRatio > 0.8) {
      highlights.push(
        `${Math.round(verifiedRatio * 100)}% 的核心声明已通过多源验证`,
      );
    }
    if (metrics.claimVerification.averageFactScore > 0.8) {
      highlights.push(
        `平均 FactScore 达到 ${(metrics.claimVerification.averageFactScore * 100).toFixed(0)}%，事实准确性高`,
      );
    }
  }

  if (metrics.critiqueRefine?.enabled) {
    if (metrics.critiqueRefine.scoreImprovement > 0.1) {
      highlights.push(
        `批评-改进循环将质量分数提升了 ${(metrics.critiqueRefine.scoreImprovement * 100).toFixed(0)}%`,
      );
    }
  }

  if (metrics.specializedAgents?.enabled) {
    if (metrics.specializedAgents.consensusRate > 0.7) {
      highlights.push(
        `${metrics.specializedAgents.participatingRoles.length} 个专业角色达成了 ${(metrics.specializedAgents.consensusRate * 100).toFixed(0)}% 的共识`,
      );
    }
  }

  return highlights;
}

/**
 * 生成改进建议
 */
export function generateQualityRecommendations(
  metrics: QualityMetricsReport["metrics"],
): string[] {
  const recommendations: string[] = [];

  if (metrics.claimVerification?.enabled) {
    if (metrics.claimVerification.verdictDistribution.unverified > 3) {
      recommendations.push(
        `有 ${metrics.claimVerification.verdictDistribution.unverified} 个声明未能验证，建议补充更多权威来源`,
      );
    }
    if (metrics.claimVerification.verdictDistribution.contradicted > 0) {
      recommendations.push(
        `发现 ${metrics.claimVerification.verdictDistribution.contradicted} 个矛盾声明，需要人工审核确认`,
      );
    }
  }

  if (metrics.critiqueRefine?.enabled) {
    if (metrics.critiqueRefine.effectiveness.targetReachedRatio < 0.8) {
      recommendations.push(
        `${((1 - metrics.critiqueRefine.effectiveness.targetReachedRatio) * 100).toFixed(0)}% 的章节未达到目标质量分数，建议人工审阅`,
      );
    }
  }

  if (metrics.specializedAgents?.enabled) {
    if (metrics.specializedAgents.divergencePointsCount > 3) {
      recommendations.push(
        `专家意见存在 ${metrics.specializedAgents.divergencePointsCount} 个分歧点，建议深入分析`,
      );
    }
  }

  return recommendations;
}
