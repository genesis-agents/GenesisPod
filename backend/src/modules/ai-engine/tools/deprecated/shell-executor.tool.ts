/**
 * Shell Executor Tool
 * Shell 命令执行工具 - 在沙箱环境中执行 Shell 命令
 *
 * ⚠️ SECURITY WARNING:
 * - This tool executes arbitrary shell commands and poses significant security risks
 * - MUST be used in a properly sandboxed environment (Docker, VM, etc.)
 * - NEVER expose this tool to untrusted users without strict sandboxing
 * - Implement command whitelisting, resource limits, and network isolation
 * - Monitor and log all command executions for security audits
 * - Consider using container-executor.tool.ts for safer code execution
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool } from "../base/base-tool";
import {
  ToolContext,
  JSONSchema,
  ToolCategory,
} from "../abstractions/tool.interface";

import { spawn, ChildProcessWithoutNullStreams } from "child_process";

// ============================================================================
// Types
// ============================================================================

export interface ShellExecutorInput {
  /**
   * 要执行的命令
   */
  command: string;

  /**
   * 命令参数（数组形式，更安全）
   */
  args?: string[];

  /**
   * 工作目录
   */
  cwd?: string;

  /**
   * 环境变量
   */
  env?: Record<string, string>;

  /**
   * 执行选项
   */
  options?: {
    /**
     * 超时时间（毫秒），默认 30000
     */
    timeout?: number;

    /**
     * 使用的 Shell（bash, sh, zsh 等），默认不使用 shell
     * ⚠️ 使用 shell 会增加安全风险（命令注入）
     */
    shell?: string | boolean;

    /**
     * 最大输出缓冲区大小（字节），默认 1MB
     */
    maxBuffer?: number;
  };
}

export interface ShellExecutorOutput {
  /**
   * 是否执行成功（退出码为 0）
   */
  success: boolean;

  /**
   * 标准输出
   */
  stdout: string;

  /**
   * 标准错误输出
   */
  stderr: string;

  /**
   * 退出码
   */
  exitCode: number | null;

  /**
   * 是否被 signal 终止
   */
  signal: string | null;

  /**
   * 执行时间（毫秒）
   */
  executionTime: number;

  /**
   * 执行的完整命令（用于调试）
   */
  command: string;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class ShellExecutorTool extends BaseTool<
  ShellExecutorInput,
  ShellExecutorOutput
> {
  private readonly logger = new Logger(ShellExecutorTool.name);

  readonly id = "shell-executor";
  readonly category: ToolCategory = "execution";
  readonly name = "Shell 命令执行";
  readonly description =
    "在沙箱环境中执行 Shell 命令。支持自定义工作目录、环境变量和超时控制。⚠️ 注意：此工具需要在安全沙箱中运行，禁止执行危险命令。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      command: {
        type: "string",
        description: "要执行的命令（例如：ls, cat, grep）",
      },
      args: {
        type: "array",
        description: "命令参数数组（推荐使用数组形式以避免命令注入）",
        items: {
          type: "string",
        },
      },
      cwd: {
        type: "string",
        description: "工作目录（绝对路径）",
      },
      env: {
        type: "object",
        description: "环境变量（键值对）",
      },
      options: {
        type: "object",
        description: "执行选项",
        properties: {
          timeout: {
            type: "number",
            description: "超时时间（毫秒），默认 30000",
            default: 30000,
          },
          shell: {
            type: "string",
            description:
              "使用的 Shell（bash, sh 等）。留空表示不使用 shell（更安全）",
          },
          maxBuffer: {
            type: "number",
            description: "最大输出缓冲区大小（字节），默认 1048576 (1MB)",
            default: 1048576,
          },
        },
      },
    },
    required: ["command"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "是否执行成功（退出码为 0）",
      },
      stdout: {
        type: "string",
        description: "标准输出",
      },
      stderr: {
        type: "string",
        description: "标准错误输出",
      },
      exitCode: {
        type: "number",
        description: "退出码",
      },
      signal: {
        type: "string",
        description: "终止信号（如果有）",
      },
      executionTime: {
        type: "number",
        description: "执行时间（毫秒）",
      },
      command: {
        type: "string",
        description: "执行的完整命令",
      },
    },
  };

  constructor() {
    super();
    // defaultTimeout set in class property // 60 秒超时
  }

  validateInput(input: ShellExecutorInput) {
    if (!input.command || typeof input.command !== "string") {
      this.logger.warn("Invalid command: must be a non-empty string");
      return false;
    }

    // 基本安全检查
    if (!this.isCommandSafe(input.command, input.args)) {
      this.logger.warn("Unsafe command detected");
      return false;
    }

    // 验证工作目录（如果提供）
    if (input.cwd && typeof input.cwd !== "string") {
      this.logger.warn("Invalid cwd: must be a string");
      return false;
    }

    // 验证参数数组（如果提供）
    if (input.args && !Array.isArray(input.args)) {
      this.logger.warn("Invalid args: must be an array");
      return false;
    }

    return true;
  }

  protected async doExecute(
    input: ShellExecutorInput,
    _context: ToolContext,
  ): Promise<ShellExecutorOutput> {
    const { command, args = [], cwd, env, options } = input;
    const timeout = options?.timeout || 30000;
    const maxBuffer = options?.maxBuffer || 1024 * 1024; // 1MB

    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    this.logger.log(
      `Executing shell command: ${fullCommand} (timeout: ${timeout}ms, cwd: ${cwd || "default"})`,
    );

    // ⚠️ SECURITY WARNING LOG
    this.logger.warn(
      `⚠️ SECURITY: Executing shell command in sandbox. Ensure proper isolation!`,
    );

    try {
      const result = await this.executeShellCommand(command, args, {
        cwd,
        env,
        shell: options?.shell,
        timeout,
        maxBuffer,
      });

      this.logger.log(
        `Shell execution completed: exitCode=${result.exitCode}, time=${result.executionTime}ms`,
      );

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Shell execution failed: ${errorMessage}`);

      return {
        success: false,
        stdout: "",
        stderr: errorMessage,
        exitCode: -1,
        signal: null,
        executionTime: 0,
        command: fullCommand,
      };
    }
  }

  /**
   * 执行 Shell 命令
   */
  private async executeShellCommand(
    command: string,
    args: string[],
    options: {
      cwd?: string;
      env?: Record<string, string>;
      shell?: string | boolean;
      timeout: number;
      maxBuffer: number;
    },
  ): Promise<ShellExecutorOutput> {
    const startTime = Date.now();
    const fullCommand =
      args.length > 0 ? `${command} ${args.join(" ")}` : command;

    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";

      // 准备环境变量
      const processEnv: NodeJS.ProcessEnv = options.env
        ? { ...process.env, ...options.env }
        : process.env;

      // 启动进程
      const childProcess: ChildProcessWithoutNullStreams = spawn(
        command,
        args,
        {
          cwd: options.cwd,
          env: processEnv,
          shell: options.shell,
        },
      );

      // 设置超时
      const timeoutId = setTimeout(() => {
        childProcess.kill("SIGTERM");
        // 给进程一点时间优雅退出
        setTimeout(() => {
          if (!childProcess.killed) {
            childProcess.kill("SIGKILL");
          }
        }, 1000);
      }, options.timeout);

      // 收集标准输出
      childProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      // 收集标准错误
      childProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // 处理进程结束
      childProcess.on("close", (code: number | null, signal: string | null) => {
        clearTimeout(timeoutId);

        const executionTime = Date.now() - startTime;

        resolve({
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          signal,
          executionTime,
          command: fullCommand,
        });
      });

      // 处理错误
      childProcess.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
    });
  }

  /**
   * 基本的命令安全检查
   * ⚠️ 这只是基本检查，真正的安全需要容器隔离、权限控制等
   */
  private isCommandSafe(command: string, args?: string[]): boolean {
    // 危险命令黑名单（示例）
    const dangerousCommands = [
      "rm",
      "rmdir",
      "dd",
      "mkfs",
      "format",
      "fdisk",
      "shutdown",
      "reboot",
      "halt",
      "poweroff",
      "kill",
      "killall",
      "pkill",
      "chmod",
      "chown",
      "chgrp",
      "sudo",
      "su",
      "passwd",
      "useradd",
      "userdel",
      "groupadd",
      "groupdel",
    ];

    // 检查命令本身
    const baseCommand = command.split(" ")[0].split("/").pop() || "";
    if (dangerousCommands.includes(baseCommand)) {
      this.logger.warn(`Dangerous command blocked: ${baseCommand}`);
      return false;
    }

    // 检查参数中的危险操作
    const allArgs = args || [];
    for (const arg of allArgs) {
      // 检查命令注入尝试
      if (
        arg.includes(";") ||
        arg.includes("|") ||
        arg.includes("&") ||
        arg.includes("`") ||
        arg.includes("$") ||
        arg.includes(">") ||
        arg.includes("<")
      ) {
        this.logger.warn(
          `Potential command injection detected in args: ${arg}`,
        );
        // 注意：这个检查可能会误报，实际使用时需要更精细的策略
        // 例如，某些合法命令可能需要使用这些字符
      }
    }

    // 检查绝对路径访问敏感目录
    const sensitivePaths = ["/etc", "/sys", "/proc", "/dev", "/root"];
    const commandString = `${command} ${allArgs.join(" ")}`;
    for (const path of sensitivePaths) {
      if (commandString.includes(path)) {
        this.logger.warn(`Access to sensitive path detected: ${path}`);
        // 注意：这只是警告，某些合法操作可能需要访问这些路径
      }
    }

    return true;
  }
}
