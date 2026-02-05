/**
 * MCP Server - Core Service
 * 处理 JSON-RPC 2.0 请求路由和 MCP 协议逻辑
 */

import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "crypto";
import {
  JsonRpcRequest,
  JsonRpcResponse,
  ExposedTool,
  IMCPToolHandler,
  MCPRequestContext,
  JSON_RPC_ERRORS,
} from "./abstractions/mcp-server.interface";
import { GuardrailsPipelineService } from "../ai-engine/guardrails/guardrails-pipeline.service";
import { LruMap } from "@/common/utils/lru-map";

@Injectable()
export class MCPServerService implements OnModuleInit {
  private readonly logger = new Logger(MCPServerService.name);
  private readonly guardrailsEnabled: boolean;
  private readonly guardrailsFailClosed: boolean;
  private readonly toolHandlers = new Map<string, IMCPToolHandler>();
  private readonly sessions = new LruMap<
    string,
    { clientInfo?: { name: string; version: string }; createdAt: Date }
  >(1000);

  constructor(
    @Optional() private readonly guardrailsPipeline?: GuardrailsPipelineService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.guardrailsEnabled =
      this.configService?.get<string>("GUARDRAILS_ENABLED") === "true";
    this.guardrailsFailClosed =
      this.configService?.get<string>("GUARDRAILS_FAIL_CLOSED") === "true";
    if (this.guardrailsEnabled && this.guardrailsPipeline) {
      this.logger.log("MCP Server guardrails enabled");
    }
  }

  onModuleInit() {
    this.logger.log(
      `MCP Server initialized with ${this.toolHandlers.size} tools`,
    );
  }

  /**
   * 注册工具处理器
   */
  registerToolHandler(handler: IMCPToolHandler): void {
    this.toolHandlers.set(handler.toolName, handler);
    this.logger.log(`Registered MCP tool: ${handler.toolName}`);
  }

  /**
   * 处理 JSON-RPC 请求
   */
  async handleRequest(
    body: unknown,
    context: MCPRequestContext,
  ): Promise<JsonRpcResponse | JsonRpcResponse[]> {
    // Handle batch requests
    if (Array.isArray(body)) {
      const responses = await Promise.all(
        body.map((req) => this.processSingleRequest(req, context)),
      );
      return responses.filter((r): r is JsonRpcResponse => r !== null);
    }

    const response = await this.processSingleRequest(body, context);
    return response!;
  }

  private async processSingleRequest(
    body: unknown,
    context: MCPRequestContext,
  ): Promise<JsonRpcResponse | null> {
    // Validate JSON-RPC format
    if (!body || typeof body !== "object") {
      return this.errorResponse(null, JSON_RPC_ERRORS.INVALID_REQUEST);
    }

    const request = body as JsonRpcRequest;

    if (request.jsonrpc !== "2.0" || !request.method) {
      return this.errorResponse(
        request.id ?? null,
        JSON_RPC_ERRORS.INVALID_REQUEST,
      );
    }

    // Notification (no id) - process but don't respond
    const isNotification = request.id === undefined;

    try {
      const result = await this.dispatch(request, context);
      if (isNotification) return null;
      return { jsonrpc: "2.0", id: request.id, result };
    } catch (error) {
      if (isNotification) return null;
      return this.errorResponse(request.id!, {
        code: (error as any).code || JSON_RPC_ERRORS.INTERNAL_ERROR.code,
        message: (error as Error).message,
      });
    }
  }

  private async dispatch(
    request: JsonRpcRequest,
    context: MCPRequestContext,
  ): Promise<unknown> {
    switch (request.method) {
      case "initialize":
        return this.handleInitialize(request.params, context);

      case "tools/list":
        return this.handleToolsList();

      case "tools/call":
        return this.handleToolsCall(request.params, context);

      case "notifications/initialized":
        return undefined;

      case "ping":
        return {};

      default:
        const error = new Error(`Method not found: ${request.method}`);
        (error as any).code = JSON_RPC_ERRORS.METHOD_NOT_FOUND.code;
        throw error;
    }
  }

  private handleInitialize(
    params: Record<string, unknown> | undefined,
    context: MCPRequestContext,
  ): Record<string, unknown> {
    const sessionId = this.generateSessionId();
    this.sessions.set(sessionId, {
      clientInfo: params?.clientInfo as
        | { name: string; version: string }
        | undefined,
      createdAt: new Date(),
    });
    context.sessionId = sessionId;

    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: "raven-ai-engine",
        version: "1.0.0",
      },
      _meta: { sessionId },
    };
  }

  private handleToolsList(): { tools: ExposedTool[] } {
    const tools: ExposedTool[] = [];
    for (const handler of this.toolHandlers.values()) {
      tools.push({
        name: handler.toolName,
        description: handler.description,
        inputSchema: handler.inputSchema,
      });
    }
    return { tools };
  }

  private async handleToolsCall(
    params: Record<string, unknown> | undefined,
    context: MCPRequestContext,
  ): Promise<unknown> {
    if (!params?.name || typeof params.name !== "string") {
      const error = new Error("Missing required parameter: name");
      (error as any).code = JSON_RPC_ERRORS.INVALID_PARAMS.code;
      throw error;
    }

    const handler = this.toolHandlers.get(params.name);
    if (!handler) {
      const error = new Error(`Unknown tool: ${params.name}`);
      (error as any).code = JSON_RPC_ERRORS.METHOD_NOT_FOUND.code;
      throw error;
    }

    const args = (params.arguments as Record<string, unknown>) || {};

    // Input validation with guardrails
    if (this.guardrailsEnabled && this.guardrailsPipeline) {
      try {
        const inputCheck = await this.guardrailsPipeline.processInput({
          content: JSON.stringify(args),
          context: { toolName: params.name, sessionId: context.sessionId },
        });

        if (!inputCheck.passed) {
          this.logger.warn(
            `MCP tool call blocked by input guardrail: ${inputCheck.blockedBy}`,
          );
          return {
            content: [
              {
                type: "text",
                text: "Request blocked by security policy",
              },
            ],
            isError: true,
          };
        }
      } catch (guardrailError) {
        this.logger.error(
          `MCP input guardrail execution error: ${(guardrailError as Error).message}`,
        );
        if (this.guardrailsFailClosed) {
          return {
            content: [
              { type: "text", text: "Security validation unavailable" },
            ],
            isError: true,
          };
        }
      }
    }

    try {
      const result = await handler.execute(args, context);

      // Output validation with guardrails
      if (this.guardrailsEnabled && this.guardrailsPipeline) {
        try {
          const outputCheck = await this.guardrailsPipeline.processOutput({
            content: JSON.stringify(result),
            context: { toolName: params.name, sessionId: context.sessionId },
          });

          if (!outputCheck.passed) {
            this.logger.warn(
              `MCP tool output blocked by guardrail: ${outputCheck.blockedBy}`,
            );
            return {
              content: [
                {
                  type: "text",
                  text: "Request blocked by security policy",
                },
              ],
              isError: true,
            };
          }
        } catch (guardrailError) {
          this.logger.error(
            `MCP output guardrail execution error: ${(guardrailError as Error).message}`,
          );
          if (this.guardrailsFailClosed) {
            return {
              content: [
                { type: "text", text: "Security validation unavailable" },
              ],
              isError: true,
            };
          }
        }
      }

      return result;
    } catch (error) {
      this.logger.error(
        `Tool ${params.name} failed: ${(error as Error).message}`,
      );
      return {
        content: [{ type: "text", text: `Error: ${(error as Error).message}` }],
        isError: true,
      };
    }
  }

  private errorResponse(
    id: string | number | null,
    error: { code: number; message: string },
  ): JsonRpcResponse {
    return {
      jsonrpc: "2.0",
      id: id ?? undefined,
      error,
    };
  }

  private generateSessionId(): string {
    return `mcp-${randomBytes(16).toString("hex")}`;
  }

  /**
   * 获取服务器状态（管理端使用）
   */
  getStatus(): {
    toolCount: number;
    tools: string[];
    activeSessions: number;
  } {
    return {
      toolCount: this.toolHandlers.size,
      tools: Array.from(this.toolHandlers.keys()),
      activeSessions: this.sessions.size,
    };
  }
}
