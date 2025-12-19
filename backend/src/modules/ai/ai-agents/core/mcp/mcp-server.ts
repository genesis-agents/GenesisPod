/**
 * MCP Server
 * MCP 服务器 - 整合适配器和传输层
 *
 * 提供完整的 MCP 服务端实现，支持:
 * - 多种传输方式 (stdio, HTTP-SSE)
 * - 服务器信息和能力发现
 * - 初始化握手
 * - 资源和提示管理
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { MCPAdapter, MCPRequest, MCPResponse, MCPErrorCode } from './mcp-adapter';
import {
  IMCPTransport,
  TransportState,
  TransportEventType,
  StdioTransport,
  HttpSseTransport,
  HttpSseTransportOptions,
} from './transports';
import { Router } from 'express';

// ============================================================================
// Types
// ============================================================================

/**
 * MCP 服务器信息
 */
export interface MCPServerInfo {
  /** 服务器名称 */
  name: string;
  /** 服务器版本 */
  version: string;
  /** 协议版本 */
  protocolVersion: string;
  /** 服务器能力 */
  capabilities: MCPServerCapabilities;
}

/**
 * 服务器能力
 */
export interface MCPServerCapabilities {
  /** 支持的工具 */
  tools?: {
    listChanged?: boolean;
  };
  /** 支持的资源 */
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  /** 支持的提示 */
  prompts?: {
    listChanged?: boolean;
  };
  /** 日志功能 */
  logging?: {};
  /** 实验性功能 */
  experimental?: Record<string, unknown>;
}

/**
 * 客户端信息
 */
export interface MCPClientInfo {
  name: string;
  version: string;
}

/**
 * 初始化请求参数
 */
export interface InitializeParams {
  protocolVersion: string;
  capabilities: Record<string, unknown>;
  clientInfo: MCPClientInfo;
}

/**
 * 服务器选项
 */
export interface MCPServerOptions {
  /** 服务器名称 */
  name?: string;
  /** 服务器版本 */
  version?: string;
  /** 是否启用 stdio 传输 */
  enableStdio?: boolean;
  /** stdio 自动启动 */
  autoStartStdio?: boolean;
  /** HTTP-SSE 选项 */
  httpSseOptions?: HttpSseTransportOptions;
}

// ============================================================================
// MCP Server Implementation
// ============================================================================

/**
 * MCP 服务器
 * 提供完整的 Model Context Protocol 服务端实现
 *
 * @example
 * ```typescript
 * // 使用 stdio 传输
 * const server = new MCPServer(mcpAdapter);
 * await server.startStdio();
 *
 * // 使用 HTTP-SSE 传输
 * const router = server.getHttpRouter();
 * app.use('/mcp', router);
 * await server.startHttp();
 * ```
 */
@Injectable()
export class MCPServer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MCPServer.name);

  /** 服务器信息 */
  private readonly serverInfo: MCPServerInfo;

  /** 传输层实例 */
  private stdioTransport?: StdioTransport;
  private httpSseTransport?: HttpSseTransport;

  /** 已初始化的客户端 */
  private initializedClients: Map<string, MCPClientInfo> = new Map();

  /** 配置选项 */
  private options: Required<MCPServerOptions>;

  constructor(private readonly mcpAdapter: MCPAdapter) {
    this.options = {
      name: 'DeepDive MCP Server',
      version: '1.0.0',
      enableStdio: true,
      autoStartStdio: false,
      httpSseOptions: {},
    };

    this.serverInfo = {
      name: this.options.name,
      version: this.options.version,
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: true },
        resources: { subscribe: true, listChanged: true },
        prompts: { listChanged: true },
        logging: {},
      },
    };
  }

  /**
   * 模块初始化
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('MCP Server initializing...');

    // 创建传输层实例
    if (this.options.enableStdio) {
      this.stdioTransport = new StdioTransport();
    }
    this.httpSseTransport = new HttpSseTransport();

    // 自动启动 stdio
    if (this.options.autoStartStdio && this.stdioTransport) {
      await this.startStdio();
    }

    this.logger.log('MCP Server initialized');
  }

  /**
   * 模块销毁
   */
  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * 配置服务器选项
   */
  configure(options: Partial<MCPServerOptions>): void {
    this.options = { ...this.options, ...options };

    if (options.name) {
      (this.serverInfo as any).name = options.name;
    }
    if (options.version) {
      (this.serverInfo as any).version = options.version;
    }
  }

  /**
   * 启动 stdio 传输
   */
  async startStdio(): Promise<void> {
    if (!this.stdioTransport) {
      this.stdioTransport = new StdioTransport();
    }

    this.setupTransportListeners(this.stdioTransport);
    await this.stdioTransport.start(this.handleRequest.bind(this));
    this.logger.log('Stdio transport started');
  }

  /**
   * 启动 HTTP-SSE 传输
   */
  async startHttp(options?: HttpSseTransportOptions): Promise<void> {
    if (!this.httpSseTransport) {
      this.httpSseTransport = new HttpSseTransport();
    }

    this.setupTransportListeners(this.httpSseTransport);
    await this.httpSseTransport.start(
      this.handleRequest.bind(this),
      options || this.options.httpSseOptions,
    );
    this.logger.log('HTTP-SSE transport started');
  }

  /**
   * 获取 HTTP Router
   * 需要挂载到 Express 应用
   */
  getHttpRouter(): Router {
    if (!this.httpSseTransport) {
      this.httpSseTransport = new HttpSseTransport();
    }
    return this.httpSseTransport.getRouter();
  }

  /**
   * 停止所有传输
   */
  async stop(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    if (this.stdioTransport?.state === TransportState.CONNECTED) {
      stopPromises.push(this.stdioTransport.stop());
    }

    if (this.httpSseTransport?.state === TransportState.CONNECTED) {
      stopPromises.push(this.httpSseTransport.stop());
    }

    await Promise.all(stopPromises);
    this.logger.log('MCP Server stopped');
  }

  /**
   * 获取服务器信息
   */
  getServerInfo(): MCPServerInfo {
    return { ...this.serverInfo };
  }

  /**
   * 获取服务器状态
   */
  getStatus(): {
    stdio: TransportState;
    http: TransportState;
    clients: number;
    stats: {
      stdio: unknown;
      http: unknown;
    };
  } {
    return {
      stdio: this.stdioTransport?.state ?? TransportState.DISCONNECTED,
      http: this.httpSseTransport?.state ?? TransportState.DISCONNECTED,
      clients: this.initializedClients.size,
      stats: {
        stdio: this.stdioTransport?.stats,
        http: this.httpSseTransport?.stats,
      },
    };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * 设置传输层事件监听
   */
  private setupTransportListeners(transport: IMCPTransport): void {
    transport.on(TransportEventType.ERROR, (event) => {
      this.logger.error(`Transport error: ${event.error?.message}`);
    });

    transport.on(TransportEventType.DISCONNECT, () => {
      this.logger.log(`Transport ${transport.name} disconnected`);
    });
  }

  /**
   * 处理 MCP 请求
   */
  private async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const { method, params, id } = request;

    this.logger.debug(`Handling request: ${method}`);

    try {
      // 处理协议级方法
      switch (method) {
        case 'initialize':
          return this.handleInitialize(id, params as InitializeParams);

        case 'initialized':
          return this.handleInitialized(id);

        case 'ping':
          return { id, result: {} };

        case 'shutdown':
          return this.handleShutdown(id);

        // 转发到 MCP 适配器处理
        default:
          return this.mcpAdapter.handleRequest(request);
      }
    } catch (error) {
      this.logger.error(`Error handling request ${method}:`, error);
      return {
        id,
        error: {
          code: MCPErrorCode.INTERNAL_ERROR,
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  /**
   * 处理初始化请求
   */
  private handleInitialize(
    id: string | number | undefined,
    params: InitializeParams,
  ): MCPResponse {
    this.logger.log(
      `Client initializing: ${params.clientInfo.name} v${params.clientInfo.version}`,
    );

    // 验证协议版本
    const supportedVersions = ['2024-11-05', '2024-10-07'];
    if (!supportedVersions.includes(params.protocolVersion)) {
      return {
        id,
        error: {
          code: MCPErrorCode.INVALID_PARAMS,
          message: `Unsupported protocol version: ${params.protocolVersion}. Supported: ${supportedVersions.join(', ')}`,
        },
      };
    }

    // 记录客户端信息
    const clientId = `${params.clientInfo.name}-${Date.now()}`;
    this.initializedClients.set(clientId, params.clientInfo);

    return {
      id,
      result: {
        protocolVersion: this.serverInfo.protocolVersion,
        capabilities: this.serverInfo.capabilities,
        serverInfo: {
          name: this.serverInfo.name,
          version: this.serverInfo.version,
        },
      },
    };
  }

  /**
   * 处理初始化完成通知
   */
  private handleInitialized(id: string | number | undefined): MCPResponse {
    this.logger.log('Client initialization completed');
    return { id, result: {} };
  }

  /**
   * 处理关闭请求
   */
  private handleShutdown(id: string | number | undefined): MCPResponse {
    this.logger.log('Shutdown requested');
    // 清理客户端
    this.initializedClients.clear();
    return { id, result: {} };
  }
}
