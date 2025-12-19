/**
 * Stdio Transport
 * 标准输入输出传输层 - 用于本地进程间通信
 *
 * 遵循 MCP 规范，使用 JSON-RPC 2.0 over stdio
 * 每条消息以换行符分隔
 */

import { Logger } from '@nestjs/common';
import { MCPRequest, MCPResponse, MCPErrorCode } from '../mcp-adapter';
import {
  BaseTransport,
  MessageHandler,
  TransportOptions,
  TransportState,
  TransportEventType,
} from './transport.interface';
import * as readline from 'readline';

// ============================================================================
// Types
// ============================================================================

/**
 * JSON-RPC 2.0 消息
 */
interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ============================================================================
// Stdio Transport Implementation
// ============================================================================

/**
 * Stdio 传输实现
 * 通过标准输入输出与 MCP 客户端通信
 *
 * @example
 * ```typescript
 * const transport = new StdioTransport();
 * await transport.start(async (request) => {
 *   return await mcpAdapter.handleRequest(request);
 * });
 * ```
 */
export class StdioTransport extends BaseTransport {
  readonly name = 'stdio';

  private readonly logger = new Logger(StdioTransport.name);
  private rl?: readline.Interface;
  private isProcessing = false;

  /**
   * 启动传输
   */
  async start(handler: MessageHandler, options?: TransportOptions): Promise<void> {
    if (this._state !== TransportState.DISCONNECTED) {
      throw new Error('Transport already started');
    }

    this.handler = handler;
    if (options) {
      this.options = { ...this.options, ...options };
    }

    this.setState(TransportState.CONNECTING);

    try {
      // 配置 stdin
      process.stdin.setEncoding('utf8');

      // 创建行读取器
      this.rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false,
      });

      // 监听输入
      this.rl.on('line', (line) => this.handleLine(line));
      this.rl.on('close', () => this.handleClose());
      this.rl.on('error', (error) => this.handleError(error));

      // 监听进程信号
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());

      this._stats.connectedAt = new Date();
      this.setState(TransportState.CONNECTED);

      this.logger.log('Stdio transport started');

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

    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }

    this.setState(TransportState.DISCONNECTED);

    this.logger.log('Stdio transport stopped');

    this.emit({
      type: TransportEventType.DISCONNECT,
      timestamp: new Date(),
    });
  }

  /**
   * 发送消息
   */
  async send(message: MCPResponse): Promise<void> {
    if (this._state !== TransportState.CONNECTED) {
      throw new Error('Transport not connected');
    }

    const jsonRpcResponse = this.toJsonRpc(message);
    const data = JSON.stringify(jsonRpcResponse) + '\n';

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Write timeout'));
      }, this.options.writeTimeout);

      process.stdout.write(data, 'utf8', (error) => {
        clearTimeout(timeout);

        if (error) {
          this._stats.errorCount++;
          reject(error);
        } else {
          this._stats.messagesSent++;
          this._stats.bytesSent += Buffer.byteLength(data);
          this.updateActivity();
          resolve();
        }
      });
    });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 处理输入行
   */
  private async handleLine(line: string): Promise<void> {
    if (!line.trim()) {
      return;
    }

    this._stats.bytesReceived += Buffer.byteLength(line);
    this.updateActivity();

    // 防止并发处理
    if (this.isProcessing) {
      this.logger.warn('Already processing a message, queuing...');
    }

    this.isProcessing = true;

    try {
      // 解析 JSON-RPC 消息
      const jsonRpcMessage = this.parseJsonRpc(line);
      if (!jsonRpcMessage) {
        return;
      }

      this._stats.messagesReceived++;

      // 转换为 MCP 请求
      const request = this.toMCPRequest(jsonRpcMessage);

      this.emit({
        type: TransportEventType.MESSAGE,
        data: request,
        timestamp: new Date(),
      });

      // 处理请求
      if (this.handler) {
        const response = await this.handler(request);
        await this.send(response);
      }
    } catch (error) {
      this._stats.errorCount++;
      this.logger.error('Error handling message:', error);

      // 发送错误响应
      await this.sendError(null, MCPErrorCode.INTERNAL_ERROR, 'Internal error');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 处理关闭事件
   */
  private handleClose(): void {
    this.logger.log('Stdin closed');
    this.setState(TransportState.DISCONNECTED);

    this.emit({
      type: TransportEventType.DISCONNECT,
      timestamp: new Date(),
    });
  }

  /**
   * 处理错误
   */
  private handleError(error: Error): void {
    this._stats.errorCount++;
    this.logger.error('Stdin error:', error);

    this.emit({
      type: TransportEventType.ERROR,
      error,
      timestamp: new Date(),
    });
  }

  /**
   * 解析 JSON-RPC 消息
   */
  private parseJsonRpc(line: string): JsonRpcMessage | null {
    try {
      const message = JSON.parse(line);

      // 验证 JSON-RPC 2.0 格式
      if (message.jsonrpc !== '2.0') {
        this.sendError(message.id, MCPErrorCode.INVALID_REQUEST, 'Invalid JSON-RPC version');
        return null;
      }

      return message as JsonRpcMessage;
    } catch (error) {
      this.sendError(null, MCPErrorCode.PARSE_ERROR, 'Parse error');
      return null;
    }
  }

  /**
   * 转换为 MCP 请求
   */
  private toMCPRequest(jsonRpc: JsonRpcMessage): MCPRequest {
    return {
      id: jsonRpc.id,
      method: jsonRpc.method || '',
      params: jsonRpc.params,
    };
  }

  /**
   * 转换为 JSON-RPC 响应
   */
  private toJsonRpc(response: MCPResponse): JsonRpcMessage {
    const jsonRpc: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: response.id,
    };

    if (response.error) {
      jsonRpc.error = {
        code: response.error.code,
        message: response.error.message,
        data: response.error.data,
      };
    } else {
      jsonRpc.result = response.result;
    }

    return jsonRpc;
  }

  /**
   * 发送错误响应
   */
  private async sendError(
    id: string | number | null | undefined,
    code: MCPErrorCode,
    message: string,
  ): Promise<void> {
    try {
      await this.send({
        id: id ?? undefined,
        error: { code, message },
      });
    } catch (error) {
      this.logger.error('Failed to send error response:', error);
    }
  }
}
