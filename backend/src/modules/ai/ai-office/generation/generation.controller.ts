import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Res,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { GenerationService, GenerationConfig } from "./generation.service";
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsUUID,
  Min,
  Max,
  IsIn,
} from "class-validator";
import { OFFICE_DOCUMENT_TYPES, OfficeDocumentType } from "../documents";

// ============================================================================
// DTOs
// ============================================================================

class GenerateDocumentDto {
  @IsString()
  title: string = "";

  @IsIn(OFFICE_DOCUMENT_TYPES)
  documentType: OfficeDocumentType = "ARTICLE";

  @IsString()
  prompt: string = "";

  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  resourceIds?: string[];

  @IsOptional()
  @IsString()
  style?: string;

  @IsOptional()
  @IsIn(["zh-CN", "en-US"])
  language?: "zh-CN" | "en-US";

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(3)
  detailLevel?: 1 | 2 | 3;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(50)
  slideCount?: number;

  @IsOptional()
  @IsUUID()
  textModelId?: string;

  @IsOptional()
  @IsUUID()
  imageModelId?: string;
}

// ============================================================================
// Controller
// ============================================================================

@Controller("ai-office/generate")
@UseGuards(JwtAuthGuard)
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  /**
   * 生成文档（流式响应）
   * POST /ai-office/generate
   *
   * 使用 Server-Sent Events (SSE) 流式返回生成进度和内容
   */
  @Post()
  async generateDocument(
    @Request() req: any,
    @Body() dto: GenerateDocumentDto,
    @Res() res: Response,
  ) {
    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Nginx 禁用缓冲

    // 发送初始连接确认
    res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

    try {
      const config: GenerationConfig = {
        title: dto.title,
        documentType: dto.documentType,
        prompt: dto.prompt,
        resourceIds: dto.resourceIds,
        style: dto.style,
        language: dto.language ?? "zh-CN",
        detailLevel: dto.detailLevel ?? 2,
        slideCount: dto.slideCount,
        textModelId: dto.textModelId,
        imageModelId: dto.imageModelId,
      };

      // 流式生成
      for await (const chunk of this.generationService.generateDocument(
        req.user.id,
        config,
      )) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);

        // 如果是完成或错误，结束响应
        if (chunk.type === "done" || chunk.type === "error") {
          break;
        }
      }

      // 发送结束标记
      res.write(`data: [DONE]\n\n`);
    } catch (error) {
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: error instanceof Error ? error.message : "生成失败",
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }

  /**
   * 快速生成（非流式，用于简单场景）
   * POST /ai-office/generate/quick
   */
  @Post("quick")
  async quickGenerate(@Request() req: any, @Body() dto: GenerateDocumentDto) {
    const config: GenerationConfig = {
      title: dto.title,
      documentType: dto.documentType,
      prompt: dto.prompt,
      resourceIds: dto.resourceIds,
      style: dto.style,
      language: dto.language ?? "zh-CN",
      detailLevel: dto.detailLevel ?? 2,
      slideCount: dto.slideCount,
      textModelId: dto.textModelId,
      imageModelId: dto.imageModelId,
    };

    let result = null;
    let error = null;

    for await (const chunk of this.generationService.generateDocument(
      req.user.id,
      config,
    )) {
      if (chunk.type === "content") {
        result = chunk.content;
      }
      if (chunk.type === "error") {
        error = chunk.error;
      }
    }

    if (error) {
      return {
        success: false,
        error,
      };
    }

    return {
      success: true,
      content: result,
    };
  }
}
