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

    // 2. 发送会话创建事件
    yield this.createEvent("session_created", sessionId, {
      sessionId,
      userId: input.userId,
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
        // 6. 转换事件格式
        const streamEvent = this.transformMissionEvent(event, sessionId);
        if (streamEvent) {
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

      // 9. 发送完成事件
      yield this.createEvent("complete", sessionId, {
        success: true,
        sessionId,
        result: missionResult,
      });
    } catch (error) {
      this.logger.error(`[generateSlides] Error: ${error}`);

      yield this.createEvent("error", sessionId, {
        message: error instanceof Error ? error.message : String(error),
        phase: "unknown",
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
    const result = await this.exportService.exportToPPTX(state as unknown as Parameters<typeof this.exportService.exportToPPTX>[0]);
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
    const result = await this.exportService.exportToPDF(state as unknown as Parameters<typeof this.exportService.exportToPDF>[0]);
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
   * 转换 MissionEvent 为 StreamEvent
   */
  private transformMissionEvent(
    event: MissionEvent,
    sessionId: string,
  ): StreamEvent | null {
    const typeMapping: Record<string, StreamEventType> = {
      mission_started: "session_created",
      parsing_started: "phase_started",
      parsing_completed: "phase_completed",
      planning_started: "phase_started",
      planning_completed: "phase_completed",
      step_started: "phase_started",
      step_progress: "progress_update",
      step_completed: "phase_completed",
      review_started: "phase_started",
      review_completed: "phase_completed",
      deliverable_ready: "page_completed",
      mission_completed: "complete",
      mission_failed: "error",
    };

    const mappedType = typeMapping[event.type];
    if (!mappedType) {
      // 未映射的事件类型，忽略或作为 progress_update
      return null;
    }

    return {
      type: mappedType,
      timestamp: event.timestamp,
      sessionId,
      data: this.transformEventData(event),
    };
  }

  /**
   * 转换事件数据
   */
  private transformEventData(event: MissionEvent): unknown {
    const data = event.data as Record<string, unknown> | undefined;

    switch (event.type) {
      case "step_started":
        return {
          phase: data?.stepId,
        };

      case "step_completed":
        return {
          phase: data?.stepId,
          output: data?.output,
        };

      case "step_progress":
        return {
          progress: data?.progress,
          message: data?.message,
        };

      case "mission_completed":
        return {
          success: true,
          result: data?.result,
        };

      case "mission_failed":
        return {
          success: false,
          error: data?.error,
        };

      default:
        return data;
    }
  }

  /**
   * 创建流式事件
   */
  private createEvent(
    type: StreamEventType,
    sessionId: string,
    data: unknown = {},
  ): StreamEvent {
    return {
      type,
      timestamp: new Date(),
      sessionId,
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
  ): "task_decomposition" | "outline_confirmed" | "page_rendered" | "batch_rendered" {
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
