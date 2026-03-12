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
import { PrismaService } from "@/common/prisma/prisma.service";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type { DimensionMissionService } from "../services/dimension/dimension-mission.service";
import type { SearchPhaseResult } from "../services/dimension/dimension-mission.service";
import type { ResearchLeaderService } from "../services/core/research-leader.service";
import type { GlobalOutline } from "../services/core/research-leader.service";
import type { DimensionOutline } from "../types/leader.types";
import type { DimensionAnalysisResult } from "../types/research.types";
import type { ExtractedClaim } from "../types/v5-research.types";
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

export class DimensionWriteHandler
  implements WorkflowNodeHandler<DimensionWriteInput, DimensionWriteOutput>
{
  readonly handlerId = "ti:dimension-write";
  private readonly logger = new Logger(DimensionWriteHandler.name);

  constructor(
    private readonly dimensionMissionService: DimensionMissionService,
    private readonly researchLeaderService: ResearchLeaderService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolve outline: use global outline if available, fallback to local planning
   */
  async prepare(
    input: DimensionWriteInput,
    _context: ExecutionContext,
  ): Promise<DimensionWriteInput> {
    return input; // outline resolution happens in execute
  }

  async execute(
    input: DimensionWriteInput,
    _context: ExecutionContext,
  ): Promise<DimensionWriteOutput> {
    const { topic, dimension, searchResult, globalOutline } = input;

    // 1. Resolve outline — global coordinated or local fallback
    let outline: DimensionOutline | null = null;

    if (globalOutline) {
      const coordinated = globalOutline.dimensions.find(
        (d) =>
          d.dimensionId === dimension.id ||
          d.dimensionName === dimension.name,
      );
      if (coordinated) {
        outline = coordinated.outline;
        this.logger.log(
          `[execute] Using global coordinated outline for: ${dimension.name}`,
        );
      }
    }

    if (!outline) {
      this.logger.log(
        `[execute] Falling back to local outline planning for: ${dimension.name}`,
      );
      outline = await this.researchLeaderService.planDimensionOutline(
        {
          name: topic.name,
          type: topic.type,
          description: topic.description,
          language: topic.language,
        },
        {
          name: dimension.name,
          description: dimension.description,
          searchQueries: dimension.searchQueries,
        },
        searchResult.evidenceSummary,
        searchResult.figuresSummary || undefined,
        input.allDimensions,
      );
    }

    // 2. Execute writing phase
    const missionResult =
      await this.dimensionMissionService.executeWritingPhase(
        topic,
        dimension,
        searchResult,
        outline,
        input.reportId,
        undefined, // missionId
        input.assignment?.modelId,
        undefined, // taskId
        input.assignment?.tools,
        input.assignment?.skills,
        undefined, // validationContext
        input.maxRevisionRounds,
      );

    if (!missionResult.success) {
      throw new Error(
        missionResult.error || `Writing failed for dimension: ${dimension.name}`,
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
    context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.error(`[onError] Dimension write failed: ${error.message}`);

    // Mark dimension as FAILED in DB
    const input = context.input as unknown as DimensionWriteInput;
    if (input?.dimension?.id) {
      try {
        await this.prisma.topicDimension.update({
          where: { id: input.dimension.id },
          data: { status: "FAILED" },
        });
      } catch (err) {
        this.logger.warn(
          `[onError] Failed to mark dimension as FAILED: ${(err as Error).message}`,
        );
      }
    }

    return "skip";
  }
}
