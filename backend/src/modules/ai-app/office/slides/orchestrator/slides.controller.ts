/**
 * Slides Engine - Controller
 *
 * 幻灯片生成 API 控制器
 *
 * API 端点：
 * - POST /ai-office/slides/generate (SSE) - 流式生成
 * - GET /ai-office/slides/sessions/:sessionId/checkpoints - 获取检查点列表
 * - POST /ai-office/slides/restore/:checkpointId - 恢复检查点
 * - POST /ai-office/slides/sessions/:sessionId/rerender/:pageNumber - 重新渲染页面
 *
 * v4.0: 使用 AI Engine 的 TeamsService 进行编排
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
import { SlidesEngineService } from "../services/slides-engine.service";
import { CheckpointService } from "../checkpoint/checkpoint.service";
import { GlobalStyles } from "../checkpoint/checkpoint.types";
import { getAllThemes } from "../templates/base/themes";
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

class GenerateDto {
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
  feedback?: string;
}

class ExportDto {
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

/**
 * 辅助函数：将 AsyncGenerator 转换为 Observable
 */
function fromAsyncGenerator<T>(generator: AsyncGenerator<T>): Observable<T> {
  return new Observable<T>((subscriber) => {
    (async () => {
      try {
        for await (const value of generator) {
          subscriber.next(value);
        }
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    })();
  });
}

@Controller("ai-office/slides")
export class SlidesController {
  private readonly logger = new Logger(SlidesController.name);

  constructor(
    private readonly slidesEngine: SlidesEngineService,
    private readonly checkpointService: CheckpointService,
  ) {}

  // ============================================
  // Themes API
  // ============================================

  /**
   * 获取可用主题列表
   */
  @Get("themes/list")
  async getThemesList() {
    this.logger.log("[getThemesList] Fetching available themes");
    const themes = getAllThemes();
    return {
      success: true,
      themes: themes.map((theme) => ({
        id: theme.id,
        name: theme.name,
        description: theme.description,
        preview: theme.preview,
        colors: {
          primary: theme.colors.background.primary,
          accent: theme.colors.accent.primary,
          text: theme.colors.text.primary,
        },
      })),
    };
  }

  // ============================================
  // 生成 API (使用 AI Engine)
  // ============================================

  /**
   * 流式生成幻灯片 (SSE) - GET 方式
   *
   * 通过 AI Engine 的 TeamsService 编排生成
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
    @Query("themeId") themeId?: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `[generateSlides] Starting generation: ${title?.slice(0, 50)}...`,
    );

    const generator = this.slidesEngine.generateSlides({
      userId: userId || "anonymous",
      sourceText: sourceText || "",
      userRequirement,
      targetPages: targetPages ? parseInt(targetPages, 10) : undefined,
      stylePreference: stylePreference as "dark" | "light",
      targetAudience,
      themeId,
    });

    return fromAsyncGenerator(generator).pipe(
      map((event) => {
        this.logger.debug(`[generateSlides] Sending SSE event: ${event.type}`);
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
  generateSlidesPost(
    @Body() dto: GenerateDto,
    @Query("userId") userId?: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `[generateSlidesPost] Starting generation: ${dto.title?.slice(0, 50)}...`,
    );

    const generator = this.slidesEngine.generateSlides({
      userId: userId || "anonymous",
      sourceText: dto.sourceText,
      userRequirement: dto.userRequirement,
      targetPages: dto.targetPages,
      stylePreference: dto.stylePreference as "dark" | "light",
      targetAudience: dto.targetAudience,
      themeId: dto.themeId,
    });

    return fromAsyncGenerator(generator).pipe(
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
   * Team 协作生成幻灯片 (SSE)
   *
   * 注：现在使用与普通生成相同的 AI Engine 编排
   */
  @Post("team/generate")
  @Sse()
  generateTeam(
    @Body() dto: GenerateDto,
    @Query("userId") userId?: string,
  ): Observable<MessageEvent> {
    this.logger.log(
      `[generateTeam] Starting Team generation with ${dto.sourceText?.length || 0} chars`,
    );

    // 使用相同的引擎，AI Engine 会负责团队协作编排
    const generator = this.slidesEngine.generateSlides({
      userId: userId || "anonymous",
      sourceText: dto.sourceText,
      userRequirement: dto.userRequirement,
      targetPages: dto.targetPages,
      stylePreference: dto.stylePreference as "dark" | "light",
      targetAudience: dto.targetAudience,
      themeId: dto.themeId,
    });

    return fromAsyncGenerator(generator).pipe(
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
            type: "error",
            timestamp: new Date().toISOString(),
            error: error.message || "Team generation failed",
          }),
        });
      }),
    );
  }

  // ============================================
  // Checkpoint API
  // ============================================

  /**
   * 获取会话的检查点列表
   */
  @Get("sessions/:sessionId/checkpoints")
  async getCheckpoints(
    @Param("sessionId") sessionId: string,
    @Query("limit") limit?: string,
  ): Promise<object> {
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get checkpoints";
      this.logger.error(`[getCheckpoints] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取单个检查点详情
   */
  @Get("checkpoints/:checkpointId")
  async getCheckpoint(
    @Param("checkpointId") checkpointId: string,
  ): Promise<object> {
    this.logger.log(`[getCheckpoint] Checkpoint: ${checkpointId}`);

    try {
      const result = await this.slidesEngine.restoreCheckpoint(checkpointId);

      return {
        success: true,
        sessionId: result.sessionId,
        checkpointId,
        state: result.state,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Checkpoint not found";
      this.logger.error(`[getCheckpoint] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.NOT_FOUND);
    }
  }

  /**
   * 恢复到指定检查点
   */
  @Post("restore/:checkpointId")
  async restoreCheckpoint(
    @Param("checkpointId") checkpointId: string,
  ): Promise<object> {
    this.logger.log(`[restoreCheckpoint] Restoring to: ${checkpointId}`);

    try {
      const result = await this.slidesEngine.restoreCheckpoint(checkpointId);

      return {
        success: true,
        message: "Checkpoint restored successfully",
        sessionId: result.sessionId,
        checkpointId,
        state: {
          pagesCount: result.state.pages?.length || 0,
          hasOutline: !!result.state.outlinePlan,
          hasTaskDecomposition: !!result.state.taskDecomposition,
        },
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to restore checkpoint";
      this.logger.error(`[restoreCheckpoint] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
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
  ): Promise<object> {
    this.logger.log(
      `[rerenderPage] Session: ${sessionId}, Page: ${pageNumber}`,
    );

    try {
      const pageNum = parseInt(pageNumber, 10);
      const events = await this.slidesEngine.regeneratePage(
        sessionId,
        pageNum,
        dto.feedback,
      );

      return {
        success: true,
        events,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to rerender page";
      this.logger.error(`[rerenderPage] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================================
  // Session API
  // ============================================

  /**
   * 获取会话列表
   */
  @Get("sessions")
  async getSessions(
    @Query("userId") userId: string,
    @Query("status") status?: string,
    @Query("limit") limit?: string,
  ): Promise<object> {
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get sessions";
      this.logger.error(`[getSessions] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 获取单个会话详情
   */
  @Get("sessions/:sessionId")
  async getSession(@Param("sessionId") sessionId: string): Promise<object> {
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
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Failed to get session";
      this.logger.error(`[getSession] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================================
  // Export API
  // ============================================

  /**
   * 导出幻灯片
   */
  @Post("sessions/:sessionId/export")
  async exportSlides(
    @Param("sessionId") sessionId: string,
    @Body() dto: ExportDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `[exportSlides] Session: ${sessionId}, Format: ${dto.format}`,
    );

    try {
      let buffer: Buffer;

      switch (dto.format) {
        case "pptx":
          buffer = await this.slidesEngine.exportPptx(sessionId);
          res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          );
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="presentation-${sessionId}.pptx"`,
          );
          break;
        case "pdf":
          buffer = await this.slidesEngine.exportPdf(sessionId);
          res.setHeader("Content-Type", "application/pdf");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="presentation-${sessionId}.pdf"`,
          );
          break;
        default:
          throw new HttpException(
            `Export format '${dto.format}' not supported`,
            HttpStatus.BAD_REQUEST,
          );
      }

      res.setHeader("Content-Length", buffer.length);
      res.send(buffer);
    } catch (error: unknown) {
      if (error instanceof HttpException) {
        throw error;
      }
      const errorMessage =
        error instanceof Error ? error.message : "Export failed";
      this.logger.error(`[exportSlides] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  // ============================================
  // Session Management API
  // ============================================

  /**
   * 归档会话
   */
  @Post("sessions/:sessionId/archive")
  async archiveSession(@Param("sessionId") sessionId: string): Promise<object> {
    this.logger.log(`[archiveSession] Session: ${sessionId}`);

    try {
      await this.checkpointService.updateSessionStatus(sessionId, "archived");

      return {
        success: true,
        message: "Session archived successfully",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to archive session";
      this.logger.error(`[archiveSession] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 更新会话标题
   */
  @Patch("sessions/:sessionId")
  async updateSession(
    @Param("sessionId") sessionId: string,
    @Body() dto: UpdateSessionDto,
  ): Promise<object> {
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
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to update session";
      this.logger.error(`[updateSession] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 删除会话
   */
  @Delete("sessions/:sessionId")
  async deleteSession(@Param("sessionId") sessionId: string): Promise<object> {
    this.logger.log(`[deleteSession] Session: ${sessionId}`);

    try {
      await this.checkpointService.deleteSession(sessionId);

      return {
        success: true,
        message: "Session deleted successfully",
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to delete session";
      this.logger.error(`[deleteSession] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 清理旧检查点
   */
  @Post("sessions/:sessionId/prune")
  async pruneCheckpoints(
    @Param("sessionId") sessionId: string,
    @Query("keepCount") keepCount?: string,
  ): Promise<object> {
    this.logger.log(`[pruneCheckpoints] Session: ${sessionId}`);

    try {
      const keepLast = keepCount ? parseInt(keepCount, 10) : 10;
      const count = await this.checkpointService.prune(sessionId, keepLast);

      return {
        success: true,
        message: `Pruned ${count} checkpoints`,
        prunedCount: count,
      };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Failed to prune checkpoints";
      this.logger.error(`[pruneCheckpoints] Error: ${errorMessage}`);
      throw new HttpException(errorMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
