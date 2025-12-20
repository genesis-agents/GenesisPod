/**
 * 代码执行控制器
 * 提供代码执行 API 端点
 */

import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { CodeExecutionService } from "./code-execution.service";

interface ExecuteCodeDto {
  code: string;
  language: "javascript" | "typescript" | "python";
  variables?: Record<string, unknown>;
  timeout?: number;
}

@Controller("ai-office/code")
export class CodeExecutionController {
  constructor(private readonly codeExecutionService: CodeExecutionService) {}

  /**
   * 执行代码
   * POST /api/v1/ai-office/code/execute
   */
  @Post("execute")
  async executeCode(@Body() dto: ExecuteCodeDto) {
    const { code, language, variables, timeout } = dto;

    if (!code || typeof code !== "string") {
      throw new HttpException("Code is required", HttpStatus.BAD_REQUEST);
    }

    if (!["javascript", "typescript", "python"].includes(language)) {
      throw new HttpException(
        "Language must be one of: javascript, typescript, python",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.codeExecutionService.execute({
        code,
        language,
        variables,
        timeout,
      });

      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Execution failed";
      throw new HttpException(
        {
          success: false,
          error: message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
