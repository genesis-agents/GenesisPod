/**
 * Intent Parser Controller
 * 意图解析 API 控制器
 *
 * 提供自然语言意图解析端点
 */

import {
  Controller,
  Post,
  Body,
  Logger,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { IsString } from "class-validator";
import { IntentParserService, ParsedIntent } from "./intent-parser.service";

class ParseIntentDto {
  @IsString()
  input!: string;
}

@Controller("ai-office")
export class IntentParserController {
  private readonly logger = new Logger(IntentParserController.name);

  constructor(private readonly intentParserService: IntentParserService) {}

  /**
   * 解析用户自然语言输入
   * POST /ai-office/parse-intent
   *
   * 从用户输入中提取：
   * - URLs
   * - 视觉风格偏好
   * - 页数要求
   * - 配色主题
   * - 其他参数
   */
  @Post("parse-intent")
  async parseIntent(@Body() dto: ParseIntentDto): Promise<ParsedIntent> {
    this.logger.log(
      `[parseIntent] Parsing input: ${dto.input?.slice(0, 100)}...`,
    );

    if (!dto.input || typeof dto.input !== "string") {
      throw new HttpException(
        "Invalid input: 'input' field is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.intentParserService.parseIntent(dto.input);
      this.logger.log(
        `[parseIntent] Parsed: urls=${result.urls.length}, style=${result.visualStyle}`,
      );
      return result;
    } catch (error: any) {
      this.logger.error(`[parseIntent] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to parse intent",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 使用 AI 增强解析（用于复杂场景）
   * POST /ai-office/parse-intent/ai
   */
  @Post("parse-intent/ai")
  async parseIntentWithAI(@Body() dto: ParseIntentDto): Promise<ParsedIntent> {
    this.logger.log(
      `[parseIntentWithAI] Parsing with AI: ${dto.input?.slice(0, 100)}...`,
    );

    if (!dto.input || typeof dto.input !== "string") {
      throw new HttpException(
        "Invalid input: 'input' field is required",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const result = await this.intentParserService.parseIntentWithAI(
        dto.input,
      );
      return result;
    } catch (error: any) {
      this.logger.error(`[parseIntentWithAI] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to parse intent with AI",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
