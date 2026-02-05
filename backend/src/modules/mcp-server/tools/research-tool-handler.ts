/**
 * MCP Server - Research Tool Handler
 * 将 Raven 研究能力暴露为 MCP 工具
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
} from "../abstractions/mcp-server.interface";

/**
 * Deep Research 工具 - 创建研究主题并执行深度研究
 */
@Injectable()
export class ResearchToolHandler implements IMCPToolHandler {
  private readonly logger = new Logger(ResearchToolHandler.name);

  readonly toolName = "raven_deep_research";
  readonly description =
    "Execute deep research on a topic. Creates a research topic with configurable dimensions, " +
    "runs multi-agent investigation, and returns a comprehensive report with citations and evidence.";
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
    },
    required: ["topic"],
  };

  async execute(
    args: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    const topic = args.topic as string;
    const depth = (args.depth as string) || "standard";

    this.logger.log(
      `MCP research request: "${topic}" (depth: ${depth}, key: ${context.apiKeyId})`,
    );

    // TODO: Wire to TopicResearchService when full integration is ready
    // For now, return a structured placeholder showing the tool is functional
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "accepted",
            topic,
            depth,
            message:
              "Research request accepted. Full integration with TopicResearchService pending.",
            capabilities: [
              "multi-agent investigation",
              "citation tracking",
              "evidence credibility scoring",
              "dimension-based analysis",
            ],
          }),
        },
      ],
    };
  }
}
