/**
 * MCP Server - Controller
 *
 * 暴露 MCP 协议端点供外部 AI 工具调用。
 * 支持 Streamable HTTP 传输 (POST + GET SSE + DELETE)。
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
  UseFilters,
  Logger,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiHeader } from "@nestjs/swagger";
import { Response } from "express";
import { MCPApiKeyGuard } from "./guards/mcp-api-key.guard";
import { MCPServerService } from "./mcp-server.service";
import { MCPStreamingBridge } from "./streaming/mcp-streaming-bridge";
import {
  MCPRequestContext,
  JSON_RPC_ERRORS,
} from "./abstractions/mcp-server.interface";
import { Public } from "../../common/decorators/public.decorator";
import { MCPExceptionFilter } from "./filters/mcp-exception.filter";

@Public()
@UseFilters(MCPExceptionFilter)
@ApiTags("MCP Server")
@Controller("mcp")
@UseGuards(MCPApiKeyGuard)
export class MCPServerController {
  private readonly logger = new Logger(MCPServerController.name);

  constructor(
    private readonly mcpServerService: MCPServerService,
    private readonly streamingBridge: MCPStreamingBridge,
  ) {}

  /**
   * JSON-RPC 2.0 端点
   * 使用 @Res() 直接控制响应，绕过 NestJS 拦截器，确保输出裸 JSON-RPC
   */
  @Post()
  @ApiOperation({ summary: "MCP JSON-RPC 2.0 endpoint" })
  @ApiHeader({ name: "Mcp-Session-Id", required: false })
  async handleJsonRpc(
    @Body() body: unknown,
    @Headers("mcp-session-id") sessionId: string | undefined,
    @Res() res: Response,
  ) {
    try {
      const request = res.req as unknown as Record<string, unknown>;
      const context: MCPRequestContext = {
        apiKeyId: (request.mcpApiKeyId as string) || "unknown",
        sessionId,
      };

      const response = await this.mcpServerService.handleRequest(body, context);

      // JSON-RPC notifications — server MUST NOT reply
      if (!response) {
        res.status(HttpStatus.NO_CONTENT).send();
        return;
      }

      // If initialize response, include session ID in header
      if (!Array.isArray(response) && response.result) {
        const result = response.result as Record<string, unknown>;
        const serverInfo = result.serverInfo as Record<string, unknown> | undefined;
        if (serverInfo?.sessionId) {
          res.setHeader("Mcp-Session-Id", serverInfo.sessionId as string);
        }
      }

      res.status(HttpStatus.OK).json(response);
    } catch (error) {
      this.logger.error(`MCP request error: ${(error as Error).message}`);
      res.status(HttpStatus.OK).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: JSON_RPC_ERRORS.INTERNAL_ERROR.code,
          message: "Internal server error",
        },
      });
    }
  }

  /**
   * SSE 流端点
   * 客户端建立 SSE 连接后可接收:
   * - 任务进度事件 (progress)
   * - 任务完成事件 (result)
   * - 错误事件 (error)
   * - Keepalive 心跳
   */
  @Get()
  @ApiOperation({ summary: "MCP SSE stream for server push notifications" })
  @ApiHeader({ name: "Mcp-Session-Id", required: true })
  async sseStream(
    @Headers("mcp-session-id") sessionId: string | undefined,
    @Res() res: Response,
  ) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // 发送初始连接确认
    const initEvent = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/connected",
      params: {
        sessionId: sessionId || "anonymous",
        timestamp: new Date().toISOString(),
      },
    });
    res.write(`event: message\ndata: ${initEvent}\n\n`);

    // 注册到 Streaming Bridge（如果有 sessionId）
    if (sessionId) {
      this.streamingBridge.registerConnection(sessionId, res);
    }

    // Keepalive 每 30 秒
    const keepaliveInterval = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(keepaliveInterval);
      }
    }, 30000);

    // 连接关闭时清理
    res.on("close", () => {
      clearInterval(keepaliveInterval);
      if (sessionId) {
        this.streamingBridge.unregisterConnection(sessionId);
      }
    });
  }

  /**
   * 终止会话
   */
  @Delete()
  @ApiOperation({ summary: "Terminate MCP session" })
  @ApiHeader({ name: "Mcp-Session-Id", required: true })
  async terminateSession(
    @Headers("mcp-session-id") sessionId: string | undefined,
    @Res() res: Response,
  ) {
    if (sessionId) {
      this.mcpServerService.terminateSession(sessionId);
      this.streamingBridge.unregisterConnection(sessionId);
      this.logger.log(`Session terminated: ${sessionId}`);
    }
    res.status(HttpStatus.NO_CONTENT).send();
  }
}
