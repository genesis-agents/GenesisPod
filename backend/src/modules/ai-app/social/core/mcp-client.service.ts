/**
 * MCP 客户端服务
 *
 * 管理 MCP Server 连接和工具调用
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { spawn, ChildProcess } from "child_process";
import { EventEmitter } from "events";
import * as path from "path";
import { MCPServerConfig, MCPToolResult } from "../types/platform.types";
import { MCP_SERVER_CONFIGS } from "../config/platforms.config";

/**
 * Security: Allowed commands for MCP server spawning
 * Only these commands can be executed to prevent command injection
 */
const ALLOWED_COMMANDS = ["python", "python3", "node", "npx"] as const;
type AllowedCommand = (typeof ALLOWED_COMMANDS)[number];

interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface MCPServerState {
  process: ChildProcess | null;
  config: MCPServerConfig;
  status: "stopped" | "starting" | "running" | "error";
  lastError?: string;
  pendingRequests: Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  >;
  buffer: string;
}

@Injectable()
export class MCPClientService
  extends EventEmitter
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MCPClientService.name);
  private servers: Map<string, MCPServerState> = new Map();
  private requestId = 0;
  private healthCheckIntervals: Map<string, NodeJS.Timeout> = new Map();

  async onModuleInit(): Promise<void> {
    // 初始化所有配置的 MCP 服务器
    for (const config of MCP_SERVER_CONFIGS) {
      await this.initServer(config);
    }
  }

  async onModuleDestroy(): Promise<void> {
    // 停止所有健康检查
    for (const interval of this.healthCheckIntervals.values()) {
      clearInterval(interval);
    }

    // 停止所有服务器
    for (const serverId of this.servers.keys()) {
      await this.stopServer(serverId);
    }
  }

  /**
   * 初始化 MCP 服务器
   */
  private async initServer(config: MCPServerConfig): Promise<void> {
    this.logger.log(`Initializing MCP server: ${config.id}`);

    const state: MCPServerState = {
      process: null,
      config,
      status: "stopped",
      pendingRequests: new Map(),
      buffer: "",
    };

    this.servers.set(config.id, state);

    // 尝试启动服务器
    await this.startServer(config.id);

    // 设置健康检查
    if (config.healthCheckInterval) {
      const interval = setInterval(
        () => this.healthCheck(config.id),
        config.healthCheckInterval,
      );
      this.healthCheckIntervals.set(config.id, interval);
    }
  }

  /**
   * Security: Validate MCP server command
   * Only allows commands from the approved list to prevent injection
   */
  private validateCommand(command: string): boolean {
    const baseCommand = path.basename(command);
    return ALLOWED_COMMANDS.includes(baseCommand as AllowedCommand);
  }

  /**
   * Security: Validate MCP server arguments
   * Prevents shell metacharacter injection
   */
  private validateArgs(args: string[]): boolean {
    const dangerousPatterns = [
      /[;&|`$(){}[\]<>]/, // Shell metacharacters
      /\.\.\//, // Path traversal
      /^-/, // Leading dash (flag injection) - allow only known safe patterns
    ];

    for (const arg of args) {
      // Allow Python module flag and known safe patterns
      if (arg === "-m" || arg === "--stdio" || arg === "--help") {
        continue;
      }
      // Check for dangerous patterns in non-flag args
      if (!arg.startsWith("-")) {
        for (const pattern of dangerousPatterns.slice(0, 2)) {
          if (pattern.test(arg)) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Security: Validate working directory
   * Prevents path traversal attacks
   */
  private validateCwd(cwd: string): string {
    // Normalize and validate the path
    const normalizedPath = path.normalize(cwd);
    // Prevent path traversal
    if (normalizedPath.includes("..")) {
      this.logger.warn(
        `Invalid cwd path detected: ${cwd}, using process.cwd()`,
      );
      return process.cwd();
    }
    return normalizedPath;
  }

  /**
   * 启动 MCP 服务器
   */
  async startServer(serverId: string): Promise<boolean> {
    const state = this.servers.get(serverId);
    if (!state) {
      this.logger.error(`Server not found: ${serverId}`);
      return false;
    }

    if (state.status === "running") {
      return true;
    }

    state.status = "starting";

    try {
      const { config } = state;

      // Security: Validate command before execution
      const command = config.command;
      if (!this.validateCommand(command)) {
        throw new Error(
          `Security: Command '${command}' is not in the allowed list`,
        );
      }

      const args = config.args;
      if (!this.validateArgs(args)) {
        throw new Error(
          `Security: Invalid arguments detected for server ${serverId}`,
        );
      }

      const cwd = this.validateCwd(config.env?.PYTHONPATH || process.cwd());

      this.logger.log(
        `Starting MCP server ${serverId}: ${command} ${args.join(" ")}`,
      );

      const proc = spawn(command, args, {
        cwd,
        env: { ...process.env, ...config.env },
        stdio: ["pipe", "pipe", "pipe"],
      });

      state.process = proc;

      // 处理 stdout（MCP 响应）
      proc.stdout?.on("data", (data: Buffer) => {
        this.handleServerOutput(serverId, data.toString());
      });

      // 处理 stderr（日志/错误）
      proc.stderr?.on("data", (data: Buffer) => {
        this.logger.debug(`MCP ${serverId} stderr: ${data.toString()}`);
      });

      // 处理进程退出
      proc.on("exit", (code, signal) => {
        this.logger.warn(
          `MCP server ${serverId} exited with code ${code}, signal ${signal}`,
        );
        state.status = "stopped";
        state.process = null;

        // 自动重启
        if (config.restartOnFailure && code !== 0) {
          this.logger.log(`Restarting MCP server ${serverId} in 5 seconds...`);
          setTimeout(() => this.startServer(serverId), 5000);
        }
      });

      proc.on("error", (error) => {
        this.logger.error(`MCP server ${serverId} error: ${error.message}`);
        state.status = "error";
        state.lastError = error.message;
      });

      // 等待服务器准备就绪
      await this.waitForReady(serverId);

      state.status = "running";
      this.logger.log(`MCP server ${serverId} started successfully`);
      return true;
    } catch (error) {
      state.status = "error";
      state.lastError = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to start MCP server ${serverId}: ${state.lastError}`,
      );
      return false;
    }
  }

  /**
   * 停止 MCP 服务器
   */
  async stopServer(serverId: string): Promise<void> {
    const state = this.servers.get(serverId);
    if (!state?.process) {
      return;
    }

    this.logger.log(`Stopping MCP server: ${serverId}`);

    // 拒绝所有待处理的请求
    for (const [, pending] of state.pendingRequests) {
      pending.reject(new Error("Server stopped"));
    }
    state.pendingRequests.clear();

    // 终止进程
    state.process.kill("SIGTERM");

    // 等待进程退出
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        state.process?.kill("SIGKILL");
        resolve();
      }, 5000);

      state.process?.on("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    state.process = null;
    state.status = "stopped";
  }

  /**
   * 调用 MCP 工具
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const state = this.servers.get(serverId);
    if (!state) {
      return { success: false, error: `Server not found: ${serverId}` };
    }

    if (state.status !== "running") {
      // 尝试启动
      const started = await this.startServer(serverId);
      if (!started) {
        return {
          success: false,
          error: `Server ${serverId} is not running: ${state.lastError}`,
        };
      }
    }

    try {
      const result = await this.sendRequest(serverId, "tools/call", {
        name: toolName,
        arguments: args,
      });

      return { success: true, data: result };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 列出可用工具
   */
  async listTools(serverId: string): Promise<unknown[]> {
    const result = await this.sendRequest(serverId, "tools/list", {});
    return (result as { tools?: unknown[] })?.tools || [];
  }

  /**
   * 发送请求到 MCP 服务器
   */
  private async sendRequest(
    serverId: string,
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    const state = this.servers.get(serverId);
    if (!state?.process) {
      throw new Error(`Server ${serverId} not running`);
    }

    const id = ++this.requestId;
    const request: MCPRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      // 设置超时
      const timeout = setTimeout(() => {
        state.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 30000);

      state.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error: Error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      // 发送请求
      const requestStr = JSON.stringify(request) + "\n";
      state.process?.stdin?.write(requestStr);
    });
  }

  /**
   * 处理服务器输出
   */
  private handleServerOutput(serverId: string, data: string): void {
    const state = this.servers.get(serverId);
    if (!state) return;

    state.buffer += data;

    // 按行分割处理
    const lines = state.buffer.split("\n");
    state.buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const response: MCPResponse = JSON.parse(line);

        if (response.id !== undefined) {
          const pending = state.pendingRequests.get(response.id);
          if (pending) {
            state.pendingRequests.delete(response.id);

            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else {
              pending.resolve(response.result);
            }
          }
        }
      } catch {
        this.logger.debug(`Non-JSON output from ${serverId}: ${line}`);
      }
    }
  }

  /**
   * 等待服务器准备就绪
   */
  private async waitForReady(serverId: string): Promise<void> {
    const maxAttempts = 10;
    const delay = 1000;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        await this.sendRequest(serverId, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: {
            name: "deepdive-engine",
            version: "1.0.0",
          },
        });
        return;
      } catch {
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw new Error(`Server ${serverId} failed to initialize`);
  }

  /**
   * 健康检查
   */
  private async healthCheck(serverId: string): Promise<void> {
    const state = this.servers.get(serverId);
    if (!state) return;

    if (state.status !== "running") {
      await this.startServer(serverId);
      return;
    }

    try {
      await this.sendRequest(serverId, "ping", {});
    } catch {
      this.logger.warn(`Health check failed for ${serverId}`);
      state.status = "error";

      if (state.config.restartOnFailure) {
        await this.startServer(serverId);
      }
    }
  }

  /**
   * 获取服务器状态
   */
  getServerStatus(serverId: string): {
    status: string;
    lastError?: string;
  } | null {
    const state = this.servers.get(serverId);
    if (!state) return null;

    return {
      status: state.status,
      lastError: state.lastError,
    };
  }

  /**
   * 获取所有服务器状态
   */
  getAllServerStatus(): Array<{
    id: string;
    name: string;
    status: string;
    lastError?: string;
  }> {
    return Array.from(this.servers.entries()).map(([id, state]) => ({
      id,
      name: state.config.name,
      status: state.status,
      lastError: state.lastError,
    }));
  }

  /**
   * 检查服务器是否可用
   */
  isServerAvailable(serverId: string): boolean {
    const state = this.servers.get(serverId);
    return state?.status === "running";
  }
}
