/**
 * HTTP-SSE Transport
 * HTTP + Server-Sent Events 传输层 - 用于 Web 客户端通信
 *
 * 遵循 MCP 规范:
 * - POST /mcp - 接收请求，返回响应
 * - GET /mcp/sse - SSE 连接，用于服务端推送
 */

import { Logger } from "@nestjs/common";
import { MCPRequest, MCPResponse, MCPErrorCode } from "../mcp-adapter";
import {
  BaseTransport,
  MessageHandler,
  TransportOptions,
  TransportState,
  TransportEventType,
} from "./transport.interface";
import { Request, Response, Router, json } from "express";
import { randomUUID } from "crypto";

// ============================================================================
// Types
// ============================================================================

/**
 * SSE 客户端
 */
interface SSEClient {
  id: string;
  response: Response;
  connectedAt: Date;
  lastEventAt: Date;
}

/**
 * HTTP-SSE 传输选项
 */
export interface HttpSseTransportOptions extends TransportOptions {
  /** 路径前缀 */
  pathPrefix?: string;
  /** 是否启用 CORS */
  enableCors?: boolean;
  /** 允许的来源 */
  allowedOrigins?: string[];
  /** SSE 心跳间隔 */
  sseHeartbeatInterval?: number;
  /** SSE 重试间隔 (客户端) */
  sseRetryInterval?: number;
}

// ============================================================================
// HTTP-SSE Transport Implementation
// ============================================================================

/**
 * HTTP-SSE 传输实现
 * 通过 HTTP POST 接收请求，通过 SSE 推送事件
 *
 * @example
 * ```typescript
 * const transport = new HttpSseTransport();
 * const router = transport.getRouter();
 * app.use('/mcp', router);
 *
 * await transport.start(async (request) => {
 *   return await mcpAdapter.handleRequest(request);
 * });
 * ```
 */
export class HttpSseTransport extends BaseTransport {
  readonly name = "http-sse";

  private readonly logger = new Logger(HttpSseTransport.name);
  private router: Router;
  private clients: Map<string, SSEClient> = new Map();
  private heartbeatTimer?: NodeJS.Timeout;
  private httpOptions: Required<HttpSseTransportOptions>;

  constructor() {
    super();
    this.router = Router();
    this.httpOptions = {
      ...this.options,
      pathPrefix: "",
      enableCors: true,
      allowedOrigins: ["*"],
      sseHeartbeatInterval: 30000,
      sseRetryInterval: 3000,
    };
  }

  /**
   * 获取 Express Router
   * 需要挂载到 Express 应用
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * 启动传输
   */
  async start(
    handler: MessageHandler,
    options?: HttpSseTransportOptions,
  ): Promise<void> {
    if (this._state !== TransportState.DISCONNECTED) {
      throw new Error("Transport already started");
    }

    this.handler = handler;
    if (options) {
      this.httpOptions = { ...this.httpOptions, ...options };
    }

    this.setState(TransportState.CONNECTING);

    try {
      this.setupRoutes();
      this.startHeartbeat();

      this._stats.connectedAt = new Date();
      this.setState(TransportState.CONNECTED);

      this.logger.log("HTTP-SSE transport started");

      this.emit({
        type: TransportEventType.CONNECT,
        timestamp: new Date(),
      });
    } catch (error) {
      this.setState(TransportState.ERROR);
      throw error;
    }
  }

  /**
   * 停止传输
   */
  async stop(): Promise<void> {
    if (this._state === TransportState.DISCONNECTED) {
      return;
    }

    this.setState(TransportState.CLOSING);

    // 停止心跳
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }

    // 关闭所有 SSE 客户端
    for (const [clientId, client] of this.clients) {
      this.closeSSEClient(clientId, client);
    }
    this.clients.clear();

    this.setState(TransportState.DISCONNECTED);

    this.logger.log("HTTP-SSE transport stopped");

    this.emit({
      type: TransportEventType.DISCONNECT,
      timestamp: new Date(),
    });
  }

  /**
   * 发送消息到所有 SSE 客户端
   */
  async send(message: MCPResponse): Promise<void> {
    if (this._state !== TransportState.CONNECTED) {
      throw new Error("Transport not connected");
    }

    const data = JSON.stringify(message);
    await this.broadcastSSE("message", data);

    this._stats.messagesSent++;
    this._stats.bytesSent += Buffer.byteLength(data);
    this.updateActivity();
  }

  /**
   * 发送消息到特定客户端
   */
  async sendToClient(clientId: string, message: MCPResponse): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const data = JSON.stringify(message);
    this.sendSSEEvent(client, "message", data);

    this._stats.messagesSent++;
    this._stats.bytesSent += Buffer.byteLength(data);
    this.updateActivity();
  }

  /**
   * 获取连接的客户端数量
   */
  getClientCount(): number {
    return this.clients.size;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // CORS 中间件
    if (this.httpOptions.enableCors) {
      this.router.use((req, res, next): void => {
        const origin = req.headers.origin;
        if (
          this.httpOptions.allowedOrigins.includes("*") ||
          (origin && this.httpOptions.allowedOrigins.includes(origin))
        ) {
          res.header("Access-Control-Allow-Origin", origin || "*");
          res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.header(
            "Access-Control-Allow-Headers",
            "Content-Type, Authorization",
          );
        }
        if (req.method === "OPTIONS") {
          res.sendStatus(204);
          return;
        }
        next();
      });
    }

    // JSON 解析
    this.router.use(json());

    // POST /mcp - 处理请求
    this.router.post("/", this.handlePost.bind(this));

    // GET /mcp/sse - SSE 连接
    this.router.get("/sse", this.handleSSE.bind(this));

    // GET /mcp/health - 健康检查
    this.router.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        transport: this.name,
        state: this._state,
        clients: this.clients.size,
        stats: this.stats,
      });
    });
  }

  /**
   * 处理 POST 请求
   */
  private async handlePost(req: Request, res: Response): Promise<void> {
    this._stats.messagesReceived++;
    this._stats.bytesReceived += Buffer.byteLength(JSON.stringify(req.body));
    this.updateActivity();

    try {
      const request: MCPRequest = {
        id: req.body.id,
        method: req.body.method,
        params: req.body.params,
      };

      this.emit({
        type: TransportEventType.MESSAGE,
        data: request,
        timestamp: new Date(),
      });

      if (!this.handler) {
        res.status(500).json({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: MCPErrorCode.INTERNAL_ERROR,
            message: "Handler not configured",
          },
        });
        return;
      }

      const response = await this.handler(request);

      const jsonRpcResponse = {
        jsonrpc: "2.0",
        id: response.id,
        ...(response.error
          ? { error: response.error }
          : { result: response.result }),
      };

      res.json(jsonRpcResponse);

      this._stats.messagesSent++;
      this._stats.bytesSent += Buffer.byteLength(
        JSON.stringify(jsonRpcResponse),
      );
    } catch (error) {
      this._stats.errorCount++;
      this.logger.error("Error handling POST:", error);

      res.status(500).json({
        jsonrpc: "2.0",
        id: req.body?.id,
        error: {
          code: MCPErrorCode.INTERNAL_ERROR,
          message: "Internal error",
        },
      });
    }
  }

  /**
   * 处理 SSE 连接
   */
  private handleSSE(req: Request, res: Response): void {
    const clientId = randomUUID();

    // 设置 SSE 响应头
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // 禁用 nginx 缓冲
    });

    // 发送重试间隔
    res.write(`retry: ${this.httpOptions.sseRetryInterval}\n\n`);

    // 发送连接成功事件
    res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

    // 注册客户端
    const client: SSEClient = {
      id: clientId,
      response: res,
      connectedAt: new Date(),
      lastEventAt: new Date(),
    };
    this.clients.set(clientId, client);

    this.logger.log(`SSE client connected: ${clientId}`);

    // 处理客户端断开
    req.on("close", () => {
      this.clients.delete(clientId);
      this.logger.log(`SSE client disconnected: ${clientId}`);
    });
  }

  /**
   * 发送 SSE 事件到单个客户端
   */
  private sendSSEEvent(client: SSEClient, event: string, data: string): void {
    try {
      client.response.write(`event: ${event}\ndata: ${data}\n\n`);
      client.lastEventAt = new Date();
    } catch (error) {
      this.logger.error(`Error sending SSE to ${client.id}:`, error);
      this.closeSSEClient(client.id, client);
    }
  }

  /**
   * 广播 SSE 事件到所有客户端
   */
  private async broadcastSSE(event: string, data: string): Promise<void> {
    for (const [clientId, client] of this.clients) {
      try {
        this.sendSSEEvent(client, event, data);
      } catch (error) {
        this.logger.error(`Error broadcasting to ${clientId}:`, error);
        this.closeSSEClient(clientId, client);
      }
    }
  }

  /**
   * 关闭 SSE 客户端
   */
  private closeSSEClient(clientId: string, client: SSEClient): void {
    try {
      client.response.end();
    } catch {
      // 忽略关闭错误
    }
    this.clients.delete(clientId);
  }

  /**
   * 启动心跳
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = new Date();
      const heartbeatData = JSON.stringify({ timestamp: now.toISOString() });

      for (const [clientId, client] of this.clients) {
        try {
          this.sendSSEEvent(client, "heartbeat", heartbeatData);
        } catch {
          this.closeSSEClient(clientId, client);
        }
      }
    }, this.httpOptions.sseHeartbeatInterval);
  }
}
