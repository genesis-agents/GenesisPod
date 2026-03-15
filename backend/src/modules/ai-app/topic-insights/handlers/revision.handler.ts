/**
 * Revision Handler
 *
 * WorkflowNodeHandler for TI failed dimension revision (critique-refine loop).
 * Delegates to CritiqueRefineService.runCritiqueRefineAndPersist().
 *
 * Input: { topic, dimensions, analysisResults, reviewResult, reportId }
 * Output: { revisedCount }
 */

import { Logger } from "@nestjs/common";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type {
  CritiqueRefineService,
  CritiqueRefineRequest,
} from "../services/quality/critique-refine.service";
import type { OverallReviewResult } from "../types/collaboration.types";
import type { DimensionAnalysisResult } from "../types/research.types";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

export interface RevisionInput {
  topic: ResearchTopic;
  dimensions: TopicDimension[];
  analysisResults: PromiseSettledResult<{
    dimensionId: string;
    analysisResult: DimensionAnalysisResult;
    evidenceIds: string[];
  }>[];
  reviewResult: OverallReviewResult;
  reportId: string;
}

export interface RevisionOutput {
  revisedCount: number;
  totalTargeted: number;
}

export class RevisionHandler implements WorkflowNodeHandler<
  RevisionInput,
  RevisionOutput
> {
  readonly handlerId = "ti:revision";
  private readonly logger = new Logger(RevisionHandler.name);

  constructor(private readonly critiqueRefineService: CritiqueRefineService) {}

  async execute(
    input: RevisionInput,
    _context: ExecutionContext,
  ): Promise<RevisionOutput> {
    const { dimensions, analysisResults, reviewResult, reportId } = input;
    const dimensionIds = new Set(reviewResult.dimensionsToReresearch);

    if (dimensionIds.size === 0) {
      return { revisedCount: 0, totalTargeted: 0 };
    }

    this.logger.log(`[execute] Revising ${dimensionIds.size} dimensions`);

    let revisedCount = 0;

    for (const result of analysisResults) {
      if (result.status !== "fulfilled") continue;
      if (!dimensionIds.has(result.value.dimensionId)) continue;

      const { dimensionId, analysisResult } = result.value;
      const dimension = dimensions.find((d) => d.id === dimensionId);
      if (!dimension || !analysisResult.detailedContent) continue;

      const dimReview = reviewResult.dimensionReviews.find(
        (r) => r.dimensionId === dimensionId,
      );
      const qualityFeedback = dimReview
        ? `质量评分: ${dimReview.overallScore}/100. 问题: ${dimReview.issues.map((i) => i.description).join("; ")}. 建议: ${dimReview.suggestions.join("; ")}`
        : reviewResult.recommendations.join("; ");

      try {
        const { revised } =
          await this.critiqueRefineService.runCritiqueRefineAndPersist(
            {
              content: analysisResult.detailedContent,
              context: {
                topicName: input.topic.name,
                dimensionName: dimension.name,
                qualityExpectation: qualityFeedback,
              },
              config: { maxIterations: 1 },
            } satisfies CritiqueRefineRequest,
            { dimensionId, reportId },
          );

        if (revised) {
          revisedCount++;
          this.logger.log(`[execute] Revised ${dimension.name}`);
        }
      } catch (revisionError) {
        this.logger.warn(
          `[execute] Failed to revise ${dimension.name}: ${revisionError}`,
        );
      }
    }

    this.logger.log(
      `[execute] Completed: ${revisedCount}/${dimensionIds.size} revised`,
    );

    return { revisedCount, totalTargeted: dimensionIds.size };
  }

  async onError(
    error: Error,
    _context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.warn(`[onError] Revision failed (non-fatal): ${error.message}`);
    return "skip";
  }
}
