/**
 * Claim-Level Verification Types
 *
 * P0 优化：声明级事实验证类型定义
 * 参考：FActScore (Min et al., 2023)
 */

/**
 * 声明类型枚举
 */
export enum ClaimType {
  FACTUAL = "factual", // 可验证的事实陈述
  STATISTICAL = "statistical", // 数据/统计声明
  CAUSAL = "causal", // 因果关系声明
  COMPARATIVE = "comparative", // 比较性声明
  PREDICTIVE = "predictive", // 预测性声明
  DEFINITIONAL = "definitional", // 定义性声明
  OPINION = "opinion", // 观点（不需验证）
}

/**
 * 从内容中提取的原子声明
 */
export interface VerifiableClaim {
  id: string; // claim-{sectionId}-{index}
  text: string; // 声明文本
  type: ClaimType;
  location: {
    sectionId: string;
    paragraphIndex: number;
    sentenceIndex: number;
    charStart: number;
    charEnd: number;
  };
  verificationPriority: "high" | "medium" | "low";
  extractedAt: Date;
}

/**
 * 单个证据源对声明的验证结果
 */
export interface SourceVerification {
  evidenceId: string;
  evidenceTitle: string;
  evidenceUrl: string;

  verdict: "supports" | "refutes" | "neutral" | "insufficient";
  confidence: number; // 0-1

  relevantQuote: string; // 支持/反驳的原文引用
  reasoning: string; // AI 推理过程

  factualAlignment: number; // 0-1, 与证据的事实一致性
}

/**
 * 声明的综合验证结果
 */
export interface ClaimVerificationResult {
  claim: VerifiableClaim;

  // 多源验证
  sourceVerifications: SourceVerification[];

  // 综合判定
  overallVerdict:
    | "verified"
    | "partially_verified"
    | "unverified"
    | "contradicted";
  factScore: number; // 0-1, FActScore 指标
  agreementRate: number; // 0-1, 源之间的一致性

  // 置信度分析
  confidence: {
    level: number; // 0-1
    factors: Array<{
      factor: string;
      impact: "positive" | "negative";
      weight: number;
    }>;
  };

  // 如果验证失败
  issues?: Array<{
    type: "factual_error" | "unsupported" | "contradicted" | "outdated";
    description: string;
    severity: "critical" | "major" | "minor";
  }>;

  // 修复建议
  remediation?: {
    suggestedCorrection: string;
    additionalSourcesNeeded: boolean;
    alternativeClaims: string[];
  };
}

/**
 * 章节级别的验证报告
 */
export interface SectionVerificationReport {
  sectionId: string;
  sectionTitle: string;

  claims: ClaimVerificationResult[];

  // 章节级别指标
  metrics: {
    totalClaims: number;
    verifiedClaims: number;
    partiallyVerifiedClaims: number;
    unverifiedClaims: number;
    contradictedClaims: number;
    averageFactScore: number;
    overallCredibility: number; // 0-100
  };

  // 需要人工审核的声明
  flaggedForReview: string[]; // claim IDs

  // 验证摘要
  summary: {
    strengths: string[];
    concerns: string[];
    recommendations: string[];
  };
}

/**
 * 维度级别的验证报告
 */
export interface DimensionVerificationReport {
  dimensionId: string;
  dimensionName: string;

  sections: SectionVerificationReport[];

  // 维度级别指标
  aggregateMetrics: {
    totalClaims: number;
    verificationRate: number; // 已验证/总数
    averageFactScore: number;
    overallCredibility: number; // 0-100
    criticalIssuesCount: number;
  };

  // 维度级别建议
  recommendations: string[];
}

/**
 * 验证配置
 */
export interface ClaimVerificationConfig {
  // 是否启用验证
  enabled: boolean;

  // 每个章节最大验证声明数
  maxClaimsPerSection: number;

  // 每个声明最大验证源数
  maxSourcesPerClaim: number;

  // 最小可信度阈值
  minCredibilityThreshold: number;

  // 是否在发现反驳时触发修订
  triggerRevisionOnContradiction: boolean;

  // 验证优先级（只验证高优先级）
  verificationPriorities: ("high" | "medium" | "low")[];
}

/**
 * 默认验证配置
 */
export const DEFAULT_CLAIM_VERIFICATION_CONFIG: ClaimVerificationConfig = {
  enabled: true,
  maxClaimsPerSection: 20,
  maxSourcesPerClaim: 5,
  minCredibilityThreshold: 60,
  triggerRevisionOnContradiction: true,
  verificationPriorities: ["high", "medium"],
};
