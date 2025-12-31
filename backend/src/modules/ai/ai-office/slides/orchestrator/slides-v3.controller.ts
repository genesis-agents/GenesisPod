/**
 * Slides Engine v3.0 - Controller
 *
 * v3 版本 API 控制器
 *
 * API 端点：
 * - POST /ai-office/slides-v3/generate (SSE) - 流式生成
 * - GET /ai-office/slides-v3/sessions/:sessionId/checkpoints - 获取检查点列表
 * - POST /ai-office/slides-v3/restore/:checkpointId - 恢复检查点
 * - POST /ai-office/slides-v3/sessions/:sessionId/rerender/:pageNumber - 重新渲染页面
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Sse,
  Res,
  HttpStatus,
  HttpException,
  Logger,
  MessageEvent,
} from "@nestjs/common";
import { Response } from "express";
import { Observable, map, catchError, of } from "rxjs";
import {
  SlidesOrchestratorV3Service,
  GenerateInput,
} from "./slides-orchestrator-v3.service";
import { CheckpointService } from "../checkpoint/checkpoint.service";
import { SlidesExportService } from "../rendering/slides-export.service";
import { GlobalStyles } from "../checkpoint/checkpoint.types";
import { SlidesTeamAgent } from "./slides-team.agent";
import {
  IsString,
  IsOptional,
  IsNumber,
  IsIn,
  Min,
  Max,
} from "class-validator";

// ============================================
// DTOs
// ============================================

class GenerateV3Dto {
  @IsString()
  title!: string;

  @IsString()
  sourceText!: string;

  @IsOptional()
  @IsString()
  userRequirement?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(30)
  targetPages?: number;

  @IsOptional()
  @IsIn(["dark", "light", "custom"])
  stylePreference?: "dark" | "light" | "custom";

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  customStyles?: Partial<GlobalStyles>;

  @IsOptional()
  @IsString()
  themeId?: string;
}

class RerenderPageDto {
  @IsOptional()
  @IsString()
  sourceText?: string;
}

/**
 * Team 协作生成 DTO
 */
class GenerateTeamDto {
  @IsString()
  sourceText!: string;

  @IsOptional()
  @IsString()
  userRequirement?: string;

  @IsOptional()
  @IsNumber()
  @Min(3)
  @Max(30)
  targetPages?: number;

  @IsOptional()
  @IsIn(["dark", "light", "custom"])
  stylePreference?: "dark" | "light" | "custom";

  @IsOptional()
  @IsString()
  targetAudience?: string;

  @IsOptional()
  @IsString()
  themeId?: string;
}

class ExportV3Dto {
  @IsIn(["pptx", "pdf", "png", "html"])
  format!: "pptx" | "pdf" | "png" | "html";

  @IsOptional()
  includeNotes?: boolean;

  @IsOptional()
  @IsIn(["standard", "high"])
  quality?: "standard" | "high";
}

class UpdateSessionDto {
  @IsString()
  title!: string;
}

@Controller("ai-office/slides-v3")
export class SlidesV3Controller {
  private readonly logger = new Logger(SlidesV3Controller.name);

  constructor(
    private readonly orchestrator: SlidesOrchestratorV3Service,
    private readonly checkpointService: CheckpointService,
    private readonly exportService: SlidesExportService,
    private readonly teamAgent: SlidesTeamAgent,
  ) {}

  // ============================================
  // Team 协作生成 API
  // ============================================

  /**
   * Team 协作生成幻灯片 (SSE)
   *
   * 展示完整的 5 Agent 协作过程：
   * - Leader: 任务分配和审核
   * - Analyst: 内容分析
   * - Strategist: 结构规划
   * - Writer: 内容生成（3 个并发）
   * - Reviewer: 质量审核
   */
  @Post("team/generate")
  @Sse()
  generateTeam(
    @Body() dto: GenerateTeamDto,
    @Query("userId") userId?: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `[generateTeam] Starting Team generation with ${dto.sourceText?.length || 0} chars`,
    );

    // 创建会话
    const sessionId = `team-${Date.now()}`;

    return this.teamAgent
      .executeStream(
        {
          sourceText: dto.sourceText,
          userRequirement: dto.userRequirement,
          targetPages: dto.targetPages,
          stylePreference: dto.stylePreference,
          targetAudience: dto.targetAudience,
          themeId: dto.themeId,
        },
        {
          sessionId,
          userId: userId || "anonymous",
        },
      )
      .pipe(
        map((event) => {
          this.logger.debug(`[generateTeam] SSE event: ${event.type}`);
          return {
            data: JSON.stringify(event),
          };
        }),
        catchError((error) => {
          this.logger.error("[generateTeam] Error:", error);
          return of({
            data: JSON.stringify({
              type: "execution:failed",
              timestamp: new Date().toISOString(),
              executionId: sessionId,
              data: {
                error: error.message || "Team generation failed",
                phase: "failed",
                recoverable: false,
              },
            }),
          });
        }),
      );
  }

  /**
   * 获取 Team Agent 能力描述
   */
  @Get("team/capabilities")
  getTeamCapabilities(): object {
    return {
      success: true,
      agent: {
        name: this.teamAgent.name,
        description: this.teamAgent.description,
        team: this.teamAgent.team,
        capabilities: this.teamAgent.getCapabilities(),
      },
    };
  }

  // ============================================
  // 原有 API
  // ============================================

  /**
   * 流式生成幻灯片 (SSE)
   *
   * 返回 Server-Sent Events 流，实时推送生成进度
   */
  @Sse("generate")
  generateSlides(
    @Query("userId") userId: string,
    @Query("title") title: string,
    @Query("sourceText") sourceText: string,
    @Query("userRequirement") userRequirement?: string,
    @Query("targetPages") targetPages?: string,
    @Query("stylePreference") stylePreference?: string,
    @Query("targetAudience") targetAudience?: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `[generateSlides] Starting v3 generation: ${title?.slice(0, 50)}...`,
    );

    const input: GenerateInput = {
      userId: userId || "anonymous",
      title: title || "Untitled Presentation",
      sourceText: sourceText || "",
      userRequirement,
      targetPages: targetPages ? parseInt(targetPages, 10) : undefined,
      stylePreference: stylePreference as "dark" | "light" | "custom",
      targetAudience,
    };

    return this.orchestrator.generateSlides(input).pipe(
      map((event) => {
        this.logger.debug(`[generateSlides] Sending SSE event: ${event.type}`);
        // 不设置 type 字段，让所有事件都通过 EventSource.onmessage 处理
        // 如果设置了 type，浏览器需要用 addEventListener(type, handler) 而不是 onmessage
        return {
          data: JSON.stringify(event),
        };
      }),
      catchError((error) => {
        this.logger.error("[generateSlides] Error:", error);
        return of({
          data: JSON.stringify({
            type: "error",
            timestamp: new Date().toISOString(),
            error: error.message || "Generation failed",
          }),
        });
      }),
    );
  }

  /**
   * POST 方式生成幻灯片 (SSE)
   *
   * 支持 POST body 传递更复杂的参数
   */
  @Post("generate")
  @Sse()
  generateSlidesPost(@Body() dto: GenerateV3Dto): Observable<MessageEvent> {
    this.logger.log(
      `[generateSlidesPost] Starting v3 generation: ${dto.title?.slice(0, 50)}...`,
    );

    const input: GenerateInput = {
      userId: "user", // TODO: 从认证上下文获取
      title: dto.title,
      sourceText: dto.sourceText,
      userRequirement: dto.userRequirement,
      targetPages: dto.targetPages,
      stylePreference: dto.stylePreference,
      targetAudience: dto.targetAudience,
      customStyles: dto.customStyles,
      themeId: dto.themeId,
    };

    return this.orchestrator.generateSlides(input).pipe(
      map((event) => {
        this.logger.debug(
          `[generateSlidesPost] Sending SSE event: ${event.type}`,
        );
        return {
          data: JSON.stringify(event),
        };
      }),
      catchError((error) => {
        this.logger.error("[generateSlidesPost] Error:", error);
        return of({
          data: JSON.stringify({
            type: "error",
            timestamp: new Date().toISOString(),
            error: error.message || "Generation failed",
          }),
        });
      }),
    );
  }

  /**
   * 获取会话的检查点列表
   */
  @Get("sessions/:sessionId/checkpoints")
  async getCheckpoints(
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
  ): Promise<any> {
    this.logger.log(`[getCheckpoints] Session: ${sessionId}`);

    try {
      let checkpoints = await this.checkpointService.list({
        sessionId,
      });

      // Apply limit if specified
      const limitNum = limit ? parseInt(limit, 10) : 50;
      if (checkpoints.length > limitNum) {
        checkpoints = checkpoints.slice(0, limitNum);
      }

      return {
        success: true,
        checkpoints,
      };
    } catch (error: any) {
      this.logger.error(`[getCheckpoints] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to get checkpoints",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取单个检查点详情
   */
  @Get("checkpoints/:checkpointId")
  async getCheckpoint(
    @Param("checkpointId") checkpointId: string,
  ): Promise<any> {
    this.logger.log(`[getCheckpoint] Checkpoint: ${checkpointId}`);

    try {
      const result =
        await this.orchestrator.restoreFromCheckpoint(checkpointId);

      return {
        success: true,
        sessionId: result.sessionId,
        checkpointId: result.checkpointId,
        state: result.state,
      };
    } catch (error: any) {
      this.logger.error(`[getCheckpoint] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Checkpoint not found",
        HttpStatus.NOT_FOUND,
      );
    }
  }

  /**
   * 恢复到指定检查点
   */
  @Post("restore/:checkpointId")
  async restoreCheckpoint(
    @Param("checkpointId") checkpointId: string,
  ): Promise<any> {
    this.logger.log(`[restoreCheckpoint] Restoring to: ${checkpointId}`);

    try {
      const result =
        await this.orchestrator.restoreFromCheckpoint(checkpointId);

      return {
        success: true,
        message: "Checkpoint restored successfully",
        sessionId: result.sessionId,
        checkpointId: result.checkpointId,
        state: {
          pagesCount: result.state.pages?.length || 0,
          hasOutline: !!result.state.outlinePlan,
          hasTaskDecomposition: !!result.state.taskDecomposition,
        },
      };
    } catch (error: any) {
      this.logger.error(`[restoreCheckpoint] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to restore checkpoint",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 重新渲染指定页面
   */
  @Post("sessions/:sessionId/rerender/:pageNumber")
  async rerenderPage(
    @Param("sessionId") sessionId: string,
    @Param("pageNumber") pageNumber: string,
    @Body() dto: RerenderPageDto,
  ): Promise<any> {
    this.logger.log(
      `[rerenderPage] Session: ${sessionId}, Page: ${pageNumber}`,
    );

    try {
      const pageNum = parseInt(pageNumber, 10);
      const sourceText = dto.sourceText || "";

      const newPageState = await this.orchestrator.rerenderPage(
        sessionId,
        pageNum,
        sourceText,
      );

      return {
        success: true,
        page: {
          pageNumber: newPageState.pageNumber,
          status: newPageState.status,
          hasContent: !!newPageState.content,
          hasHtml: !!newPageState.html,
          hasImages: (newPageState.images?.length || 0) > 0,
        },
      };
    } catch (error: any) {
      this.logger.error(`[rerenderPage] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to rerender page",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取会话列表
   */
  @Get("sessions")
  async getSessions(
    @Query("userId") userId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ): Promise<any> {
    this.logger.log(`[getSessions] Getting sessions for user: ${userId}`);

    try {
      const sessions = await this.checkpointService.getSessions({
        userId,
        status: status as "active" | "completed" | "archived" | undefined,
        limit: limit ? parseInt(limit, 10) : 50,
      });

      // 获取每个会话的最新检查点信息
      const sessionsWithCheckpoints = await Promise.all(
        sessions.map(async (session) => {
          const latestCheckpoint =
            await this.checkpointService.getLatestCheckpoint(session.id);
          return {
            ...session,
            latestCheckpoint: latestCheckpoint
              ? {
                  id: latestCheckpoint.id,
                  type: latestCheckpoint.type,
                  timestamp: latestCheckpoint.timestamp,
                  pagesCount: latestCheckpoint.state?.pages?.length || 0,
                }
              : null,
          };
        }),
      );

      return {
        success: true,
        sessions: sessionsWithCheckpoints,
      };
    } catch (error: any) {
      this.logger.error(`[getSessions] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to get sessions",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 获取单个会话详情
   */
  @Get("sessions/:sessionId")
  async getSession(@Param("sessionId") sessionId: string): Promise<any> {
    this.logger.log(`[getSession] Session: ${sessionId}`);

    try {
      const session = await this.checkpointService.getSession(sessionId);

      if (!session) {
        throw new HttpException("Session not found", HttpStatus.NOT_FOUND);
      }

      // 获取最新检查点
      const latestCheckpoint =
        await this.checkpointService.getLatestCheckpoint(sessionId);

      return {
        success: true,
        session,
        latestCheckpoint: latestCheckpoint
          ? {
              id: latestCheckpoint.id,
              type: latestCheckpoint.type,
              timestamp: latestCheckpoint.timestamp,
              pagesCount: latestCheckpoint.state?.pages?.length || 0,
            }
          : null,
      };
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[getSession] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to get session",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 导出幻灯片
   */
  @Post("sessions/:sessionId/export")
  async exportSlides(
    @Param("sessionId") sessionId: string,
    @Body() dto: ExportV3Dto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `[exportSlides] Session: ${sessionId}, Format: ${dto.format}`,
    );

    try {
      // 获取最新检查点
      const latestCheckpoint =
        await this.checkpointService.getLatestCheckpoint(sessionId);

      if (!latestCheckpoint?.state?.pages) {
        throw new HttpException("No pages to export", HttpStatus.BAD_REQUEST);
      }

      // 转换为导出服务需要的格式
      const pptDocument = this.convertToExportFormat(
        sessionId,
        latestCheckpoint.state,
      );

      let result: {
        buffer: Buffer;
        filename: string;
        mimeType: string;
        fileSize: number;
      };

      switch (dto.format) {
        case "pptx":
          result = await this.exportService.exportToPPTX(pptDocument);
          break;
        case "pdf":
          result = await this.exportService.exportToPDF(pptDocument);
          break;
        case "png":
          result = await this.exportService.exportToPNG(pptDocument);
          break;
        default:
          throw new HttpException(
            `Export format '${dto.format}' not supported`,
            HttpStatus.BAD_REQUEST,
          );
      }

      res.setHeader("Content-Type", result.mimeType);
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(result.filename)}"`,
      );
      res.setHeader("Content-Length", result.fileSize);
      res.send(result.buffer);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`[exportSlides] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Export failed",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 归档会话
   */
  @Post("sessions/:sessionId/archive")
  async archiveSession(@Param("sessionId") sessionId: string): Promise<any> {
    this.logger.log(`[archiveSession] Session: ${sessionId}`);

    try {
      await this.checkpointService.updateSessionStatus(sessionId, "archived");

      return {
        success: true,
        message: "Session archived successfully",
      };
    } catch (error: any) {
      this.logger.error(`[archiveSession] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to archive session",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 更新会话标题
   */
  @Patch("sessions/:sessionId")
  async updateSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<any> {
    this.logger.log(
      `[updateSession] Session: ${sessionId}, Title: ${dto.title}`,
    );

    try {
      const session = await this.checkpointService.updateSessionTitle(
        sessionId,
        dto.title,
      );

      return {
        success: true,
        session,
      };
    } catch (error: any) {
      this.logger.error(`[updateSession] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to update session",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 删除会话
   */
  @Delete("sessions/:sessionId")
  async deleteSession(@Param("sessionId") sessionId: string): Promise<any> {
    this.logger.log(`[deleteSession] Session: ${sessionId}`);

    try {
      await this.checkpointService.deleteSession(sessionId);

      return {
        success: true,
        message: "Session deleted successfully",
      };
    } catch (error: any) {
      this.logger.error(`[deleteSession] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to delete session",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 清理旧检查点
   */
  @Post("sessions/:sessionId/prune")
  async pruneCheckpoints(
    @Param("sessionId") sessionId: string,
    @Query("keepCount") keepCount?: string,
  ): Promise<any> {
    this.logger.log(`[pruneCheckpoints] Session: ${sessionId}`);

    try {
      const keepLast = keepCount ? parseInt(keepCount, 10) : 10;
      const count = await this.checkpointService.prune(sessionId, keepLast);

      return {
        success: true,
        message: `Pruned ${count} checkpoints`,
        prunedCount: count,
      };
    } catch (error: any) {
      this.logger.error(`[pruneCheckpoints] Error: ${error.message}`);
      throw new HttpException(
        error.message || "Failed to prune checkpoints",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * 将 CheckpointState 转换为导出格式
   */
  private convertToExportFormat(sessionId: string, state: any): any {
    // 从 globalStyles 构建主题
    const globalStyles = state.globalStyles || {
      canvasWidth: 1280,
      canvasHeight: 720,
      backgroundColor: "#0F172A",
      cardBackground: "#1E293B",
      borderColor: "#334155",
      accentColor: "#D4AF37",
      accentColorSecondary: "#3B82F6",
      textPrimary: "#F8FAFC",
      textSecondary: "#CBD5E1",
      textMuted: "#94A3B8",
      fontFamily: "'Noto Sans SC', sans-serif",
    };

    // 构建 PPTTheme
    const theme = {
      id: "genspark-dark",
      name: "Genspark Dark",
      colors: {
        primary: globalStyles.accentColor || "#D4AF37",
        secondary: globalStyles.accentColorSecondary || "#3B82F6",
        accent: globalStyles.accentColor || "#D4AF37",
        background: globalStyles.backgroundColor || "#0F172A",
        backgroundSecondary: globalStyles.cardBackground || "#1E293B",
        text: globalStyles.textPrimary || "#F8FAFC",
        textLight: globalStyles.textSecondary || "#CBD5E1",
        textMuted: globalStyles.textMuted || "#94A3B8",
      },
      fonts: {
        heading: globalStyles.fontFamily || "'Noto Sans SC', sans-serif",
        body: globalStyles.fontFamily || "'Noto Sans SC', sans-serif",
      },
    };

    // 转换为 PPTDocument 格式
    return {
      id: sessionId,
      title: state.outlinePlan?.title || "Untitled",
      subtitle: state.taskDecomposition?.designStrategy?.overallStyle || "",
      theme,
      slides: (state.pages || []).map((page: any, idx: number) => {
        // 映射模板类型到布局类型
        const layoutTypeMap: Record<string, string> = {
          cover: "title_center",
          toc: "bullet_points",
          pillars: "statistics_cards",
          framework: "two_columns",
          timeline: "timeline_horizontal",
          dashboard: "statistics_cards",
          comparison: "comparison_split",
          caseStudy: "text_image_right",
          multiColumn: "two_columns",
          recommendations: "bullet_points",
          riskOpportunity: "comparison_split",
          evolutionRoadmap: "timeline_horizontal",
          splitLayout: "text_image_right",
        };

        // 映射模板类型到目的
        const purposeMap: Record<string, string> = {
          cover: "title",
          toc: "toc",
          pillars: "content",
          framework: "content",
          timeline: "content",
          dashboard: "content",
          comparison: "content",
          caseStudy: "content",
          multiColumn: "content",
          recommendations: "closing",
          riskOpportunity: "content",
          evolutionRoadmap: "content",
          splitLayout: "content",
        };

        const templateType = page.outline?.templateType || "content";

        // 从 sections 提取 bulletPoints
        const bulletPoints: string[] = [];
        const statistics: any[] = [];

        if (page.content?.sections) {
          for (const section of page.content.sections) {
            if (section.type === "list" && Array.isArray(section.content)) {
              bulletPoints.push(...section.content);
            } else if (
              section.type === "text" &&
              typeof section.content === "string"
            ) {
              bulletPoints.push(section.content);
            } else if (section.type === "stat" && section.content) {
              statistics.push({
                value: section.content.value || "0",
                label: section.content.label || "",
                trend: section.content.trend,
                comparison: section.content.change,
              });
            }
          }
        }

        return {
          id: `slide-${page.pageNumber}`,
          index: idx,
          spec: {
            id: `spec-${page.pageNumber}`,
            index: idx,
            purpose: purposeMap[templateType] || "content",
            layoutType: layoutTypeMap[templateType] || "bullet_points",
            title: page.outline?.title || "",
            contentOutline:
              page.content?.keyPoints || page.outline?.keyPoints || [],
            backgroundDecision: {
              type: "gradient",
              colors: {
                primary: globalStyles.backgroundColor,
                secondary: globalStyles.cardBackground,
              },
            },
          },
          content: {
            title: page.content?.title || page.outline?.title || "",
            subtitle: page.content?.subtitle || page.outline?.subtitle || "",
            bulletPoints:
              bulletPoints.length > 0
                ? bulletPoints
                : page.outline?.keyPoints || [],
            bodyText: page.content?.footer || "",
            statistics,
            quote: page.content?.quotes?.[0]
              ? {
                  text: page.content.quotes[0].text,
                  author: page.content.quotes[0].author,
                  source: page.content.quotes[0].source,
                }
              : undefined,
          },
          images: (page.images || []).map((img: any) => ({
            id: img.id,
            url: img.url,
            position: img.position,
            prompt: img.prompt,
          })),
          html: page.html || "",
          generatedAt: new Date().toISOString(),
        };
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
