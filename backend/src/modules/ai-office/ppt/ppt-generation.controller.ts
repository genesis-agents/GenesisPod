/**
 * PPT Generation Controller
 *
 * PPT 生成 API 控制器
 *
 * 提供：
 * 1. 流式生成 API (SSE)
 * 2. 非流式生成 API
 * 3. 单页编辑 API
 * 4. 导出 API
 */

import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Sse,
  Res,
  UploadedFiles,
  UseInterceptors,
  HttpStatus,
  HttpException,
  Logger,
  MessageEvent,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { Observable, map, catchError, of } from "rxjs";
import { PPTOrchestratorService } from "./ppt-orchestrator.service";
import { SlidePlanningService } from "./slide-planning.service";
import { ContentExtractorService } from "../../ai-image/content-extractor.service";
import {
  PPTGenerationInput,
  PPTDocument,
  PPTStreamEvent,
  PPT_THEMES,
  PPTOutline,
  SlideSpec,
} from "./ppt.types";

// ============================================
// DTOs
// ============================================

class GeneratePPTDto {
  prompt?: string;
  urls?: string[];
  slideCount?: number;
  themeId?: string;
  aspectRatio?: "16:9" | "4:3";
  language?: "zh" | "en" | "auto";
  textModelId?: string;
  imageModelId?: string;
  includeImages?: boolean;
  includeSpeakerNotes?: boolean;
  targetAudience?: string;
  presentationStyle?: "formal" | "casual" | "educational" | "persuasive";
}

class RegenerateSlideDto {
  newPrompt?: string;
  regenerateContent?: boolean;
  regenerateImage?: boolean;
}

class ExportPPTDto {
  format!: "pptx" | "pdf" | "png" | "html";
  includeNotes?: boolean;
  quality?: "standard" | "high";
}

class GenerateOutlineDto {
  prompt!: string;
  urls?: string[];
  slideCount?: number;
  language?: "zh" | "en" | "auto";
  targetAudience?: string;
  presentationStyle?: "formal" | "casual" | "educational" | "persuasive";
}

class PlanSlidesDto {
  outline!: PPTOutline;
  themeId?: string;
}

@Controller("ai-office/ppt")
export class PPTGenerationController {
  private readonly logger = new Logger(PPTGenerationController.name);

  constructor(
    private readonly orchestrator: PPTOrchestratorService,
    private readonly slidePlanning: SlidePlanningService,
    private readonly contentExtractor: ContentExtractorService,
  ) {}

  /**
   * 流式生成 PPT (SSE)
   *
   * 返回 Server-Sent Events 流，实时推送生成进度
   */
  @Sse("generate/stream")
  generatePPTStream(
    @Query("prompt") prompt: string,
    @Query("urls") urls: string,
    @Query("themeId") themeId: string,
    @Query("slideCount") slideCount: string,
    @Query("language") language: string,
    @Query("includeImages") includeImages: string,
    @Query("textModelId") textModelId: string,
    @Query("imageModelId") imageModelId: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `[generatePPTStream] Starting stream generation: ${prompt?.slice(0, 50)}...`,
    );

    const input: PPTGenerationInput = {
      prompt,
      urls: urls ? urls.split(",").map((u) => u.trim()) : undefined,
      themeId,
      slideCount: slideCount ? parseInt(slideCount, 10) : undefined,
      language: language as "zh" | "en" | "auto",
      includeImages: includeImages !== "false",
      textModelId,
      imageModelId,
    };

    return this.orchestrator.generatePPTStream(input).pipe(
      map((event: PPTStreamEvent) => ({
        data: JSON.stringify(event),
        type: event.type,
        id: `${event.type}-${Date.now()}`,
      })),
      catchError((error) => {
        this.logger.error("[generatePPTStream] Error:", error);
        return of({
          data: JSON.stringify({
            type: "error",
            timestamp: new Date().toISOString(),
            error: {
              code: "STREAM_ERROR",
              message: error.message || "Stream generation failed",
            },
          }),
          type: "error",
          id: `error-${Date.now()}`,
        });
      }),
    );
  }

  /**
   * 非流式生成 PPT
   *
   * 等待生成完成后返回完整结果
   */
  @Post("generate")
  @UseInterceptors(FilesInterceptor("files", 10))
  async generatePPT(
    @Body() dto: GeneratePPTDto,
    @UploadedFiles() files: Express.Multer.File[],
  ): Promise<PPTDocument> {
    this.logger.log(
      `[generatePPT] Starting generation: ${dto.prompt?.slice(0, 50)}...`,
    );

    const input: PPTGenerationInput = {
      ...dto,
      files: files?.map((f) => ({
        buffer: f.buffer,
        mimeType: f.mimetype,
        filename: f.originalname,
      })),
    };

    try {
      const result = await this.orchestrator.generatePPT(input);
      this.logger.log(`[generatePPT] Completed: ${result.id}`);
      return result;
    } catch (error: any) {
      this.logger.error("[generatePPT] Error:", error);
      throw new HttpException(
        error.message || "PPT generation failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 生成 PPT 大纲
   *
   * 快速生成 PPT 结构，用户确认后再进行详细规划
   *
   * 返回：
   * - outline: PPTOutline 包含每页的 purpose, title, keyPoints, needsImage, needsChart
   * - suggestedTheme: 推荐的主题 ID
   */
  @Post("outline")
  async generateOutline(
    @Body() dto: GenerateOutlineDto,
  ): Promise<{ outline: PPTOutline; suggestedTheme: string }> {
    this.logger.log(`[generateOutline] ${dto.prompt?.slice(0, 50)}...`);

    try {
      // 1. 提取内容（如果有 URL）
      let content = dto.prompt || "";

      if (dto.urls && dto.urls.length > 0) {
        this.logger.log(
          `[generateOutline] Extracting content from ${dto.urls.length} URLs`,
        );
        for (const url of dto.urls) {
          try {
            const extracted = await this.contentExtractor.extractFromUrl(url);
            if (extracted) {
              content += `\n\n--- Content from ${url} ---\n${extracted}`;
            }
          } catch (err) {
            this.logger.warn(
              `[generateOutline] Failed to extract from ${url}: ${err}`,
            );
          }
        }
      }

      // 2. 调用规划服务生成大纲
      const outline = await this.slidePlanning.generateOutline(content, {
        slideCount: dto.slideCount,
        language: dto.language,
        targetAudience: dto.targetAudience,
        presentationStyle: dto.presentationStyle,
      });

      this.logger.log(
        `[generateOutline] Generated outline with ${outline.slides.length} slides`,
      );

      return {
        outline,
        suggestedTheme: outline.suggestedTheme || "professional",
      };
    } catch (error: any) {
      this.logger.error("[generateOutline] Error:", error);
      throw new HttpException(
        error.message || "Outline generation failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 为大纲生成详细规格
   *
   * 输入已确认的大纲，为每一页生成详细的设计规格：
   * - 布局类型 + 布局理由
   * - 背景决策（纯色/渐变/AI生成）
   * - 图像规格（prompt、位置、风格）
   * - 图表规格（如需要）
   */
  @Post("plan-slides")
  async planSlides(
    @Body() dto: PlanSlidesDto,
  ): Promise<{ slideSpecs: SlideSpec[] }> {
    this.logger.log(
      `[planSlides] Planning ${dto.outline.slides.length} slides with theme: ${dto.themeId}`,
    );

    try {
      // 获取主题
      const theme =
        PPT_THEMES[dto.themeId || "professional"] || PPT_THEMES.professional;

      // 调用规划服务生成详细规格
      const slideSpecs = await this.slidePlanning.planAllSlides(
        dto.outline,
        theme,
      );

      this.logger.log(
        `[planSlides] Generated specs for ${slideSpecs.length} slides`,
      );

      return { slideSpecs };
    } catch (error: any) {
      this.logger.error("[planSlides] Error:", error);
      throw new HttpException(
        error.message || "Slide planning failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * @deprecated 使用 POST /outline 代替
   */
  @Post("generate/outline")
  async generateOutlineOnly(
    @Body() dto: GeneratePPTDto,
  ): Promise<{ outline: PPTOutline; suggestedTheme: string }> {
    return this.generateOutline({
      prompt: dto.prompt || "",
      urls: dto.urls,
      slideCount: dto.slideCount,
      language: dto.language,
      targetAudience: dto.targetAudience,
      presentationStyle: dto.presentationStyle,
    });
  }

  /**
   * 获取 PPT 文档
   */
  @Get(":id")
  async getPPT(@Param("id") id: string): Promise<PPTDocument> {
    try {
      return await this.orchestrator.getPPTDocument(id);
    } catch (error: any) {
      throw new HttpException(
        error.message || "PPT not found",
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * 获取可用主题列表
   */
  @Get("themes/list")
  getThemes(): Array<{
    id: string;
    name: string;
    nameZh: string;
    style: string;
  }> {
    return Object.values(PPT_THEMES).map((theme) => ({
      id: theme.id,
      name: theme.name,
      nameZh: theme.nameZh,
      style: theme.style,
    }));
  }

  /**
   * 重新生成单页
   */
  @Post(":pptId/slides/:slideIndex/regenerate")
  async regenerateSlide(
    @Param("pptId") pptId: string,
    @Param("slideIndex") slideIndex: string,
    @Body() dto: RegenerateSlideDto,
  ): Promise<any> {
    this.logger.log(`[regenerateSlide] PPT: ${pptId}, Slide: ${slideIndex}`);

    try {
      const result = await this.orchestrator.regenerateSlide(
        pptId,
        parseInt(slideIndex, 10),
        {
          newPrompt: dto.newPrompt,
          regenerateContent: dto.regenerateContent ?? true,
          regenerateImage: dto.regenerateImage ?? false,
        },
      );

      return result;
    } catch (error: any) {
      this.logger.error("[regenerateSlide] Error:", error);
      throw new HttpException(
        error.message || "Slide regeneration failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 更新单页内容
   */
  @Put(":pptId/slides/:slideIndex")
  async updateSlide(
    @Param("pptId") pptId: string,
    @Param("slideIndex") slideIndex: string,
    @Body() _content: any,
  ): Promise<any> {
    this.logger.log(`[updateSlide] PPT: ${pptId}, Slide: ${slideIndex}`);

    // TODO: 实现单页内容更新
    throw new HttpException("Not implemented", HttpStatus.NOT_IMPLEMENTED);
  }

  /**
   * 导出 PPT
   */
  @Post(":id/export")
  async exportPPT(
    @Param("id") id: string,
    @Body() dto: ExportPPTDto,
    @Res() _res: Response,
  ): Promise<void> {
    this.logger.log(`[exportPPT] Exporting ${id} as ${dto.format}`);

    // TODO: 实现导出功能
    // 这需要创建专门的导出服务

    throw new HttpException("Not implemented", HttpStatus.NOT_IMPLEMENTED);
  }

  /**
   * 删除 PPT
   */
  @Delete(":id")
  async deletePPT(@Param("id") id: string): Promise<{ success: boolean }> {
    this.logger.log(`[deletePPT] Deleting ${id}`);

    // TODO: 实现删除功能
    throw new HttpException("Not implemented", HttpStatus.NOT_IMPLEMENTED);
  }

  /**
   * 获取用户的 PPT 列表
   */
  @Get()
  async listPPTs(
    @Query("userId") _userId: string,
    @Query("page") _page: string,
    @Query("limit") _limit: string,
  ): Promise<{ items: any[]; total: number }> {
    // TODO: 实现列表功能
    throw new HttpException("Not implemented", HttpStatus.NOT_IMPLEMENTED);
  }
}
