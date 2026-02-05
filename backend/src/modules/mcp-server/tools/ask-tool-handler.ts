/**
 * MCP Server - Ask Tool Handler
 * 将 Raven AI Ask 能力暴露为 MCP 工具
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  IMCPToolHandler,
  MCPRequestContext,
  MCPToolResponse,
} from "../abstractions/mcp-server.interface";

/**
 * AI Ask 工具 - 智能问答
 */
@Injectable()
export class AskToolHandler implements IMCPToolHandler {
  private readonly logger = new Logger(AskToolHandler.name);

  readonly toolName = "raven_ask";
  readonly description =
    "Ask Raven AI a question. Supports multi-model responses with " +
    "web search augmentation and knowledge base integration.";
  readonly inputSchema = {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "The question to ask",
      },
      context: {
        type: "string",
        description: "Optional additional context for the question",
      },
      webSearch: {
        type: "boolean",
        description:
          "Whether to augment with web search results. Default: false",
      },
    },
    required: ["question"],
  };

  async execute(
    args: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<MCPToolResponse> {
    const question = args.question as string;

    this.logger.log(
      `MCP ask request: "${question.slice(0, 50)}..." (key: ${context.apiKeyId})`,
    );

    // TODO: Wire to AiAskService when full integration is ready
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "accepted",
            question,
            webSearch: args.webSearch || false,
            message:
              "Ask request accepted. Full integration with AiAskService pending.",
          }),
        },
      ],
    };
  }
}
