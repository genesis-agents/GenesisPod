/**
 * Search Phase Handler
 *
 * WorkflowNodeHandler for TI dimension search phase (Phase 1).
 * Delegates to DimensionMissionService.executeSearchPhase().
 *
 * Input: { topic, dimension, modelId?, assignedTools?, assignedSkills? }
 * Output: SearchPhaseResult
 */

import { Logger } from "@nestjs/common";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type { DimensionMissionService } from "../services/dimension/dimension-mission.service";
import type { SearchPhaseResult } from "../services/dimension/dimension-mission.service";
import type { ResearchTopic, TopicDimension } from "@prisma/client";

export interface SearchPhaseInput {
  topic: ResearchTopic;
  dimension: TopicDimension;
  modelId?: string;
  assignedTools?: string[];
  assignedSkills?: string[];
}

export class SearchPhaseHandler
  implements WorkflowNodeHandler<SearchPhaseInput, SearchPhaseResult>
{
  readonly handlerId = "ti:search-phase";
  private readonly logger = new Logger(SearchPhaseHandler.name);

  constructor(
    private readonly dimensionMissionService: DimensionMissionService,
  ) {}

  async execute(
    input: SearchPhaseInput,
    _context: ExecutionContext,
  ): Promise<SearchPhaseResult> {
    this.logger.log(
      `[execute] Searching dimension: ${input.dimension.name}`,
    );

    return this.dimensionMissionService.executeSearchPhase(
      input.topic,
      input.dimension,
      undefined, // missionId
      input.modelId,
      undefined, // taskId
      input.assignedTools,
      input.assignedSkills,
    );
  }

  async validate(
    output: SearchPhaseResult,
    _context: ExecutionContext,
  ): Promise<boolean> {
    // 搜索阶段必须有证据数据
    if (!output.enrichedResults || output.enrichedResults.length === 0) {
      this.logger.warn(
        `[validate] No enriched results for dimension: ${output.dimensionName}`,
      );
      return false;
    }
    return true;
  }

  async onError(
    error: Error,
    _context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.error(`[onError] Search failed: ${error.message}`);
    // 单个维度搜索失败不应中止整个 pipeline
    return "skip";
  }
}
