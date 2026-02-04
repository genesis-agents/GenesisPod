/**
 * Quality Integration Helper
 *
 * ★ P0-P1: 质量增强集成辅助模块
 * 提供 Claim Verification 和 Critique-Refine 的集成支持
 *
 * 用于 DimensionWritingService 的质量指标收集和前端展示
 */

import { Logger } from "@nestjs/common";
import type { ClaimVerificationService } from "../verification/claim-verification.service";
// CritiqueRefineService will be used in P1 quality enhancement iteration
import type { DimensionVerificationReport } from "../../types/claim-verification.types";
import type { EnrichedEvidenceData } from "../../types/research.types";
import type { SectionWriteResult } from "./section-writer.service";

const logger = new Logger("QualityIntegrationHelper");

/**
 * P0-P1 质量增强指标（用于前端展示）
 */
export interface QualityEnhancementMetrics {
  /** RAG-Fusion 指标（从搜索阶段获取） */
  ragFusion?: {
    enabled: boolean;
    variantsGenerated: number;
    successfulVariants: number;
    fusionMethod: string;
    averageCoverage: number;
    rawResultCount: number;
    fusedResultCount: number;
    contrastiveResults: number;
    executionTimeMs: number;
  };
  /** Claim Verification 指标 */
  claimVerification?: {
    enabled: boolean;
    totalClaimsExtracted: number;
    claimsVerified: number;
    verdictDistribution: {
      verified: number;
      partiallyVerified: number;
      unverified: number;
      contradicted: number;
    };
    averageFactScore: number;
    overallCredibility: number;
    criticalIssuesCount: number;
    executionTimeMs: number;
  };
  /** Critique-Refine 指标 */
  critiqueRefine?: {
    enabled: boolean;
    sectionsRefined: number;
    totalIterations: number;
    initialAverageScore: number;
    finalAverageScore: number;
    scoreImprovement: number;
    totalChangesApplied: number;
    stopReason: string;
    executionTimeMs: number;
  };
}

/**
 * 质量增强结果
 */
export interface QualityEnhancementResult {
  metrics: QualityEnhancementMetrics;
  verificationReport?: DimensionVerificationReport;
}

/**
 * 执行 Claim Verification 并收集指标
 *
 * @param claimVerificationService 声明验证服务
 * @param dimensionId 维度ID
 * @param dimensionName 维度名称
 * @param sectionResults 章节写作结果
 * @param evidenceData 证据数据
 * @returns 质量增强结果
 */
export async function runClaimVerification(
  claimVerificationService: ClaimVerificationService,
  dimensionId: string,
  dimensionName: string,
  sectionResults: SectionWriteResult[],
  evidenceData: EnrichedEvidenceData[],
): Promise<QualityEnhancementResult> {
  const startTime = Date.now();
  const metrics: QualityEnhancementMetrics = {};

  if (evidenceData.length === 0 || sectionResults.length === 0) {
    logger.debug(`[runClaimVerification] Skipping - no evidence or sections`);
    return { metrics };
  }

  try {
    logger.log(
      `[runClaimVerification] Starting for dimension: ${dimensionName}`,
    );

    const verificationReport = await claimVerificationService.verifyDimension(
      dimensionId,
      dimensionName,
      sectionResults.map((r) => ({
        id: r.sectionId,
        title: r.title,
        content: r.content,
      })),
      evidenceData,
    );

    metrics.claimVerification = {
      enabled: true,
      totalClaimsExtracted: verificationReport.aggregateMetrics.totalClaims,
      claimsVerified: Math.round(
        verificationReport.aggregateMetrics.totalClaims *
          verificationReport.aggregateMetrics.verificationRate,
      ),
      verdictDistribution: {
        verified: verificationReport.sections.reduce(
          (sum, s) => sum + s.metrics.verifiedClaims,
          0,
        ),
        partiallyVerified: verificationReport.sections.reduce(
          (sum, s) => sum + s.metrics.partiallyVerifiedClaims,
          0,
        ),
        unverified: verificationReport.sections.reduce(
          (sum, s) => sum + s.metrics.unverifiedClaims,
          0,
        ),
        contradicted: verificationReport.sections.reduce(
          (sum, s) => sum + s.metrics.contradictedClaims,
          0,
        ),
      },
      averageFactScore: verificationReport.aggregateMetrics.averageFactScore,
      overallCredibility:
        verificationReport.aggregateMetrics.overallCredibility,
      criticalIssuesCount:
        verificationReport.aggregateMetrics.criticalIssuesCount,
      executionTimeMs: Date.now() - startTime,
    };

    logger.log(
      `[runClaimVerification] Completed: ` +
        `${metrics.claimVerification.totalClaimsExtracted} claims, ` +
        `credibility: ${metrics.claimVerification.overallCredibility}%`,
    );

    return { metrics, verificationReport };
  } catch (error) {
    logger.warn(`[runClaimVerification] Failed (non-fatal): ${error}`);
    return { metrics };
  }
}

/**
 * 从搜索阶段结果提取 RAG-Fusion 指标
 */
export function extractRAGFusionMetrics(searchMetadata?: {
  ragFusion?: {
    enabled: boolean;
    variantsGenerated: number;
    successfulVariants: number;
    fusionMethod: string;
    averageCoverage: number;
    rawResultCount: number;
    fusedResultCount: number;
    contrastiveResults: number;
    executionTimeMs: number;
  };
}): QualityEnhancementMetrics {
  if (!searchMetadata?.ragFusion) {
    return {};
  }

  return {
    ragFusion: searchMetadata.ragFusion,
  };
}

/**
 * 合并多个质量指标
 */
export function mergeQualityMetrics(
  ...metricsArray: QualityEnhancementMetrics[]
): QualityEnhancementMetrics {
  const result: QualityEnhancementMetrics = {};

  for (const metrics of metricsArray) {
    if (metrics.ragFusion) {
      result.ragFusion = metrics.ragFusion;
    }
    if (metrics.claimVerification) {
      result.claimVerification = metrics.claimVerification;
    }
    if (metrics.critiqueRefine) {
      result.critiqueRefine = metrics.critiqueRefine;
    }
  }

  return result;
}
