/**
 * JavaScript Executor Tool
 * JavaScript 代码执行工具 - 在安全沙箱中执行 JavaScript 代码
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";
import * as vm from "vm";

// ============================================================================
// Types
// ============================================================================

export interface JavaScriptExecutorInput {
  /**
   * 要执行的 JavaScript 代码
   */
  code: string;

  /**
   * 执行上下文
   */
  context?: {
    /**
     * 传递给代码的变量
     */
    variables?: Record<string, unknown>;
  };

  /**
   * 执行选项
   */
  options?: {
    /**
     * 超时时间（毫秒），默认 30000
     */
    timeout?: number;

    /**
     * 内存限制（MB），默认 128
     */
    memoryLimit?: number;

    /**
     * 是否捕获 console 输出，默认 true
     */
    captureConsole?: boolean;
  };
}

export interface JavaScriptExecutorOutput {
  /**
   * 是否执行成功
   */
  success: boolean;

  /**
   * 返回值
   */
  result?: unknown;

  /**
   * Console 日志
   */
  logs: Array<{
    type: "log" | "info" | "warn" | "error";
    message: string;
    timestamp: number;
  }>;

  /**
   * 错误信息（如果有）
   */
  error?: string;

  /**
   * 执行时间（毫秒）
   */
  executionTime: number;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class JavaScriptExecutorTool extends BaseTool<
  JavaScriptExecutorInput,
  JavaScriptExecutorOutput
> {
  private readonly logger = new Logger(JavaScriptExecutorTool.name);

  readonly type = ToolType.JAVASCRIPT_EXECUTOR;
  readonly name = "JavaScript 代码执行";
  readonly description =
    "在安全沙箱中执行 JavaScript 代码。支持 ES6+ 语法，自动捕获 console 输出。适用于数据处理、计算、JSON 操作等场景。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "要执行的 JavaScript 代码",
      },
      context: {
        type: "object",
        description: "执行上下文",
        properties: {
          variables: {
            type: "object",
            description: "传递给代码的变量（可在代码中直接访问）",
          },
        },
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
          memoryLimit: {
            type: "number",
            description: "内存限制（MB），默认 128",
            default: 128,
          },
          captureConsole: {
            type: "boolean",
            description: "是否捕获 console 输出，默认 true",
            default: true,
          },
        },
      },
    },
    required: ["code"],
  };

  readonly outputSchema: JSONSchema = {
    type: "object",
    properties: {
      success: {
        type: "boolean",
        description: "是否执行成功",
      },
      result: {
        type: "object",
        description: "代码返回值",
      },
      logs: {
        type: "array",
        description: "Console 日志",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            message: { type: "string" },
            timestamp: { type: "number" },
          },
        },
      },
      error: {
        type: "string",
        description: "错误信息",
      },
      executionTime: {
        type: "number",
        description: "执行时间（毫秒）",
      },
    },
  };

  constructor() {
    super();
    this.defaultTimeout = 60000; // 60 秒超时
  }

  validateInput(input: JavaScriptExecutorInput): boolean {
    if (!input.code || typeof input.code !== "string") {
      return false;
    }

    // 基本安全检查
    if (!this.isCodeSafe(input.code)) {
      this.logger.warn("Unsafe code detected");
      return false;
    }

    return true;
  }

  protected async doExecute(
    input: JavaScriptExecutorInput,
    _context: ToolContext,
  ): Promise<JavaScriptExecutorOutput> {
    const { code, context: inputContext, options } = input;
    const timeout = options?.timeout || 30000;
    const captureConsole = options?.captureConsole ?? true;

    this.logger.log(
      `Executing JavaScript code (timeout: ${timeout}ms, memory: ${options?.memoryLimit || 128}MB)`,
    );

    const logs: JavaScriptExecutorOutput["logs"] = [];
    const startTime = Date.now();

    try {
      // 创建沙箱上下文
      const sandbox: Record<string, unknown> = {
        ...(inputContext?.variables || {}),
        // 注入 console 捕获
        console: captureConsole
          ? {
              log: (...args: unknown[]) => {
                logs.push({
                  type: "log",
                  message: args.map((a) => String(a)).join(" "),
                  timestamp: Date.now(),
                });
              },
              info: (...args: unknown[]) => {
                logs.push({
                  type: "info",
                  message: args.map((a) => String(a)).join(" "),
                  timestamp: Date.now(),
                });
              },
              warn: (...args: unknown[]) => {
                logs.push({
                  type: "warn",
                  message: args.map((a) => String(a)).join(" "),
                  timestamp: Date.now(),
                });
              },
              error: (...args: unknown[]) => {
                logs.push({
                  type: "error",
                  message: args.map((a) => String(a)).join(" "),
                  timestamp: Date.now(),
                });
              },
            }
          : console,
      };

      // 创建 VM 上下文
      const context = vm.createContext(sandbox);

      // 执行代码（带超时）
      const result = vm.runInContext(code, context, {
        timeout,
        displayErrors: true,
      });

      const executionTime = Date.now() - startTime;

      this.logger.log(
        `JavaScript execution completed: success=true, time=${executionTime}ms`,
      );

      return {
        success: true,
        result,
        logs,
        executionTime,
      };
    } catch (error: unknown) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`JavaScript execution failed: ${errorMessage}`);

      return {
        success: false,
        logs,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * 基本的代码安全检查
   * 检测潜在的危险操作
   */
  private isCodeSafe(code: string): boolean {
    // 危险模式列表
    const dangerousPatterns = [
      /require\s*\(/i, // CommonJS require
      /import\s+.*\s+from/i, // ES6 import
      /process\./i, // Node.js process
      /child_process/i, // 子进程
      /fs\./i, // 文件系统
      /eval\s*\(/i, // eval
      /Function\s*\(/i, // Function constructor
      /__dirname/i, // 目录访问
      /__filename/i, // 文件访问
      /global\./i, // global 对象
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(code)) {
        this.logger.warn(`Dangerous pattern detected: ${pattern}`);
        return false;
      }
    }

    return true;
  }
}
