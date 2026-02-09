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
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiHeader } from "@nestjs/swagger";
import { Response } from "express";
import { MCPApiKeyGuard } from "./guards/mcp-api-key.guard";
import { MCPServerService } from "./mcp-server.service";
import {
  MCPRequestContext,
  JSON_RPC_ERRORS,
} from "./abstractions/mcp-server.interface";
import { Public } from "../../common/decorators/public.decorator";

@Public()
@ApiTags("MCP Server")
@Controller("mcp")
@UseGuards(MCPApiKeyGuard)
export class MCPServerController {
  private readonly logger = new Logger(MCPServerController.name);

  constructor(private readonly mcpServerService: MCPServerService) {}

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
        const meta = result._meta as Record<string, unknown> | undefined;
        if (meta?.sessionId) {
          res.setHeader("Mcp-Session-Id", meta.sessionId as string);
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
          message: (error as Error).message || "Internal error",
        },
      });
    }
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

    res.write(": keepalive\n\n");

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
  @ApiOperation({ summary: "Terminate MCP session" })
  @ApiHeader({ name: "Mcp-Session-Id", required: true })
  async terminateSession(
    @Headers("mcp-session-id") _sessionId: string | undefined,
    @Res() res: Response,
  ) {
    this.logger.log(`Session terminated: ${_sessionId}`);
    res.status(HttpStatus.NO_CONTENT).send();
  }
}
