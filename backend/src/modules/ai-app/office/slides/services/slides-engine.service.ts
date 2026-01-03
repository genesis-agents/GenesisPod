/**
 * Slides Engine Service v4.0
 * 幻灯片生成引擎服务
 *
 * 核心职责：
 * - 通过 AI Engine 的 TeamsService 编排 PPT 生成任务
 * - 事件格式转换（MissionEvent → StreamEvent）
 * - 检查点管理
 * - 导出功能
 *
 * 架构：
 * SlidesEngineService → TeamsService → MissionOrchestrator → slides-team
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  TeamsService,
  CreateMissionDto,
} from "@/modules/ai-engine/teams/services/teams.service";
import {
  MissionEvent,
  MissionResult,
} from "@/modules/ai-engine/teams/abstractions/mission.interface";
import { BUILTIN_TEAMS } from "@/modules/ai-engine/teams/abstractions/team.interface";
import { CheckpointService } from "../checkpoint/checkpoint.service";
import { SlidesExportService } from "../rendering/slides-export.service";
import {
  CheckpointState,
  StreamEventType,
  StreamEvent,
} from "../checkpoint/checkpoint.types";

/**
 * PPT 生成输入参数
 */
export interface SlidesGenerateInput {
  /** 用户 ID */
  userId: string;

  /** 源文本内容 */
  sourceText: string;

  /** 用户需求描述（可选） */
  userRequirement?: string;

  /** 目标页数（可选，自动推断） */
  targetPages?: number;

  /** 风格偏好 */
  stylePreference?: "dark" | "light";

  /** 主题 ID */
  themeId?: string;

  /** 会话 ID（可选，用于恢复） */
  sessionId?: string;

  /** 目标受众（可选） */
  targetAudience?: string;
}

// Re-export StreamEvent for convenience
export { StreamEvent };

/**
 * 导出选项
 */
export interface ExportOptions {
  format: "pptx" | "pdf" | "png" | "html";
  quality?: "standard" | "high";
}

/**
 * PPT 生成引擎服务
 */
@Injectable()
export class SlidesEngineService {
  private readonly logger = new Logger(SlidesEngineService.name);

  constructor(
    private readonly teamsService: TeamsService,
    private readonly checkpointService: CheckpointService,
    private readonly exportService: SlidesExportService,
  ) {}

  /**
   * 生成 PPT（流式）
   * 通过 AI Engine 的 TeamsService 编排
   */
  async *generateSlides(
    input: SlidesGenerateInput,
  ): AsyncGenerator<StreamEvent> {
    this.logger.log(
      `[generateSlides] Starting PPT generation for user ${input.userId}`,
    );

    // 1. 创建或恢复会话
    let sessionId = input.sessionId;
    if (!sessionId) {
      const session = await this.checkpointService.createSession(
        input.userId,
        input.userRequirement || "PPT 生成",
      );
      sessionId = session.id;
    }

    // 2. 发送 execution:started 事件
    yield this.createEvent("execution:started", sessionId, {
      sessionId,
      sourceLength: input.sourceText?.length || 0,
      targetPages: input.targetPages,
    });

    // 3. 构建 Mission 输入
    const missionDto: CreateMissionDto = {
      teamId: BUILTIN_TEAMS.SLIDES,
      goal: this.buildMissionGoal(input),
      context: input.sourceText,
      constraints: {
        quality: {
          depth: "standard",
          accuracy: "prefer_evidence",
          reviewRequired: true,
          minReviewScore: 7,
          maxReworks: 2,
        },
        efficiency: {
          maxDuration: 10 * 60 * 1000, // 10 分钟
          priority: "normal",
          allowParallel: true,
          maxParallelism: 3,
        },
      },
      userId: input.userId,
      sessionId,
      metadata: {
        themeId: input.themeId || "genspark-dark",
        stylePreference: input.stylePreference || "dark",
        targetPages: input.targetPages,
        targetAudience: input.targetAudience,
      },
    };

    // 4. 启动心跳
    const heartbeatInterval = setInterval(() => {
      // 心跳由调用方处理，这里不直接发送
    }, 15000);

    try {
      // 5. 执行 Mission（流式）
      const generator = this.teamsService.executeMissionStream(missionDto);

      let currentPhase = "";
      let missionResult: MissionResult | undefined;

      for await (const event of generator) {
        // 6. 转换事件格式（可能返回多个事件）
        const streamEvents = this.transformMissionEvent(event, sessionId);
        for (const streamEvent of streamEvents) {
          yield streamEvent;
        }

        // 7. 跟踪阶段并保存检查点
        if (event.type === "step_started") {
          currentPhase = (event.data as { stepId?: string })?.stepId || "";
          this.logger.debug(`[generateSlides] Phase started: ${currentPhase}`);
        }

        if (event.type === "step_completed") {
          const stepId = (event.data as { stepId?: string })?.stepId;
          if (stepId && this.isCheckpointPhase(stepId)) {
            await this.saveCheckpoint(sessionId, stepId, event.data);
          }
        }

        if (event.type === "mission_completed") {
          missionResult = (event.data as { result?: MissionResult })?.result;
        }
      }

      // 8. 保存最终检查点
      if (missionResult) {
        await this.saveFinalCheckpoint(sessionId, missionResult);
      }

      // 9. 发送 execution:completed 事件
      const totalPages =
        (missionResult?.deliverables as unknown[])?.length || 0;
      yield this.createEvent("execution:completed", sessionId, {
        totalPages,
        totalTime: missionResult?.duration || 0,
        checkpointId: sessionId, // 使用 sessionId 作为 checkpointId
      });
    } catch (error) {
      this.logger.error(`[generateSlides] Error: ${error}`);

      yield this.createEvent("execution:failed", sessionId, {
        error: error instanceof Error ? error.message : String(error),
        phase: "unknown",
        recoverable: false,
      });
    } finally {
      clearInterval(heartbeatInterval);
    }
  }

  /**
   * 获取会话状态
   */
  async getSessionState(sessionId: string): Promise<CheckpointState | null> {
    const checkpoint =
      await this.checkpointService.getLatestCheckpoint(sessionId);
    return checkpoint?.state || null;
  }

  /**
   * 恢复到指定检查点
   */
  async restoreCheckpoint(
    checkpointId: string,
  ): Promise<{ state: CheckpointState; sessionId: string }> {
    return this.checkpointService.restore(checkpointId);
  }

  /**
   * 导出 PPTX
   */
  async exportPptx(sessionId: string): Promise<Buffer> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const result = await this.exportService.exportToPPTX(
      state as unknown as Parameters<typeof this.exportService.exportToPPTX>[0],
    );
    return result.buffer;
  }

  /**
   * 导出 PDF
   */
  async exportPdf(sessionId: string): Promise<Buffer> {
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }
    const result = await this.exportService.exportToPDF(
      state as unknown as Parameters<typeof this.exportService.exportToPDF>[0],
    );
    return result.buffer;
  }

  /**
   * 重新生成指定页面
   */
  async regeneratePage(
    sessionId: string,
    pageNumber: number,
    _feedback?: string,
  ): Promise<StreamEvent[]> {
    this.logger.log(
      `[regeneratePage] Regenerating page ${pageNumber} for session ${sessionId}`,
    );

    // 获取当前状态
    const state = await this.getSessionState(sessionId);
    if (!state) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // TODO: 实现单页重新生成逻辑
    // 这需要调用特定的技能来重新生成单个页面

    return [];
  }

  // ==================== 私有方法 ====================

  /**
   * 构建任务目标描述
   */
  private buildMissionGoal(input: SlidesGenerateInput): string {
    let goal = "根据提供的内容生成专业的 PPT 演示文稿";

    if (input.targetPages) {
      goal += `，目标 ${input.targetPages} 页`;
    }

    if (input.userRequirement) {
      goal += `。用户需求：${input.userRequirement}`;
    }

    if (input.targetAudience) {
      goal += `。目标受众：${input.targetAudience}`;
    }

    return goal;
  }

  /**
   * 转换 MissionEvent 为 StreamEvent 数组
   * 使用前端期望的事件类型格式
   * 同时发送 phase 事件和对应的 agent 事件
   */
  private transformMissionEvent(
    event: MissionEvent,
    sessionId: string,
  ): StreamEvent[] {
    const data = event.data as Record<string, unknown> | undefined;
    const events: StreamEvent[] = [];

    // 根据不同的事件类型返回不同格式的事件
    switch (event.type) {
      case "mission_started":
        // 注意: execution:started 已在 generateSlides() 开始时发送
        // 这里不再重复发送，避免前端收到两个 "开始生成" 事件
        // 如果需要，可以发送一个内部的 mission 状态事件
        this.logger.debug(
          `[transformMissionEvent] mission_started received, skipping duplicate execution:started`,
        );
        break;

      case "parsing_started":
      case "planning_started":
      case "step_started":
      case "review_started": {
        const stepId = data?.stepId || data?.phase || event.type;
        const phase = this.mapStepToPhase(String(stepId));
        const agent = this.mapPhaseToAgent(phase);
        const agentName = this.getAgentName(agent);

        // 发送 phase:started 事件
        events.push(
          this.createEvent("phase:started", sessionId, {
            phase,
            agent,
            description: this.getPhaseDescription(phase),
          }),
        );

        // 发送 agent:working 事件 - 让 agent 卡片显示工作状态
        events.push(
          this.createEvent("agent:working", sessionId, {
            agent,
            agentName,
            task: this.getPhaseDescription(phase),
            progress: 0,
          }),
        );
        break;
      }

      case "step_progress": {
        const stepId = data?.stepId || "generating";
        const phase = this.mapStepToPhase(String(stepId));
        const agent = this.mapPhaseToAgent(phase);
        const agentName = this.getAgentName(agent);

        events.push(
          this.createEvent("phase:progress", sessionId, {
            phase: stepId,
            progress: data?.progress || 0,
            message: data?.message || "处理中...",
          }),
        );

        // 更新 agent 的工作进度
        events.push(
          this.createEvent("agent:working", sessionId, {
            agent,
            agentName,
            task: (data?.message as string) || "处理中...",
            progress: data?.progress || 0,
          }),
        );
        break;
      }

      case "parsing_completed":
      case "planning_completed":
      case "step_completed":
      case "review_completed": {
        const stepId = data?.stepId || data?.phase || event.type;
        const phase = this.mapStepToPhase(String(stepId));
        const agent = this.mapPhaseToAgent(phase);
        const agentName = this.getAgentName(agent);

        // 发送 agent:completed 事件
        events.push(
          this.createEvent("agent:completed", sessionId, {
            agent,
            agentName,
            result: this.getPhaseCompletedMessage(phase),
            duration: (data?.duration as number) || 0,
          }),
        );

        // 发送 phase:completed 事件
        events.push(
          this.createEvent("phase:completed", sessionId, {
            phase,
            duration: data?.duration || 0,
            result: data?.output,
          }),
        );
        break;
      }

      case "deliverable_ready": {
        const pageNumber = (data?.pageNumber as number) || 1;
        events.push(
          this.createEvent("slide:generated", sessionId, {
            pageNumber,
            title: data?.title || `第 ${pageNumber} 页`,
            contentLength: 0,
            html: data?.html,
          }),
        );
        break;
      }

      case "mission_completed":
        // 发送 leader 完成事件（用于 AgentTeamPanel）
        events.push(
          this.createEvent("agent:completed", sessionId, {
            agent: "leader",
            agentName: "Slides Architect",
            result: "PPT 生成完成！",
            duration: (data?.result as { duration?: number })?.duration || 0,
          }),
        );
        // 注意: execution:completed 在 generateSlides() 循环结束后发送
        // 这里不再重复发送，避免前端收到两个 "生成完成" 事件
        this.logger.debug(
          `[transformMissionEvent] mission_completed received, execution:completed will be sent after loop`,
        );
        break;

      case "mission_failed":
        events.push(
          this.createEvent("execution:failed", sessionId, {
            error: (data?.error as string) || "Unknown error",
            phase: "unknown",
            recoverable: false,
          }),
        );
        break;

      default:
        // 未映射的事件类型，忽略
        break;
    }

    return events;
  }

  /**
   * 将 step ID 映射到 phase
   */
  private mapStepToPhase(stepId: string): string {
    const mapping: Record<string, string> = {
      "task-decomposition": "analyzing",
      "outline-planning": "planning",
      "page-rendering": "generating",
      "batch-review": "reviewing",
      finalize: "completed",
      parsing_started: "analyzing",
      planning_started: "planning",
      step_started: "generating",
      review_started: "reviewing",
    };
    return mapping[stepId] || "generating";
  }

  /**
   * 将 phase 映射到 agent role
   */
  private mapPhaseToAgent(
    phase: string,
  ): "leader" | "analyst" | "strategist" | "writer" | "reviewer" {
    const mapping: Record<
      string,
      "leader" | "analyst" | "strategist" | "writer" | "reviewer"
    > = {
      initializing: "leader",
      analyzing: "analyst",
      planning: "strategist",
      generating: "writer",
      rendering: "writer",
      reviewing: "reviewer",
      completed: "leader",
    };
    return mapping[phase] || "writer";
  }

  /**
   * 获取 phase 描述
   */
  private getPhaseDescription(phase: string): string {
    const descriptions: Record<string, string> = {
      initializing: "正在初始化 AI 团队...",
      analyzing: "正在分析内容结构...",
      planning: "正在规划 PPT 大纲...",
      generating: "正在生成页面内容...",
      rendering: "正在渲染 HTML...",
      reviewing: "正在进行质量检查...",
      completed: "生成完成！",
    };
    return descriptions[phase] || "处理中...";
  }

  /**
   * 获取 agent 名称
   */
  private getAgentName(
    agent: "leader" | "analyst" | "strategist" | "writer" | "reviewer",
  ): string {
    const names: Record<string, string> = {
      leader: "Slides Architect",
      analyst: "Content Analyst",
      strategist: "Visual Strategist",
      writer: "Content Writer",
      reviewer: "Quality Reviewer",
    };
    return names[agent] || agent;
  }

  /**
   * 获取 phase 完成消息
   */
  private getPhaseCompletedMessage(phase: string): string {
    const messages: Record<string, string> = {
      analyzing: "内容分析完成",
      planning: "大纲规划完成",
      generating: "页面生成完成",
      rendering: "HTML 渲染完成",
      reviewing: "质量检查完成",
      completed: "全部完成",
    };
    return messages[phase] || "阶段完成";
  }

  /**
   * 创建流式事件
   * 使用前端期望的 SlidesTeamEvent 格式
   */
  private createEvent(
    type: StreamEventType,
    executionId: string,
    data: unknown = {},
  ): StreamEvent {
    return {
      type,
      timestamp: new Date().toISOString(),
      executionId,
      data,
    };
  }

  /**
   * 判断是否为需要保存检查点的阶段
   */
  private isCheckpointPhase(stepId: string): boolean {
    const checkpointPhases = [
      "task-decomposition",
      "outline-planning",
      "page-rendering",
      "batch-review",
      "finalize",
    ];
    return checkpointPhases.includes(stepId);
  }

  /**
   * 保存检查点
   */
  private async saveCheckpoint(
    sessionId: string,
    stepId: string,
    data: unknown,
  ): Promise<void> {
    try {
      const checkpointType = this.stepIdToCheckpointType(stepId);
      await this.checkpointService.create({
        sessionId,
        type: checkpointType,
        state: {
          // 从 data 中提取状态
          ...(data as object),
        } as CheckpointState,
        metadata: {
          trigger: "auto",
          description: `Step: ${stepId}`,
        },
      });
      this.logger.debug(`[saveCheckpoint] Saved checkpoint for ${stepId}`);
    } catch (error) {
      this.logger.warn(`[saveCheckpoint] Failed to save checkpoint: ${error}`);
    }
  }

  /**
   * 保存最终检查点
   */
  private async saveFinalCheckpoint(
    sessionId: string,
    result: MissionResult,
  ): Promise<void> {
    try {
      await this.checkpointService.create({
        sessionId,
        type: "batch_rendered",
        state: {
          // 从 result 中提取最终状态
          pages: result.deliverables || [],
        } as unknown as CheckpointState,
        metadata: {
          trigger: "auto",
          description: "Mission completed",
          tokensUsed: result.tokensUsed,
          durationMs: result.duration,
        },
      });
      this.logger.log(`[saveFinalCheckpoint] Saved final checkpoint`);
    } catch (error) {
      this.logger.warn(
        `[saveFinalCheckpoint] Failed to save final checkpoint: ${error}`,
      );
    }
  }

  /**
   * 将步骤 ID 转换为检查点类型
   */
  private stepIdToCheckpointType(
    stepId: string,
  ):
    | "task_decomposition"
    | "outline_confirmed"
    | "page_rendered"
    | "batch_rendered" {
    switch (stepId) {
      case "task-decomposition":
        return "task_decomposition";
      case "outline-planning":
        return "outline_confirmed";
      case "page-rendering":
        return "page_rendered";
      case "batch-review":
      case "finalize":
        return "batch_rendered";
      default:
        return "page_rendered";
    }
  }
}
