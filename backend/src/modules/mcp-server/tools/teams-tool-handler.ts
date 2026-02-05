/**
 * MCP Server - Teams Tool Handler
 * 将 Raven Teams 辩论/分析能力暴露为 MCP 工具
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
} from "../abstractions/mcp-server.interface";

/**
 * AI Teams Debate 工具 - 多 Agent 辩论分析
 */
@Injectable()
export class TeamsDebateToolHandler implements IMCPToolHandler {
  private readonly logger = new Logger(TeamsDebateToolHandler.name);

  readonly toolName = "raven_team_debate";
  readonly description =
    "Run a structured multi-agent debate on a topic. Two AI agents with opposing perspectives " +
    "analyze the topic through multiple rounds, producing balanced analysis with a final judgment.";
  readonly inputSchema = {
    type: "object",
    properties: {
      topic: {
        type: "string",
        description: "The debate topic or proposition",
      },
      rounds: {
        type: "number",
        description: "Number of debate rounds (1-5). Default: 3",
      },
      perspective: {
        type: "string",
        description: "Optional specific angle for the debate",
      },
    },
    required: ["topic"],
  };

  async execute(
    args: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    const topic = args.topic as string;
    const rounds = (args.rounds as number) || 3;

    this.logger.log(
      `MCP debate request: "${topic}" (rounds: ${rounds}, key: ${context.apiKeyId})`,
    );

    // TODO: Wire to DebateService when full integration is ready
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "accepted",
            topic,
            rounds: Math.min(Math.max(rounds, 1), 5),
            message:
              "Debate request accepted. Full integration with DebateService pending.",
          }),
        },
      ],
    };
  }
}
