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

export class QualityReviewHandler implements WorkflowNodeHandler<
  QualityReviewInput,
  OverallReviewResult
> {
  readonly handlerId = "ti:quality-review";
  private readonly logger = new Logger(QualityReviewHandler.name);

  constructor(
    private readonly researchReviewerService: ResearchReviewerService,
  ) {}

  async execute(
    input: QualityReviewInput,
    _context: ExecutionContext,
  ): Promise<OverallReviewResult> {
    this.logger.log(
      `[execute] Reviewing quality for topic: ${input.topic.name}`,
    );

    const result = await this.researchReviewerService.reviewAllDimensions(
      input.topic,
      input.dimensions,
      input.analysisResults,
    );

    this.logger.log(
      `[execute] Quality review completed: ${result.dimensionReviews.length} dimensions reviewed`,
    );

    return result;
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
