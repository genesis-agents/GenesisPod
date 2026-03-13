/**
 * Assemble Write Inputs Handler
 *
 * Combines per-dimension search results with global outline and agent
 * assignments into DimensionWriteInput[] for the parallel writing phase.
 *
 * Replaces the broken IIFE expression in the workflow definition which
 * was rejected by SAFE_EXPRESSION regex (contains {, }, ; characters).
 *
 * Input: { topic, dimensions, searchResults, reportId, globalOutline?, agentAssignments? }
 * Output: DimensionWriteInput[]
 */

import { Logger } from "@nestjs/common";
import type {
  WorkflowNodeHandler,
  ExecutionContext,
} from "@/modules/ai-engine/facade";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type { SearchPhaseResult } from "../services/dimension/dimension-mission.service";
import type { GlobalOutline } from "../services/core/research/research-leader.service";
import type { DimensionWriteInput } from "./dimension-write.handler";

export interface AssembleWriteInputsInput {
  topic: ResearchTopic;
  dimensions: TopicDimension[];
  searchResults: SearchPhaseResult[];
  reportId: string;
  globalOutline?: GlobalOutline | null;
  agentAssignments?: Array<{
    assignedDimensions?: string[];
    modelId?: string;
    tools?: string[];
    skills?: string[];
  }>;
}

export class AssembleWriteInputsHandler implements WorkflowNodeHandler<
  AssembleWriteInputsInput,
  DimensionWriteInput[]
> {
  readonly handlerId = "ti:assemble-write-inputs";
  private readonly logger = new Logger(AssembleWriteInputsHandler.name);

  async execute(
    input: AssembleWriteInputsInput,
    _context: ExecutionContext,
  ): Promise<DimensionWriteInput[]> {
    const {
      topic,
      dimensions = [],
      searchResults = [],
      reportId,
      globalOutline = null,
      agentAssignments = [],
    } = input;

    this.logger.log(
      `[execute] Assembling ${dimensions.length} write inputs (searchResults=${searchResults.length}, reportId=${reportId?.slice(0, 8) || "NONE"})`,
    );

    const allDimensions = dimensions.map((d) => ({
      name: d.name,
      description: d.description,
    }));

    return dimensions.map((dim, i) => {
      const assignment = agentAssignments.find((a) => {
        const assigned = a.assignedDimensions || [];
        return assigned.includes(dim.id) || assigned.includes(dim.name);
      });

      return {
        topic,
        dimension: dim,
        searchResult: searchResults[i] || ({} as SearchPhaseResult),
        globalOutline: globalOutline || null,
        assignment: assignment
          ? {
              modelId: assignment.modelId,
              tools: assignment.tools,
              skills: assignment.skills,
            }
          : undefined,
        allDimensions,
        reportId,
      };
    });
  }

  async validate(
    output: DimensionWriteInput[],
    _context: ExecutionContext,
  ): Promise<boolean> {
    if (!Array.isArray(output) || output.length === 0) {
      this.logger.warn("[validate] No write inputs assembled");
      return false;
    }
    return output.every((wi) => wi.topic && wi.dimension && wi.reportId);
  }

  async onError(
    error: Error,
    _context: ExecutionContext,
  ): Promise<"retry" | "skip" | "abort"> {
    this.logger.error(
      `[onError] Failed to assemble write inputs: ${error.message}`,
    );
    return "abort";
  }
}
