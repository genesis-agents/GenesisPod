/**
 * 代码执行服务
 * 调用各语言执行器执行代码
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  JavaScriptExecutorTool,
  PythonExecutorTool,
} from "../../ai-agents/tools/execution";
import * as ts from "typescript";

export interface ExecuteInput {
  code: string;
  language: "javascript" | "typescript" | "python";
  variables?: Record<string, unknown>;
  timeout?: number;
}

export interface ExecuteResult {
  success: boolean;
  result?: unknown;
  logs?: Array<{
    type: "log" | "info" | "warn" | "error";
    message: string;
  }>;
  stdout?: string;
  stderr?: string;
  error?: string;
  executionTime: number;
  figures?: Array<{
    type: string;
    format: string;
    data: string;
  }>;
}

@Injectable()
export class CodeExecutionService {
  private readonly logger = new Logger(CodeExecutionService.name);
  private readonly jsExecutor: JavaScriptExecutorTool;
  private readonly pythonExecutor: PythonExecutorTool;

  constructor() {
    this.jsExecutor = new JavaScriptExecutorTool();
    this.pythonExecutor = new PythonExecutorTool();
  }

  /**
   * 执行代码
   */
  async execute(input: ExecuteInput): Promise<ExecuteResult> {
    const { code, language, variables, timeout = 30000 } = input;

    this.logger.log(`Executing ${language} code (timeout: ${timeout}ms)`);

    switch (language) {
      case "javascript":
        return this.executeJavaScript(code, variables, timeout);
      case "typescript":
        return this.executeTypeScript(code, variables, timeout);
      case "python":
        return this.executePython(code, variables, timeout);
      default:
        return {
          success: false,
          error: `Unsupported language: ${language}`,
          executionTime: 0,
        };
    }
  }

  /**
   * 执行 JavaScript 代码
   */
  private async executeJavaScript(
    code: string,
    variables?: Record<string, unknown>,
    timeout?: number,
  ): Promise<ExecuteResult> {
    const result = await this.jsExecutor.execute(
      {
        code,
        context: { variables },
        options: { timeout },
      },
      { taskId: "code-exec", timeout },
    );

    // Check if the tool execution itself failed (validation, timeout, etc.)
    if (!result.success) {
      this.logger.warn(`JavaScript execution failed: ${result.error}`);
      return {
        success: false,
        error: result.error || "JavaScript executor failed",
        executionTime: result.duration || 0,
      };
    }

    const data = result.data;
    if (!data) {
      return {
        success: false,
        error: "No data returned from JavaScript executor",
        executionTime: 0,
      };
    }

    return {
      success: data.success,
      result: data.result,
      logs: data.logs,
      error: data.error,
      executionTime: data.executionTime,
    };
  }

  /**
   * 执行 TypeScript 代码
   * 先转译为 JavaScript，然后执行
   */
  private async executeTypeScript(
    code: string,
    variables?: Record<string, unknown>,
    timeout?: number,
  ): Promise<ExecuteResult> {
    try {
      // 转译 TypeScript 为 JavaScript
      const transpiled = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2020,
          strict: false,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: false,
        },
      });

      // 检查转译错误
      if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
        const errors = transpiled.diagnostics
          .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"))
          .join("\n");
        return {
          success: false,
          error: `TypeScript compilation error:\n${errors}`,
          executionTime: 0,
        };
      }

      // 执行转译后的 JavaScript
      return this.executeJavaScript(transpiled.outputText, variables, timeout);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `TypeScript compilation failed: ${message}`,
        executionTime: 0,
      };
    }
  }

  /**
   * 执行 Python 代码
   */
  private async executePython(
    code: string,
    variables?: Record<string, unknown>,
    timeout?: number,
  ): Promise<ExecuteResult> {
    const result = await this.pythonExecutor.execute(
      {
        code,
        context: { variables },
        options: { timeout },
      },
      { taskId: "code-exec", timeout },
    );

    const data = result.data;
    if (!data) {
      return {
        success: false,
        error: "No data returned from Python executor",
        executionTime: 0,
      };
    }

    return {
      success: data.success,
      stdout: data.stdout,
      stderr: data.stderr,
      result: data.returnValue,
      figures: data.figures,
      error: data.stderr || undefined,
      executionTime: data.executionTime,
    };
  }
}
