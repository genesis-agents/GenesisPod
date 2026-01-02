/**
 * 代码执行服务
 * 调用各语言执行器执行代码
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  JavaScriptExecutorTool,
  PythonExecutorTool,
} from "../../ai-engine/tools/categories/execution";
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
   * 预处理代码，自动添加主函数调用
   * 检测 main() 或其他入口函数，如果存在但未调用，则自动添加调用
   */
  private prepareCodeForExecution(code: string): string {
    // 移除注释后检测，避免误判注释中的函数定义
    const codeWithoutComments = code
      .replace(/\/\/.*$/gm, "") // 移除单行注释
      .replace(/\/\*[\s\S]*?\*\//g, ""); // 移除多行注释

    // 检测是否定义了 main 函数
    const mainFunctionPatterns = [
      /function\s+main\s*\(/,
      /async\s+function\s+main\s*\(/,
      /const\s+main\s*=\s*(?:async\s*)?\(/,
      /const\s+main\s*=\s*(?:async\s*)?function/,
    ];

    const hasMainFunction = mainFunctionPatterns.some((pattern) =>
      pattern.test(codeWithoutComments),
    );

    // 检测是否已经调用了 main() (不在注释中)
    const hasMainCall = /main\s*\(\s*\)/.test(codeWithoutComments);

    // 如果有 main 函数但没有调用，添加调用
    if (hasMainFunction && !hasMainCall) {
      const isAsync = /async\s+function\s+main|const\s+main\s*=\s*async/.test(
        codeWithoutComments,
      );
      const mainCall = isAsync
        ? "\n\n// Auto-execute main function\nmain().then(result => { if (result !== undefined) console.log('Result:', result); }).catch(err => console.error('Error:', err));"
        : "\n\n// Auto-execute main function\nconst __result__ = main(); if (__result__ !== undefined) console.log('Result:', __result__);";
      this.logger.log("Auto-adding main() call to code");
      return code + mainCall;
    }

    // 如果没有 main 函数，检测是否有其他入口函数需要调用
    const entryFunctions = ["run", "execute", "start", "init"];
    for (const funcName of entryFunctions) {
      const funcPattern = new RegExp(
        `(?:async\\s+)?function\\s+${funcName}\\s*\\(|const\\s+${funcName}\\s*=`,
      );
      const callPattern = new RegExp(`${funcName}\\s*\\(\\s*\\)`);

      if (
        funcPattern.test(codeWithoutComments) &&
        !callPattern.test(codeWithoutComments)
      ) {
        const isAsync = new RegExp(
          `async\\s+function\\s+${funcName}|const\\s+${funcName}\\s*=\\s*async`,
        ).test(codeWithoutComments);
        const funcCall = isAsync
          ? `\n\n// Auto-execute ${funcName} function\n${funcName}().then(result => { if (result !== undefined) console.log('Result:', result); }).catch(err => console.error('Error:', err));`
          : `\n\n// Auto-execute ${funcName} function\nconst __result__ = ${funcName}(); if (__result__ !== undefined) console.log('Result:', __result__);`;
        this.logger.log(`Auto-adding ${funcName}() call to code`);
        return code + funcCall;
      }
    }

    return code;
  }

  /**
   * 执行 JavaScript 代码
   */
  private async executeJavaScript(
    code: string,
    variables?: Record<string, unknown>,
    timeout?: number,
  ): Promise<ExecuteResult> {
    // 预处理代码，自动添加主函数调用
    const preparedCode = this.prepareCodeForExecution(code);

    const toolContext = {
      executionId: `code-exec-${Date.now()}`,
      toolId: this.jsExecutor.id,
      timeout,
      createdAt: new Date(),
    };

    const result = await this.jsExecutor.execute(
      {
        code: preparedCode,
        context: { variables: variables || {} },
        options: { timeout },
      },
      toolContext,
    );

    // Check if the tool execution itself failed (validation, timeout, etc.)
    if (!result.success) {
      const errorMessage =
        typeof result.error === "string"
          ? result.error
          : result.error?.message || "JavaScript executor failed";
      this.logger.warn(`JavaScript execution failed: ${errorMessage}`);
      return {
        success: false,
        error: errorMessage,
        executionTime: result.metadata?.duration || 0,
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
    const toolContext = {
      executionId: `code-exec-${Date.now()}`,
      toolId: this.pythonExecutor.id,
      timeout,
      createdAt: new Date(),
    };

    const result = await this.pythonExecutor.execute(
      {
        code,
        context: { variables: variables || {} },
        options: { timeout },
      },
      toolContext,
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
