/**
 * Quality Review Handler
 *
 * WorkflowNodeHandler for TI research quality review.
 * Delegates to ResearchReviewerService.
 *
 * Input: { topic, dimensions, analysisResults }
 * Output: OverallReviewResult
 */

import { Logger } from "@nestjs/common";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type { ResearchReviewerService } from "../services/collaboration/research-reviewer.service";
import type { OverallReviewResult } from "../types/collaboration.types";
import type { DimensionAnalysisResult } from "../types/research.types";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

export interface QualityReviewInput {
  topic: ResearchTopic;
  dimensions: TopicDimension[];
  analysisResults: PromiseSettledResult<{
    dimensionId: string;
    analysisResult: DimensionAnalysisResult;
    evidenceIds: string[];
  }>[];
}

export class QualityReviewHandler
  implements WorkflowNodeHandler<QualityReviewInput, OverallReviewResult>
{
  readonly handlerId = "ti:quality-review";
  private readonly logger = new Logger(QualityReviewHandler.name);

  constructor(
    private readonly researchReviewerService: ResearchReviewerService,
  ) {}

  async execute(
    input: QualityReviewInput,
    _context: ExecutionContext,
  ): Promise<OverallReviewResult> {
    const { topic, dimensions, analysisResults } = input;

    this.logger.log(
      `[execute] Reviewing quality for topic: ${topic.name}`,
    );

    // Collect successful analyses
    const successfulAnalyses: Array<{
      dimension: TopicDimension;
      analysis: DimensionAnalysisResult;
      evidenceCount: number;
    }> = [];

    for (const result of analysisResults) {
      if (result.status === "fulfilled") {
        const dimension = dimensions.find(
          (d) => d.id === result.value.dimensionId,
        );
        if (dimension) {
          successfulAnalyses.push({
            dimension,
            analysis: result.value.analysisResult,
            evidenceCount: result.value.evidenceIds.length,
          });
        }
      }
    }

    // Per-dimension review
    const dimensionReviews = await Promise.all(
      successfulAnalyses.map(async ({ dimension, analysis, evidenceCount }) =>
        this.researchReviewerService.reviewDimension(
          topic,
          dimension,
          analysis,
          evidenceCount,
        ),
      ),
    );

    // Overall review
    const overallReview = await this.researchReviewerService.reviewOverall(
      topic,
      dimensions,
      dimensionReviews,
    );

    this.logger.log(
      `[execute] Quality review completed: ${overallReview.dimensionReviews.length} dimensions reviewed`,
    );

    return overallReview;
  }

  async onError(
    error: Error,
    _context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.warn(
      `[onError] Quality review failed (non-fatal): ${error.message}`,
    );
    return "skip";
  }
}
