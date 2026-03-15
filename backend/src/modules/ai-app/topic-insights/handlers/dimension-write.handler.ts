/**
 * Dimension Write Handler
 *
 * WorkflowNodeHandler for TI dimension writing phase (Phase 3).
 * For each dimension: resolve outline → call executeWritingPhase().
 *
 * Input: { topic, dimension, searchResult, globalOutline?, assignment?, allDimensions, reportId, depthConfig? }
 * Output: { dimensionId, analysisResult, evidenceIds, extractedClaims? }
 */

import { Logger } from "@nestjs/common";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type { DimensionMissionService } from "../services/dimension/dimension-mission.service";
import type { SearchPhaseResult } from "../services/dimension/dimension-mission.service";
import type { GlobalOutline } from "../services/core/research/research-leader.service";
import type { OutlineResolverService } from "../services/dimension/outline-resolver.service";
import type { DimensionAnalysisResult } from "../types/research.types";
import type { ExtractedClaim } from "../types/research-depth.types";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

export interface DimensionWriteInput {
  topic: ResearchTopic;
  dimension: TopicDimension;
  searchResult: SearchPhaseResult;
  globalOutline: GlobalOutline | null;
  assignment?: { modelId?: string; tools?: string[]; skills?: string[] };
  allDimensions: Array<{ name: string; description: string | null }>;
  reportId: string;
  maxRevisionRounds?: number;
}

export interface DimensionWriteOutput {
  dimensionId: string;
  analysisResult: DimensionAnalysisResult;
  evidenceIds: string[];
  extractedClaims?: ExtractedClaim[];
}

export class DimensionWriteHandler implements WorkflowNodeHandler<
  DimensionWriteInput,
  DimensionWriteOutput
> {
  readonly handlerId = "ti:dimension-write";
  private readonly logger = new Logger(DimensionWriteHandler.name);

  constructor(
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly outlineResolver: OutlineResolverService,
  ) {}

  async execute(
    input: DimensionWriteInput,
    _context: ExecutionContext,
  ): Promise<DimensionWriteOutput> {
    const { topic, dimension, searchResult } = input;

    // 1. Resolve outline (global coordinated or local fallback)
    const outline = await this.outlineResolver.resolve(
      input.globalOutline,
      {
        name: topic.name,
        type: topic.type,
        description: topic.description,
        language: topic.language,
      },
      {
        id: dimension.id,
        name: dimension.name,
        description: dimension.description,
        searchQueries: dimension.searchQueries,
      },
      searchResult.evidenceSummary,
      searchResult.figuresSummary || undefined,
      input.allDimensions,
    );

    // 2. Execute writing phase
    const missionResult =
      await this.dimensionMissionService.executeWritingPhase(
        topic,
        dimension,
        searchResult,
        outline,
        input.reportId,
        undefined,
        input.assignment?.modelId,
        undefined,
        input.assignment?.tools,
        input.assignment?.skills,
        undefined,
        input.maxRevisionRounds,
      );

    if (!missionResult.success) {
      throw new Error(
        missionResult.error ||
          `Writing failed for dimension: ${dimension.name}`,
      );
    }

    return {
      dimensionId: dimension.id,
      analysisResult: missionResult.analysisResult!,
      evidenceIds: missionResult.evidenceIds,
      extractedClaims: missionResult.extractedClaims,
    };
  }

  async validate(
    output: DimensionWriteOutput,
    _context: ExecutionContext,
  ): Promise<boolean> {
    return !!output.analysisResult;
  }

  async onError(
    error: Error,
    _context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.error(`[onError] Dimension write failed: ${error.message}`);
    return "skip";
  }
}
