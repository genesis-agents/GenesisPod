import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Res,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Response } from "express";
import { DiscussionOrchestratorService } from "./discussion-orchestrator.service";
import { IterativeResearchService } from "../iteration";
import { StartDeepResearchDto } from "./types";

/**
 * 深度研究 API 控制器
 * 提供 SSE 流式端点
 *
 * 使用 IterativeResearchService 统一入口:
 * - mode='single' (默认): 直接委托给 DiscussionOrchestratorService
 * - mode='iterative': 运行自迭代外层循环
 */
@ApiTags("Research - Discussion")
@Controller("ai-studio/projects/:projectId/deep-research")
export class DiscussionController {
  private readonly logger = new Logger(DiscussionController.name);

  constructor(
    private readonly discussionOrchestrator: DiscussionOrchestratorService,
    private readonly iterativeResearch: IterativeResearchService,
  ) {}

  /**
   * 启动深度研究（SSE 流式响应）
   * 使用 POST 方法支持请求体
   */
  @Post("stream")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async startResearchStream(
    @Param("projectId") projectId: string,
    @Body() dto: StartDeepResearchDto,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log(
      `Starting deep research stream for project ${projectId}: "${dto.query.slice(0, 50)}..."`,
    );

    // 设置 SSE 响应头
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Track connection state to avoid writing to closed connections
    let connectionOpen = true;

    const safeWrite = (data: string): boolean => {
      if (!connectionOpen) return false;
      try {
        res.write(data);
        return true;
      } catch {
        connectionOpen = false;
        return false;
      }
    };

    // SSE keepalive heartbeat every 15s to prevent proxy idle timeouts
    // (Railway/Cloudflare proxies may close idle SSE connections after ~60s)
    const heartbeat = setInterval(() => {
      safeWrite(":heartbeat\n\n");
    }, 15_000);

    // Route through IterativeResearchService when available:
    // 'single' delegates to orchestrator, 'iterative' runs the self-iterating outer loop.
    const mode = dto.mode ?? "single";
    this.logger.log(`Research mode: ${mode}`);

    const observable = this.iterativeResearch.startResearch(projectId, {
      query: dto.query,
      mode,
      options: dto.options,
      iterationOptions: dto.iterationOptions,
      isFollowUp: dto.isFollowUp,
      previousContext: dto.previousContext,
    });

    const subscription = observable.subscribe({
      next: (event) => {
        const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
        safeWrite(eventData);
      },
      error: (error) => {
        this.logger.error(`Research stream error: ${error}`);
        const errorEvent = `event: error\ndata: ${JSON.stringify({ code: "STREAM_ERROR", message: "An error occurred during research", recoverable: false })}\n\n`;
        safeWrite(errorEvent);
        clearInterval(heartbeat);
        clearTimeout(timeout);
        if (connectionOpen) {
          connectionOpen = false;
          res.end();
        }
      },
      complete: () => {
        this.logger.log(`Research stream completed for project ${projectId}`);
        clearInterval(heartbeat);
        clearTimeout(timeout);
        if (connectionOpen) {
          connectionOpen = false;
          res.end();
        }
      },
    });

    // 设置 30 分钟超时（研究流程包含多轮AI调用+搜索，通常需要10-20分钟）
    const timeout = setTimeout(
      () => {
        this.logger.warn("Research stream timeout after 30 minutes");
        clearInterval(heartbeat);
        subscription.unsubscribe();
        if (connectionOpen) {
          connectionOpen = false;
          res.end();
        }
      },
      30 * 60 * 1000,
    );

    // 客户端断开连接时清理（但不 unsubscribe — research continues in background）
    res.on("close", () => {
      this.logger.log(`Client disconnected from research stream`);
      connectionOpen = false;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      subscription.unsubscribe();
    });
  }

  /**
   * POST 启动深度研究
   * 适用于不使用 SSE 的场景，返回 session ID
   */
  @Post("start")
  async startResearch(
    @Param("projectId") projectId: string,
    @Body() dto: StartDeepResearchDto,
  ) {
    this.logger.log(
      `Starting deep research for project ${projectId}: "${dto.query.slice(0, 50)}..."`,
    );

    // 创建会话并启动后台处理
    const sessionId = `dr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // 启动研究（后台运行）
    this.discussionOrchestrator.startResearch(projectId, dto).subscribe({
      next: (event) => {
        this.logger.debug(`Research event: ${event.type}`);
      },
      error: (error) => {
        this.logger.error(`Research error: ${error}`);
      },
      complete: () => {
        this.logger.log(`Research completed for project ${projectId}`);
      },
    });

    return {
      sessionId,
      message: "深度研究已启动",
    };
  }

  /**
   * 获取研究会话详情
   */
  @Get("sessions/:sessionId")
  async getSession(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    this.logger.log(`Getting session ${sessionId} for project ${projectId}`);

    const session = await this.discussionOrchestrator.getSession(sessionId);

    if (!session) {
      throw new NotFoundException("Session not found");
    }

    return session;
  }

  /**
   * 获取项目的研究会话列表
   */
  @Get("sessions")
  async getProjectSessions(@Param("projectId") projectId: string) {
    this.logger.log(`Getting sessions for project ${projectId}`);

    const sessions =
      await this.discussionOrchestrator.getProjectSessions(projectId);

    return sessions;
  }

  /**
   * 删除单个研究会话
   */
  @Delete("sessions/:sessionId")
  async deleteSession(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionId: string,
  ) {
    this.logger.log(`Deleting session ${sessionId} for project ${projectId}`);

    try {
      await this.discussionOrchestrator.deleteSession(sessionId);
      return {
        message: "研究会话已删除",
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "删除失败",
      );
    }
  }

  /**
   * 批量删除研究会话
   */
  @Delete("sessions")
  async deleteSessions(
    @Param("projectId") projectId: string,
    @Body() body: { sessionIds: string[] },
  ) {
    this.logger.log(
      `Deleting ${body.sessionIds.length} sessions for project ${projectId}`,
    );

    try {
      const result = await this.discussionOrchestrator.deleteSessions(
        body.sessionIds,
      );
      return {
        deleted: result.count,
        message: `已删除 ${result.count} 个研究会话`,
      };
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "批量删除失败",
      );
    }
  }
}
