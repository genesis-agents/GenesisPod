import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Sse,
  Logger,
  MessageEvent,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { DeepResearchAgentService } from "./deep-research-agent.service";
import { StartDeepResearchDto, DeepResearchSSEEvent } from "./types";

/**
 * 深度研究 API 控制器
 * 提供 SSE 流式端点
 */
@Controller("api/v1/ai-studio/projects/:projectId/deep-research")
export class DeepResearchController {
  private readonly logger = new Logger(DeepResearchController.name);

  constructor(private readonly deepResearchAgent: DeepResearchAgentService) {}

  /**
   * 启动深度研究（SSE 流式响应）
   *
   * 前端通过 EventSource 连接此端点，接收实时进度更新
   *
   * @example
   * const es = new EventSource('/api/v1/ai-studio/projects/xxx/deep-research/stream?query=...');
   * es.addEventListener('thought_summary', (e) => {...});
   * es.addEventListener('search_progress', (e) => {...});
   */
  @Sse("stream")
  startResearchStream(
    @Param("projectId") projectId: string,
    @Body() dto: StartDeepResearchDto,
  ): Observable<MessageEvent> {
    this.logger.log(
      `Starting deep research stream for project ${projectId}: "${dto.query.slice(0, 50)}..."`,
    );

    return this.deepResearchAgent.startResearch(projectId, dto).pipe(
      map((event: DeepResearchSSEEvent) => ({
        data: JSON.stringify(event.data),
        type: event.type,
        id: `${event.type}-${Date.now()}`,
      })),
    );
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
