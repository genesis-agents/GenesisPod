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
import { PPTExportService } from "./ppt-export.service";
import { NaturalEditService, EditResult } from "./natural-edit.service";
import {
  PPTVersionService,
  VersionInfo,
  VersionDiff,
  RollbackResult,
} from "./ppt-version.service";
import { ContentExtractorService } from "../../../../common/content-processing";
import {
  PPTGenerationInput,
  PPTDocument,
  PPTStreamEvent,
  PPT_THEMES,
  PPTOutline,
  SlideSpec,
} from "./ppt.types";
import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";

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
  @IsString()
  prompt!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  urls?: string[];

  @IsOptional()
  @IsNumber()
  slideCount?: number;

  @IsOptional()
  @IsIn(["zh", "en", "auto"])
  language?: "zh" | "en" | "auto";

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsIn(["formal", "casual", "educational", "persuasive"])
  presentationStyle?: "formal" | "casual" | "educational" | "persuasive";
}

class PlanSlidesDto {
  @ValidateNested()
  @Type(() => Object) // PPTOutline 是复杂对象
  outline!: PPTOutline;

  @IsOptional()
  @IsString()
  themeId?: string;
}

class NaturalEditDto {
  @IsString()
  instruction!: string; // 用户的自然语言编辑指令
}

@Controller("ai-office/ppt")
export class PPTGenerationController {
  private readonly logger = new Logger(PPTGenerationController.name);

  constructor(
    private readonly orchestrator: PPTOrchestratorService,
    private readonly slidePlanning: SlidePlanningService,
    private readonly pptExport: PPTExportService,
    private readonly naturalEdit: NaturalEditService,
    private readonly versionService: PPTVersionService,
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
    // 详细日志 - 调试 prompt 为空的问题
    this.logger.log(`[generateOutline] Raw DTO object: ${JSON.stringify(dto)}`);
    this.logger.log(
      `[generateOutline] DTO keys: ${Object.keys(dto || {}).join(", ")}`,
    );
    this.logger.log(`[generateOutline] prompt value: "${dto?.prompt}"`);
    this.logger.log(`[generateOutline] slideCount: ${dto?.slideCount}`);

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
   * 自然语言编辑 PPT
   *
   * 使用自然语言指令编辑 PPT，支持：
   * - "把第3页标题改成xxx"
   * - "第5页图表换成饼图"
   * - "删除最后一页"
   * - "重新生成第2页的图片"
   */
  @Post(":id/edit")
  async handleNaturalEdit(
    @Param("id") id: string,
    @Body() dto: NaturalEditDto,
  ): Promise<EditResult> {
    this.logger.log(
      `[handleNaturalEdit] PPT: ${id}, Instruction: "${dto.instruction}"`,
    );

    try {
      // 获取当前文档
      const document = await this.orchestrator.getPPTDocument(id);

      // 执行自然语言编辑
      const result = await this.naturalEdit.executeEdit(
        document,
        dto.instruction,
      );

      if (!result.success) {
        throw new HttpException(
          result.error || "编辑失败",
          HttpStatus.BAD_REQUEST,
        );
      }

      // 保存更新后的文档 - use updatePPTDocument which is public
      if (result.document) {
        await this.orchestrator.updatePPTDocument(result.document);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`[handleNaturalEdit] Error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || "编辑失败",
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
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(`[exportPPT] Exporting ${id} as ${dto.format}`);

    try {
      // 获取 PPT 文档
      const document = await this.orchestrator.getPPTDocument(id);

      if (dto.format === "pptx") {
        // 使用增强的 PPTX 导出服务
        const result = await this.pptExport.exportToPPTX(document);

        res.setHeader("Content-Type", result.mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${encodeURIComponent(result.filename)}"`,
        );
        res.setHeader("Content-Length", result.fileSize);
        res.send(result.buffer);
      } else {
        // 其他格式暂未实现
        throw new HttpException(
          `Export format '${dto.format}' not yet implemented`,
          HttpStatus.NOT_IMPLEMENTED,
        );
      }
    } catch (error: any) {
      this.logger.error(`[exportPPT] Error: ${error.message}`);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        error.message || "Export failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
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

  // ============================================
  // 版本管理 API
  // ============================================

  /**
   * 获取 PPT 版本历史列表
   */
  @Get(":id/versions")
  async getVersionHistory(@Param("id") id: string): Promise<VersionInfo[]> {
    this.logger.log(`[getVersionHistory] PPT: ${id}`);

    try {
      const document = await this.orchestrator.getPPTDocument(id);
      return this.versionService.getVersionList(document);
    } catch (error: any) {
      this.logger.error(`[getVersionHistory] Error: ${error.message}`);
      throw new HttpException(
        error.message || "获取版本历史失败",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 手动保存当前版本
   */
  @Post(":id/versions")
  async saveVersion(
    @Param("id") id: string,
    @Body() dto: { description?: string },
  ): Promise<{ versionId: string; message: string }> {
    this.logger.log(`[saveVersion] PPT: ${id}`);

    try {
      const document = await this.orchestrator.getPPTDocument(id);

      // 创建手动版本
      const version = this.versionService.createVersion(document, {
        type: "manual",
        trigger: "manual_save",
        description: dto.description,
      });

      // 添加到文档
      this.versionService.addVersionToDocument(document, version);

      // 保存文档
      await this.orchestrator.updatePPTDocument(document);

      return {
        versionId: version.id,
        message: "版本保存成功",
      };
    } catch (error: any) {
      this.logger.error(`[saveVersion] Error: ${error.message}`);
      throw new HttpException(
        error.message || "保存版本失败",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 回滚到指定版本
   */
  @Post(":id/versions/:versionId/rollback")
  async rollbackToVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
  ): Promise<RollbackResult> {
    this.logger.log(`[rollbackToVersion] PPT: ${id}, Version: ${versionId}`);

    try {
      const document = await this.orchestrator.getPPTDocument(id);
      const result = this.versionService.rollbackToVersion(document, versionId);

      if (result.success && result.document) {
        await this.orchestrator.updatePPTDocument(result.document);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`[rollbackToVersion] Error: ${error.message}`);
      throw new HttpException(
        error.message || "版本回滚失败",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 比较两个版本
   */
  @Get(":id/versions/compare")
  async compareVersions(
    @Param("id") id: string,
    @Query("from") fromVersionId: string,
    @Query("to") toVersionId: string,
  ): Promise<VersionDiff> {
    this.logger.log(
      `[compareVersions] PPT: ${id}, From: ${fromVersionId}, To: ${toVersionId}`,
    );

    if (!fromVersionId || !toVersionId) {
      throw new HttpException(
        "必须提供 from 和 to 版本ID",
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const document = await this.orchestrator.getPPTDocument(id);
      const diff = this.versionService.compareVersions(
        document,
        fromVersionId,
        toVersionId,
      );

      if (!diff) {
        throw new HttpException(
          "无法比较版本，请检查版本ID是否正确",
          HttpStatus.NOT_FOUND,
        );
      }

      return diff;
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[compareVersions] Error: ${error.message}`);
      throw new HttpException(
        error.message || "版本比较失败",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
