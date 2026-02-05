/**
 * MCP Server - Controller
 * 暴露 MCP 协议端点供外部 AI 工具调用
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  Res,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiHeader } from "@nestjs/swagger";
import { Response } from "express";
import { MCPApiKeyGuard } from "./guards/mcp-api-key.guard";
import { MCPServerService } from "./mcp-server.service";
import { MCPRequestContext } from "./abstractions/mcp-server.interface";

@ApiTags("MCP Server")
@Controller("mcp")
@UseGuards(MCPApiKeyGuard)
export class MCPServerController {
  private readonly logger = new Logger(MCPServerController.name);

  constructor(private readonly mcpServerService: MCPServerService) {}

  /**
   * JSON-RPC 2.0 端点
   * 处理所有 MCP 客户端请求（initialize, tools/list, tools/call 等）
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "MCP JSON-RPC 2.0 endpoint" })
  @ApiHeader({ name: "Mcp-Session-Id", required: false })
  async handleJsonRpc(
    @Body() body: unknown,
    @Headers("mcp-session-id") sessionId: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // Build request context from guard-injected data
    const request = res.req as any;
    const context: MCPRequestContext = {
      apiKeyId: request.mcpApiKeyId || "unknown",
      sessionId,
    };

    const response = await this.mcpServerService.handleRequest(body, context);

    // If initialize response, include session ID in header
    if (!Array.isArray(response) && response.result) {
      const result = response.result as Record<string, unknown>;
      const meta = result._meta as Record<string, unknown> | undefined;
      if (meta?.sessionId) {
        res.setHeader("Mcp-Session-Id", meta.sessionId as string);
      }
    }

    return response;
  }

  /**
   * SSE 流端点
   * 供客户端建立 SSE 连接接收服务器推送
   */
  @Get()
  @ApiOperation({ summary: "MCP SSE stream for server push" })
  @ApiHeader({ name: "Mcp-Session-Id", required: true })
  async sseStream(
    @Headers("mcp-session-id") _sessionId: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial keepalive
    res.write(": keepalive\n\n");

    // Keep connection open - in a full implementation, this would
    // push server-initiated notifications (e.g., tool list changes)
    const keepaliveInterval = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 30000);

    res.on("close", () => {
      clearInterval(keepaliveInterval);
    });
  }

  /**
   * 终止会话
   */
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Terminate MCP session" })
  @ApiHeader({ name: "Mcp-Session-Id", required: true })
  async terminateSession(
    @Headers("mcp-session-id") _sessionId: string | undefined,
  ) {
    // Session cleanup handled internally
    this.logger.log(`Session terminated: ${_sessionId}`);
  }
}
