/**
 * MCP Server - Research Tool Handler
 *
 * Deep research via DiscussionResearchService.executeDirectResearch()
 * 通过统一的研究编排服务执行，不再直接依赖 4 个内部子服务。
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
} from "../abstractions/mcp-server.interface";
import { DiscussionResearchService } from "../../ai-app/research/discussion/discussion-research.service";
import { withToolTimeout } from "./tool-timeout";

/** 深度研究总超时 5 分钟 (规划 + 多轮搜索 + 合成) */
const RESEARCH_TIMEOUT_MS = 5 * 60 * 1000;

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

  constructor(private readonly researchAgent: DiscussionResearchService) {}

  async execute(
    args: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    // Input validation
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
    const depth = (args.depth as "quick" | "standard" | "deep") || "standard";
    const language = (args.language as string) || "en";
    const dimensions = args.dimensions as string[] | undefined;

    this.logger.log(
      `MCP research request: "${topic.slice(0, 80)}" (depth: ${depth}, key: ${context.apiKeyId})`,
    );

    try {
      const result = await withToolTimeout(
        this.researchAgent.executeDirectResearch({
          query: topic,
          depth,
          language,
          dimensions,
        }),
        RESEARCH_TIMEOUT_MS,
        "Deep research",
      );

      // Empty results check
      const totalSources = result.searchRounds.reduce(
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
                  "The research did not find any sources. Try refining the topic.",
              }),
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              executiveSummary: result.report.executiveSummary,
              sections: result.report.sections,
              conclusion: result.report.conclusion,
              references: result.report.references,
              metadata: {
                ...result.report.metadata,
                duration: result.duration,
                depth,
                language,
              },
            }),
          },
        ],
      };
    } catch (error) {
      this.logger.error(`Research tool failed: ${error}`);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "Failed to complete research",
              details: error instanceof Error ? error.message : "Unknown error",
            }),
          },
        ],
        isError: true,
      };
    }
  }
}
