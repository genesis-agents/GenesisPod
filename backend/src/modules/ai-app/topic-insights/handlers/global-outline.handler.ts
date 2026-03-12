/**
 * Global Outline Handler
 *
 * WorkflowNodeHandler for TI global outline planning (Phase 2).
 * Delegates to ResearchLeaderService.planGlobalOutline().
 *
 * Input: { topic, dimensionSearchSummaries }
 * Output: GlobalOutline | null
 */

import { Logger } from "@nestjs/common";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type { ResearchLeaderService } from "../services/core/research-leader.service";
import type { GlobalOutline } from "../services/core/research-leader.service";

export interface GlobalOutlineInput {
  topic: {
    name: string;
    type: string;
    description: string | null;
    language: string | null;
  };
  dimensionSearchSummaries: Array<{
    dimensionId: string;
    dimensionName: string;
    dimensionDescription: string | null;
    evidenceSummary: string;
    figuresSummary: string;
    searchQueries: unknown;
  }>;
}

export class GlobalOutlineHandler
  implements WorkflowNodeHandler<GlobalOutlineInput, GlobalOutline | null>
{
  readonly handlerId = "ti:global-outline";
  private readonly logger = new Logger(GlobalOutlineHandler.name);

  constructor(
    private readonly researchLeaderService: ResearchLeaderService,
  ) {}

  async execute(
    input: GlobalOutlineInput,
    _context: ExecutionContext,
  ): Promise<GlobalOutline | null> {
    this.logger.log(
      `[execute] Planning global outline for ${input.dimensionSearchSummaries.length} dimensions`,
    );

    try {
      const outline = await this.researchLeaderService.planGlobalOutline(
        input.topic,
        input.dimensionSearchSummaries,
      );

      this.logger.log(
        `[execute] Global outline planned: ${outline.dimensions.length} dimensions`,
      );

      return outline;
    } catch (error) {
      // Global outline failure is non-fatal — fallback to per-dimension local planning
      this.logger.warn(
        `[execute] Global outline planning failed, will fallback to local: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async onError(
    error: Error,
    _context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.warn(
      `[onError] Global outline failed (non-fatal): ${error.message}`,
    );
    return "skip";
  }
}
