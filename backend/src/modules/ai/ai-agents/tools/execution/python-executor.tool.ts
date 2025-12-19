/**
 * Python Executor Tool
 * Python 代码执行工具 - 在安全沙箱中执行 Python 代码
 */

import { Injectable, Logger } from "@nestjs/common";
import { BaseTool, JSONSchema, ToolContext } from "../../core";
import { ToolType } from "../../core";
import { spawn } from "child_process";
import { join } from "path";

// 声明 __dirname 类型（CommonJS 环境）
declare const __dirname: string;

// ============================================================================
// Types
// ============================================================================

export interface PythonExecutorInput {
  /**
   * 要执行的 Python 代码
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
     * 内存限制（MB），默认 512
     */
    memoryLimit?: number;
  };
}

export interface PythonExecutorOutput {
  /**
   * 是否执行成功
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
   * 返回值（如果有）
   */
  returnValue?: unknown;

  /**
   * 生成的图表（matplotlib）
   */
  figures?: Array<{
    type: string;
    format: string;
    data: string; // Base64 编码的图片数据
  }>;

  /**
   * 执行时间（毫秒）
   */
  executionTime: number;
}

// ============================================================================
// Tool Implementation
// ============================================================================

@Injectable()
export class PythonExecutorTool extends BaseTool<
  PythonExecutorInput,
  PythonExecutorOutput
> {
  private readonly logger = new Logger(PythonExecutorTool.name);

  readonly type = ToolType.PYTHON_EXECUTOR;
  readonly name = "Python 代码执行";
  readonly description =
    "在安全沙箱中执行 Python 代码。支持数据处理、数学计算、可视化等操作。可自动捕获 matplotlib 图表。";

  readonly inputSchema: JSONSchema = {
    type: "object",
    properties: {
      code: {
        type: "string",
        description: "要执行的 Python 代码",
      },
      context: {
        type: "object",
        description: "执行上下文",
        properties: {
          variables: {
            type: "object",
            description: "传递给代码的变量（会被序列化为 JSON）",
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
            description: "内存限制（MB），默认 512",
            default: 512,
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
      stdout: {
        type: "string",
        description: "标准输出",
      },
      stderr: {
        type: "string",
        description: "标准错误输出",
      },
      returnValue: {
        type: "object",
        description: "返回值（如果有）",
      },
      figures: {
        type: "array",
        description: "生成的图表",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            format: { type: "string" },
            data: { type: "string" },
          },
        },
      },
      executionTime: {
        type: "number",
        description: "执行时间（毫秒）",
      },
    },
  };

  constructor() {
    super();
    this.defaultTimeout = 60000; // 60 秒超时（包含代码执行和沙箱启动时间）
  }

  validateInput(input: PythonExecutorInput): boolean {
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
    input: PythonExecutorInput,
    _context: ToolContext,
  ): Promise<PythonExecutorOutput> {
    const { code, context, options } = input;
    const timeout = options?.timeout || 30000;

    this.logger.log(
      `Executing Python code (timeout: ${timeout}ms, memory: ${options?.memoryLimit || 512}MB)`,
    );

    try {
      // 执行 Python 代码
      const result = await this.executePythonCode(code, context, timeout);

      this.logger.log(
        `Python execution completed: success=${result.success}, time=${result.executionTime}ms`,
      );

      return result;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Python execution failed: ${errorMessage}`);

      // 超时错误需要向上抛出，以便 BaseTool.execute 正确处理
      if (errorMessage.includes("timeout")) {
        throw error;
      }

      return {
        success: false,
        stdout: "",
        stderr: errorMessage,
        executionTime: 0,
      };
    }
  }

  /**
   * 执行 Python 代码
   */
  private async executePythonCode(
    code: string,
    context?: { variables?: Record<string, unknown> },
    timeout = 30000,
  ): Promise<PythonExecutorOutput> {
    // 准备输入数据
    const input = {
      code,
      context: {
        variables: context?.variables || {},
      },
    };

    const inputJson = JSON.stringify(input);

    // 获取 Python sandbox 脚本路径
    const sandboxPath = join(__dirname, "python-sandbox.py");

    // 执行 Python
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";

      // 启动 Python 进程 (Windows 使用 'python', Unix 使用 'python3')
      const pythonCmd = process.platform === "win32" ? "python" : "python3";
      const pythonProcess = spawn(pythonCmd, [sandboxPath]);

      // 设置超时
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        // Windows 不支持 SIGTERM，使用 SIGKILL 或直接 kill
        pythonProcess.kill(
          process.platform === "win32" ? undefined : "SIGTERM",
        );
      }, timeout);

      // 收集标准输出
      pythonProcess.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      // 收集标准错误
      pythonProcess.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // 处理进程结束
      pythonProcess.on("close", (code: number | null) => {
        clearTimeout(timeoutId);

        const executionTime = Date.now() - startTime;

        // 检查是否超时
        if (timedOut) {
          reject(new Error(`Execution timeout after ${timeout}ms`));
          return;
        }

        if (code === 0) {
          // 解析输出 JSON
          try {
            const result = JSON.parse(stdout);
            resolve({
              ...result,
              executionTime: result.executionTime || executionTime,
            });
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            // JSON 解析失败
            resolve({
              success: false,
              stdout,
              stderr: stderr || `Failed to parse output: ${errorMessage}`,
              executionTime,
            });
          }
        } else {
          // 执行失败
          resolve({
            success: false,
            stdout,
            stderr: stderr || `Python process exited with code ${code}`,
            executionTime,
          });
        }
      });

      // 处理错误
      pythonProcess.on("error", (error: Error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      // 发送输入数据
      pythonProcess.stdin.write(inputJson);
      pythonProcess.stdin.end();
    });
  }

  /**
   * 基本的代码安全检查
   * 检测潜在的危险操作
   */
  private isCodeSafe(code: string): boolean {
    // 危险模块列表
    const dangerousModules = [
      "os",
      "subprocess",
      "sys",
      "shutil",
      "socket",
      "urllib",
      "requests",
      "http",
      "ftplib",
      "telnetlib",
      "pickle",
      "marshal",
      "ctypes",
      "__import__",
      "eval",
      "exec",
      "compile",
      "open", // 文件操作
    ];

    // 检查是否导入危险模块
    for (const module of dangerousModules) {
      // 检查 import 语句
      if (new RegExp(`\\bimport\\s+${module}\\b`).test(code)) {
        this.logger.warn(`Dangerous import detected: ${module}`);
        return false;
      }

      // 检查 from ... import 语句
      if (new RegExp(`\\bfrom\\s+${module}\\b`).test(code)) {
        this.logger.warn(`Dangerous import detected: from ${module}`);
        return false;
      }

      // 检查直接使用（针对 eval, exec 等内置函数）
      if (module === "eval" || module === "exec" || module === "compile") {
        if (new RegExp(`\\b${module}\\s*\\(`).test(code)) {
          this.logger.warn(`Dangerous function detected: ${module}`);
          return false;
        }
      }
    }

    // 检查文件操作
    if (/\bopen\s*\(/.test(code)) {
      this.logger.warn("File operation detected: open()");
      return false;
    }

    return true;
  }
}
