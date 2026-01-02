/**
 * AI Engine - MCP Client
 * MCP 客户端实现
 */

import { v4 as uuid } from 'uuid';
import { Logger } from '@nestjs/common';
import {
  IMCPClient,
  MCPServerInfo,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
  MCPResource,
  MCPResourceContent,
  MCPPrompt,
  MCPPromptMessage,
} from '../abstractions/mcp.interface';

/**
 * MCP 请求
 */
interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * MCP 响应
 */
interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * 基础 MCP 客户端
 */
export abstract class BaseMCPClient implements IMCPClient {
  readonly id: string;
  protected readonly logger: Logger;
  protected readonly config: MCPServerConfig;
  protected _connected = false;
  protected _serverInfo?: MCPServerInfo;
  protected requestId = 0;
  protected pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  constructor(config: MCPServerConfig) {
    this.id = config.id;
    this.config = config;
    this.logger = new Logger(`MCPClient:${config.id}`);
  }

  get connected(): boolean {
    return this._connected;
  }

  get serverInfo(): MCPServerInfo | undefined {
    return this._serverInfo;
  }

  /**
   * 连接到服务器
   */
  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }

    try {
      await this.doConnect();
      await this.initialize();
      this._connected = true;
      this.logger.log(`Connected to MCP server: ${this.config.name}`);
    } catch (error) {
      this.logger.error(`Failed to connect: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (!this._connected) {
      return;
    }

    try {
      await this.doDisconnect();
      this._connected = false;
      this._serverInfo = undefined;
      this.logger.log(`Disconnected from MCP server: ${this.config.name}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 初始化（获取服务器信息）
   */
  protected async initialize(): Promise<void> {
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'ai-engine',
        version: '1.0.0',
      },
    });

    this._serverInfo = result as MCPServerInfo;

    // 发送 initialized 通知
    await this.sendNotification('notifications/initialized', {});
  }

  /**
   * 获取可用工具列表
   */
  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();
    const result = await this.sendRequest('tools/list', {});
    return (result as { tools: MCPTool[] }).tools || [];
  }

  /**
   * 调用工具
   */
  async callTool(name: string, arguments_: Record<string, unknown>): Promise<MCPToolResult> {
    this.ensureConnected();
    const result = await this.sendRequest('tools/call', {
      name,
      arguments: arguments_,
    });
    return result as MCPToolResult;
  }

  /**
   * 获取可用资源列表
   */
  async listResources(): Promise<MCPResource[]> {
    this.ensureConnected();
    const result = await this.sendRequest('resources/list', {});
    return (result as { resources: MCPResource[] }).resources || [];
  }

  /**
   * 读取资源
   */
  async readResource(uri: string): Promise<MCPResourceContent> {
    this.ensureConnected();
    const result = await this.sendRequest('resources/read', { uri });
    const contents = (result as { contents: MCPResourceContent[] }).contents;
    return contents?.[0] || { uri, text: '' };
  }

  /**
   * 获取可用提示词列表
   */
  async listPrompts(): Promise<MCPPrompt[]> {
    this.ensureConnected();
    const result = await this.sendRequest('prompts/list', {});
    return (result as { prompts: MCPPrompt[] }).prompts || [];
  }

  /**
   * 获取提示词内容
   */
  async getPrompt(name: string, arguments_?: Record<string, unknown>): Promise<MCPPromptMessage[]> {
    this.ensureConnected();
    const result = await this.sendRequest('prompts/get', {
      name,
      arguments: arguments_,
    });
    return (result as { messages: MCPPromptMessage[] }).messages || [];
  }

  /**
   * 发送请求
   */
  protected async sendRequest(method: string, params?: unknown): Promise<unknown> {
    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = this.config.timeout || 30000;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeout);

      this.pendingRequests.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      this.doSend(request).catch(reject);
    });
  }

  /**
   * 发送通知（无响应）
   */
  protected async sendNotification(method: string, params?: unknown): Promise<void> {
    const notification = {
      jsonrpc: '2.0' as const,
      method,
      params,
    };

    await this.doSend(notification);
  }

  /**
   * 处理响应
   */
  protected handleResponse(response: MCPResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    this.pendingRequests.delete(response.id);

    if (response.error) {
      pending.reject(new Error(response.error.message));
    } else {
      pending.resolve(response.result);
    }
  }

  /**
   * 确保已连接
   */
  protected ensureConnected(): void {
    if (!this._connected) {
      throw new Error('Not connected to MCP server');
    }
  }

  /**
   * 连接实现（子类实现）
   */
  protected abstract doConnect(): Promise<void>;

  /**
   * 断开连接实现（子类实现）
   */
  protected abstract doDisconnect(): Promise<void>;

  /**
   * 发送消息实现（子类实现）
   */
  protected abstract doSend(message: unknown): Promise<void>;
}

/**
 * Stdio MCP 客户端
 */
export class StdioMCPClient extends BaseMCPClient {
  private process: any;
  private buffer = '';

  protected async doConnect(): Promise<void> {
    if (!this.config.command) {
      throw new Error('Command is required for stdio transport');
    }

    // 动态导入 child_process（仅在 Node.js 环境）
    const { spawn } = await import('child_process');

    this.process = spawn(this.config.command, this.config.args || [], {
      env: { ...process.env, ...this.config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // 处理 stdout
    this.process.stdout?.on('data', (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // 处理 stderr（日志）
    this.process.stderr?.on('data', (data: Buffer) => {
      this.logger.debug(`[stderr] ${data.toString()}`);
    });

    // 处理进程退出
    this.process.on('exit', (code: number) => {
      this._connected = false;
      this.logger.warn(`MCP server process exited with code ${code}`);
    });

    this.process.on('error', (error: Error) => {
      this.logger.error(`Process error: ${error.message}`);
    });
  }

  protected async doDisconnect(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  protected async doSend(message: unknown): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Process not started');
    }

    const data = JSON.stringify(message) + '\n';
    this.process.stdin.write(data);
  }

  /**
   * 处理缓冲区中的消息
   */
  private processBuffer(): void {
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response = JSON.parse(line);
        if (response.id !== undefined) {
          this.handleResponse(response);
        }
      } catch (error) {
        this.logger.warn(`Failed to parse message: ${line}`);
      }
    }
  }
}

/**
 * 创建 MCP 客户端
 */
export function createMCPClient(config: MCPServerConfig): IMCPClient {
  switch (config.transport) {
    case 'stdio':
      return new StdioMCPClient(config);

    case 'http':
    case 'websocket':
      throw new Error(`Transport ${config.transport} not yet implemented`);

    default:
      throw new Error(`Unknown transport: ${config.transport}`);
  }
}
