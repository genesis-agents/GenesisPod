import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Res,
  Logger,
} from "@nestjs/common";
import { Response } from "express";
import { DeepResearchAgentService } from "./deep-research-agent.service";
import { StartDeepResearchDto } from "./types";

/**
 * 深度研究 API 控制器
 * 提供 SSE 流式端点
 */
@Controller("ai-studio/projects/:projectId/deep-research")
export class DeepResearchController {
  private readonly logger = new Logger(DeepResearchController.name);

  constructor(private readonly deepResearchAgent: DeepResearchAgentService) {}

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

    // 订阅研究流
    const subscription = this.deepResearchAgent
      .startResearch(projectId, dto)
      .subscribe({
        next: (event) => {
          const eventData = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
          res.write(eventData);
        },
        error: (error) => {
          this.logger.error(`Research stream error: ${error}`);
          const errorEvent = `event: error\ndata: ${JSON.stringify({ code: "STREAM_ERROR", message: error.message, recoverable: false })}\n\n`;
          res.write(errorEvent);
          res.end();
        },
        complete: () => {
          this.logger.log(`Research stream completed for project ${projectId}`);
          res.end();
        },
      });

    // 客户端断开连接时取消订阅
    res.on("close", () => {
      this.logger.log(`Client disconnected from research stream`);
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
    this.deepResearchAgent.startResearch(projectId, dto).subscribe({
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
      success: true,
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

    const session = await this.deepResearchAgent.getSession(sessionId);

    if (!session) {
      return {
        success: false,
        error: "Session not found",
      };
    }

    return {
      success: true,
      data: session,
    };
  }

  /**
   * 获取项目的研究会话列表
   */
  @Get("sessions")
  async getProjectSessions(@Param("projectId") projectId: string) {
    this.logger.log(`Getting sessions for project ${projectId}`);

    const sessions = await this.deepResearchAgent.getProjectSessions(projectId);

    return {
      success: true,
      data: sessions,
    };
  }
}
