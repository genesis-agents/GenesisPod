/**
 * MCP Server - Research Tool Handler
 * Deep research via ResearchPlanner + IterativeSearch + SelfReflection + ReportSynthesizer
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
} from "../abstractions/mcp-server.interface";
import { ResearchPlannerService } from "../../ai-app/research/deep-research/research-planner.service";
import { IterativeSearchService } from "../../ai-app/research/deep-research/iterative-search.service";
import { SelfReflectionService } from "../../ai-app/research/deep-research/self-reflection.service";
import { ReportSynthesizerService } from "../../ai-app/research/deep-research/report-synthesizer.service";
import type {
  ResearchPlan,
  SearchRound,
} from "../../ai-app/research/deep-research/types";

const DEPTH_CONFIG = {
  quick: { maxRounds: 2, depth: "quick" as const },
  standard: { maxRounds: 4, depth: "standard" as const },
  deep: { maxRounds: 8, depth: "thorough" as const },
};

const STAGE_TIMEOUT_MS = 120_000; // 2 minutes per stage

@Injectable()
export class ResearchToolHandler implements IMCPToolHandler {
  private readonly logger = new Logger(ResearchToolHandler.name);

  readonly toolName = "raven_deep_research";
  readonly description =
    "Execute deep research on a topic. Creates a research plan, " +
    "runs iterative search with self-reflection, and returns a comprehensive report with citations and evidence.";
  readonly inputSchema = {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "The research topic or question to investigate",
      },
      dimensions: {
        type: "array",
        items: { type: "string" },
        description:
          "Optional research dimensions/angles to explore (e.g., 'market analysis', 'technical feasibility')",
      },
      depth: {
        type: "string",
        enum: ["quick", "standard", "deep"],
        description: "Research depth level. Default: standard",
      },
      language: {
        type: "string",
        description: "Output language for the report. Default: en",
      },
    },
    required: ["topic"],
  };

  constructor(
    private readonly planner: ResearchPlannerService,
    private readonly search: IterativeSearchService,
    private readonly reflection: SelfReflectionService,
    private readonly synthesizer: ReportSynthesizerService,
  ) {}

  async execute(
    args: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    // Fix 4 (H4): Runtime input validation
    if (typeof args.topic !== "string" || !args.topic.trim()) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Invalid input",
              details: "topic must be a non-empty string",
            }),
          },
        ],
        isError: true,
      };
    }

    if (args.dimensions !== undefined) {
      if (
        !Array.isArray(args.dimensions) ||
        !args.dimensions.every((d) => typeof d === "string")
      ) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "Invalid input",
                details: "dimensions must be an array of strings",
              }),
            },
          ],
          isError: true,
        };
      }
    }

    if (
      args.depth !== undefined &&
      !["quick", "standard", "deep"].includes(args.depth as string)
    ) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Invalid input",
              details: 'depth must be one of: "quick", "standard", "deep"',
            }),
          },
        ],
        isError: true,
      };
    }

    const topic = args.topic as string;
    const depthKey = (args.depth as string) || "standard";
    const language = (args.language as string) || "en";
    const dimensions = args.dimensions as string[] | undefined;

    const config =
      DEPTH_CONFIG[depthKey as keyof typeof DEPTH_CONFIG] ||
      DEPTH_CONFIG.standard;
    const startTime = Date.now();

    this.logger.log(
      `MCP research request: "${topic}" (depth: ${depthKey}, maxRounds: ${config.maxRounds}, key: ${context.apiKeyId})`,
    );

    let currentStage = "initialization";
    let completedRounds = 0;

    try {
      // Enrich topic with dimensions if provided
      const enrichedQuery = dimensions?.length
        ? `${topic}\n\nFocus dimensions: ${dimensions.join(", ")}`
        : topic;

      // Fix 1 (H1): Step 1 with timeout protection
      currentStage = "planning";
      const plan = await this.withTimeout(
        this.planner.generatePlan(enrichedQuery, {
          depth: config.depth,
        }),
        STAGE_TIMEOUT_MS,
        "Research planning",
      );

      this.logger.debug(
        `Research plan generated: ${plan.steps.length} steps, objective: ${plan.objective}`,
      );

      // Fix 1 (H1): Step 2 with timeout protection
      currentStage = "search";
      const searchRounds = await this.withTimeout(
        this.executeSearchLoop(enrichedQuery, plan, config.maxRounds),
        STAGE_TIMEOUT_MS,
        "Iterative search",
      );

      completedRounds = searchRounds.length;

      this.logger.debug(
        `Search completed: ${searchRounds.length} rounds, total sources: ${searchRounds.reduce((sum, r) => sum + r.sources.length, 0)}`,
      );

      // Fix 4 (M3): Empty search results handling
      const totalSources = searchRounds.reduce(
        (sum, r) => sum + r.sources.length,
        0,
      );
      if (totalSources === 0) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: "No search results found",
                details:
                  "The research did not find any sources. Try refining the topic or adjusting search parameters.",
              }),
            },
          ],
          isError: true,
        };
      }

      // Fix 1 (H1): Step 3 with timeout protection
      currentStage = "synthesis";
      const report = await this.withTimeout(
        this.synthesizer.generateReport(enrichedQuery, searchRounds, {
          language,
        }),
        STAGE_TIMEOUT_MS,
        "Report synthesis",
      );

      const duration = Math.round((Date.now() - startTime) / 1000);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              executiveSummary: report.executiveSummary,
              sections: report.sections,
              conclusion: report.conclusion,
              references: report.references,
              metadata: {
                ...report.metadata,
                duration,
                depth: depthKey,
                language,
              },
            }),
          },
        ],
      };
    } catch (error) {
      // Fix 5: Better error context
      this.logger.error(
        `Research tool failed at stage "${currentStage}" after ${completedRounds} rounds: ${error}`,
      );
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Failed to complete research",
              details: error instanceof Error ? error.message : "Unknown error",
              stage: currentStage,
              completedRounds,
            }),
          },
        ],
        isError: true,
      };
    }
  }

  /**
   * Fix 1 (H1): Timeout wrapper for stage protection
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    stageName: string,
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `${stageName} exceeded timeout of ${timeoutMs / 1000}s`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }

  private async executeSearchLoop(
    query: string,
    plan: ResearchPlan,
    maxRounds: number,
  ): Promise<SearchRound[]> {
    const searchRounds: SearchRound[] = [];
    let currentRound = 0;
    let stepIndex = 0;

    while (currentRound < maxRounds && stepIndex < plan.steps.length) {
      const step = plan.steps[stepIndex];
      currentRound++;

      // Execute search step
      const round = await this.search.executeStep(step, currentRound);
      searchRounds.push(round);

      // Reflect on progress (skip reflection on last possible round)
      if (currentRound < maxRounds) {
        try {
          const reflectionResult = await this.reflection.reflect(
            query,
            plan,
            searchRounds,
            currentRound,
            maxRounds,
          );

          if (
            !this.reflection.shouldContinue(
              reflectionResult,
              currentRound,
              maxRounds,
            )
          ) {
            this.logger.debug(
              `Research complete at round ${currentRound}: ${reflectionResult.reasoning}`,
            );
            break;
          }

          // Handle pivot: add new steps from reflection
          if (reflectionResult.decision === "pivot") {
            const pivotSteps = this.reflection.generatePivotSteps(
              reflectionResult,
              plan,
              currentRound,
            );
            plan.steps.push(...pivotSteps);
          }
        } catch (err) {
          // Fix 2 (H2): Reflection failure fallback with smart decision
          const isEarlyStage = currentRound < maxRounds * 0.5;
          if (isEarlyStage) {
            this.logger.warn(
              `Reflection failed at round ${currentRound} (early stage), continuing: ${err}`,
            );
            // Continue search loop
          } else {
            this.logger.warn(
              `Reflection failed at round ${currentRound} (late stage), completing research: ${err}`,
            );
            break; // Complete research with what we have
          }
        }
      }

      stepIndex++;
    }

    return searchRounds;
  }
}
