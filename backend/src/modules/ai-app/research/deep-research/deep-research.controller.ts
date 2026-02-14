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
import { Response } from "express";
import { DiscussionOrchestratorService } from "./discussion-orchestrator.service";
import { StartDeepResearchDto } from "./types";

/**
 * 深度研究 API 控制器
 * 提供 SSE 流式端点
 *
 * 使用 DiscussionOrchestratorService 驱动讨论式研究流程
 */
@Controller("ai-studio/projects/:projectId/deep-research")
export class DeepResearchController {
  private readonly logger = new Logger(DeepResearchController.name);

  constructor(
    private readonly discussionOrchestrator: DiscussionOrchestratorService,
  ) {}

  /**
   * 启动深度研究（SSE 流式响应）
   * 使用 POST 方法支持请求体
   */
  @Post("stream")
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

    // 使用讨论驱动型研究流程
    const subscription = this.discussionOrchestrator
      .startResearch(projectId, dto)
      .subscribe({
        next: (event) => {
          const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          res.write(eventData);
        },
        error: (error) => {
          this.logger.error(`Research stream error: ${error}`);
          const errorEvent = `event: error\ndata: ${JSON.stringify({ code: "STREAM_ERROR", message: "An error occurred during research", recoverable: false })}\n\n`;
          res.write(errorEvent);
          clearTimeout(timeout);
          res.end();
        },
        complete: () => {
          this.logger.log(`Research stream completed for project ${projectId}`);
          clearTimeout(timeout);
          res.end();
        },
      });

    // 设置 10 分钟超时
    const timeout = setTimeout(
      () => {
        this.logger.warn("Research stream timeout after 10 minutes");
        subscription.unsubscribe();
        res.end();
      },
      10 * 60 * 1000,
    );

    // 客户端断开连接时取消订阅
    res.on("close", () => {
      this.logger.log(`Client disconnected from research stream`);
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
