/**
 * Workflow Refresh Pipeline Service
 *
 * New orchestration entry point using DAGExecutor + WorkflowNodeHandler pattern.
 * Replaces the imperative RefreshPipelineService.researchDimensionsInParallel().
 *
 * This service:
 * 1. Constructs ExecutionContext from business inputs
 * 2. Prepares search/write inputs for map steps
 * 3. Delegates to DAGExecutor.execute() for orchestration
 * 4. Maps DAG results back to business types
 */

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { DAGExecutor } from "@/modules/ai-engine/facade";
import type { ExecutionContext, JsonObject } from "@/modules/ai-engine/facade";
import type { ResearchTopic, TopicDimension } from "@prisma/client";
import type { AgentAssignment, SkillBindings } from "../types/leader.types";
import { resolveFrameworkSkills } from "../config/framework-skills.config";
import type { DimensionAnalysisResult } from "../types/research.types";
import type {
  ResearchDepthConfig,
  ResearchDesign,
  ExtractedClaim,
} from "../types/research-depth.types";
import type { SearchPhaseInput } from "../handlers/search-phase.handler";
import { REFRESH_PIPELINE_WORKFLOW } from "./refresh-pipeline.workflow";
import { v4 as uuid } from "uuid";

/** Result shape matching the old RefreshPipelineService */
export interface WorkflowRefreshResult {
  results: PromiseSettledResult<{
    dimensionId: string;
    analysisResult: DimensionAnalysisResult;
    evidenceIds: string[];
    extractedClaims?: ExtractedClaim[];
  }>[];
  researchDesign?: ResearchDesign;
}

@Injectable()
export class WorkflowRefreshPipelineService {
  private readonly logger = new Logger(WorkflowRefreshPipelineService.name);

  constructor(private readonly dagExecutor: DAGExecutor) {}

  /**
   * Execute the full refresh pipeline using DAG workflow.
   *
   * API-compatible with RefreshPipelineService.researchDimensionsInParallel()
   */
  async execute(
    topic: ResearchTopic,
    dimensions: TopicDimension[],
    reportId: string,
    signal: AbortSignal,
    agentAssignments: AgentAssignment[] = [],
    depthConfig?: ResearchDepthConfig,
    _parallelism: number = 4,
  ): Promise<WorkflowRefreshResult> {
    this.logger.log(
      `[execute] Starting workflow pipeline for topic: ${topic.name} (${dimensions.length} dimensions)`,
    );

    // 1. Prepare search inputs (one per dimension)
    const searchInputs: SearchPhaseInput[] = dimensions.map((dimension) => {
      const assignment = agentAssignments.find(
        (a) =>
          a.assignedDimensions?.includes(dimension.id) ||
          a.assignedDimensions?.includes(dimension.name),
      );

      let assignedTools = assignment?.tools || [];
      if (assignedTools.length === 0 && dimension.searchSources) {
        const sources = dimension.searchSources as string[];
        if (Array.isArray(sources) && sources.length > 0) {
          assignedTools = sources;
        }
      }

      return {
        topic,
        dimension,
        modelId: assignment?.modelId,
        assignedTools,
        assignedSkills: assignment?.skills || [],
      };
    });

    // 2. Build initial context (cast to JsonObject — runtime values are JSON-compatible)
    const initialState = {
      topic,
      dimensions,
      reportId,
      searchInputs,
      agentAssignments,
      depthConfig,
    } as unknown as JsonObject;

    // 2b. Build skill bindings — framework skills + per-dimension leader assignments
    const skillBindings: SkillBindings = {
      framework: resolveFrameworkSkills(topic.type),
      perDimension: {},
    };
    for (const assignment of agentAssignments) {
      if (
        assignment.skills &&
        assignment.skills.length > 0 &&
        assignment.assignedDimensions
      ) {
        for (const dimRef of assignment.assignedDimensions) {
          skillBindings.perDimension[dimRef] = [
            ...(skillBindings.perDimension[dimRef] || []),
            ...assignment.skills,
          ];
        }
      }
    }

    const executionContext: ExecutionContext = {
      executionId: uuid(),
      workflowId: REFRESH_PIPELINE_WORKFLOW.id,
      input: initialState,
      state: initialState,
      stepResults: new Map(),
      startTime: new Date(),
      signal,
      metadata: {
        roomConfig: {
          roomId: `topic:${topic.id}`,
          roomType: "topic",
          entityId: topic.id,
        },
        skillBindings,
      } as unknown as JsonObject,
    };

    // 3. Execute DAG workflow (public API: async generator)
    const events = this.dagExecutor.execute(
      REFRESH_PIPELINE_WORKFLOW,
      executionContext,
    );

    // Consume all events
    for await (const event of events) {
      if (event.type === "step_completed" && event.stepId) {
        this.logger.log(`[execute] Step completed: ${event.stepId}`);
      } else if (event.type === "step_failed" && event.stepId) {
        this.logger.warn(`[execute] Step failed: ${event.stepId}`);
      }
    }

    // 4. Map results back to business types
    const state = executionContext.state as unknown as Record<string, unknown>;
    const searchResults = (state.searchResults || []) as Array<{
      dimensionId: string;
      dimensionName: string;
    }>;
    const writeResults = (state.writeResults || []) as Array<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
      extractedClaims?: ExtractedClaim[];
    }>;

    if (writeResults.length === 0 && searchResults.length === 0) {
      throw new ServiceUnavailableException(
        "All dimension processing failed in workflow pipeline",
      );
    }

    // Convert to PromiseSettledResult format for backward compatibility
    const results: PromiseSettledResult<{
      dimensionId: string;
      analysisResult: DimensionAnalysisResult;
      evidenceIds: string[];
      extractedClaims?: ExtractedClaim[];
    }>[] = dimensions.map((dim) => {
      const writeResult = writeResults.find((r) => r.dimensionId === dim.id);
      if (writeResult) {
        return { status: "fulfilled" as const, value: writeResult };
      }
      return {
        status: "rejected" as const,
        reason: new Error(`Dimension ${dim.name} failed or was skipped`),
      };
    });

    this.logger.log(
      `[execute] Workflow pipeline completed: ${writeResults.length}/${dimensions.length} dimensions successful`,
    );

    return { results };
  }
}
