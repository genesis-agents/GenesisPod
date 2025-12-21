/**
 * JavaScript Executor Tool
 * JavaScript 代码执行工具 - 在安全沙箱中执行 JavaScript 代码
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";
import {
  ValidationResult,
  ValidationErrorCode,
} from "../../core/validation/schema-validator";
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

  /**
   * 存储最后一次验证失败的原因
   */
  private lastValidationError: string | null = null;

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
    this.lastValidationError = null;

    if (!input.code || typeof input.code !== "string") {
      this.lastValidationError = "Code must be a non-empty string";
      return false;
    }

    // 基本安全检查
    const safetyResult = this.checkCodeSafety(input.code);
    if (!safetyResult.safe) {
      this.lastValidationError = safetyResult.reason || "Security check failed";
      this.logger.warn(`Unsafe code detected: ${safetyResult.reason}`);
      return false;
    }

    return true;
  }

  /**
   * 获取最后一次验证失败的原因
   */
  getLastValidationError(): string | null {
    return this.lastValidationError;
  }

  /**
   * 重写验证方法以返回更具体的错误信息
   */
  validateInputWithSchema(input: JavaScriptExecutorInput): ValidationResult {
    // 首先进行基本验证
    if (!input.code || typeof input.code !== "string") {
      return {
        valid: false,
        errors: [
          {
            path: "code",
            message: "Code must be a non-empty string",
            code: ValidationErrorCode.REQUIRED,
          },
        ],
      };
    }

    // 安全检查
    const safetyResult = this.checkCodeSafety(input.code);
    if (!safetyResult.safe) {
      this.lastValidationError = safetyResult.reason || "Security check failed";
      return {
        valid: false,
        errors: [
          {
            path: "code",
            message: `Security violation: ${safetyResult.reason}`,
            code: ValidationErrorCode.PATTERN_MISMATCH,
          },
        ],
      };
    }

    return { valid: true, errors: [] };
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
   * 代码安全检查结果
   */
  private checkCodeSafety(code: string): { safe: boolean; reason?: string } {
    // 危险模式列表，每项包含模式和描述
    const dangerousPatterns: Array<{ pattern: RegExp; description: string }> = [
      {
        pattern: /require\s*\(/i,
        description: "CommonJS require() is not allowed",
      },
      {
        pattern: /import\s+.*\s+from/i,
        description: "ES6 import statements are not allowed",
      },
      {
        pattern: /process\./i,
        description: "Access to Node.js process object is not allowed",
      },
      {
        pattern: /child_process/i,
        description: "Child process operations are not allowed",
      },
      {
        pattern: /fs\./i,
        description: "File system operations are not allowed",
      },
      {
        pattern: /eval\s*\(/i,
        description: "eval() is not allowed for security reasons",
      },
      {
        pattern: /Function\s*\(/i,
        description: "Function constructor is not allowed",
      },
      {
        pattern: /__dirname/i,
        description: "__dirname is not available in sandbox",
      },
      {
        pattern: /__filename/i,
        description: "__filename is not available in sandbox",
      },
      {
        pattern: /global\./i,
        description: "Access to global object is not allowed",
      },
    ];

    for (const { pattern, description } of dangerousPatterns) {
      if (pattern.test(code)) {
        this.logger.warn(`Dangerous pattern detected: ${pattern}`);
        return { safe: false, reason: description };
      }
    }

    return { safe: true };
  }
}
