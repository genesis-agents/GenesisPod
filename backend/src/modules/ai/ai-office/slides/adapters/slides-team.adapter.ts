/**
 * Slides Team Adapter
 * 将现有 Slides 编排服务适配到 ai-engine Teams 接口
 *
 * 这个适配器允许通过 Teams 框架调用 Slides 生成功能，
 * 同时保持与现有 Slides 模块的兼容性。
 */

import { Injectable, Logger } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { SlidesTeamOrchestratorService } from "../orchestrator/slides-team-orchestrator.service";
import {
  SlidesTeamInput,
  SlidesTeamEvent,
  SlidesTeamEventType,
} from "../orchestrator/slides-team.types";
import {
  TeamId,
  BUILTIN_TEAMS,
} from "../../../ai-engine/teams/abstractions/team.interface";
import { ConstraintProfile } from "../../../ai-engine/teams/constraints/constraint-profile";

/**
 * Mission 事件类型（适配器内部定义）
 */
export interface AdapterMissionEvent {
  type: string;
  timestamp: Date;
  payload?: Record<string, unknown>;
}

/**
 * Slides Mission 输入
 */
export interface SlidesMissionInput {
  /** 源文本 */
  sourceText: string;

  /** 用户 ID */
  userId: string;

  /** 用户需求（可选） */
  userRequirement?: string;

  /** 目标页数（可选，自动计算） */
  targetPages?: number;

  /** 风格偏好 */
  stylePreference?: "dark" | "light" | "custom";

  /** 目标受众 */
  targetAudience?: string;

  /** 主题 ID */
  themeId?: string;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Slides Mission 结果
 */
export interface SlidesMissionResult {
  /** 任务 ID */
  missionId: string;

  /** 团队 ID */
  teamId: TeamId;

  /** 是否成功 */
  success: boolean;

  /** 输出描述 */
  output: string;

  /** 会话 ID */
  sessionId: string;

  /** 总页数 */
  totalPages: number;

  /** 检查点 ID */
  checkpointId?: string;

  /** 质量分数 */
  qualityScore?: number;

  /** 交付物 */
  deliverables: Array<{
    type: string;
    name: string;
    format: string;
    sessionId?: string;
  }>;

  /** 错误信息 */
  error?: string;

  /** 元数据 */
  metadata?: Record<string, unknown>;
}

/**
 * Slides Team Adapter
 * 桥接现有 Slides 编排服务到 Teams 接口
 */
@Injectable()
export class SlidesTeamAdapter {
  private readonly logger = new Logger(SlidesTeamAdapter.name);

  constructor(
    private readonly slidesOrchestrator: SlidesTeamOrchestratorService,
  ) {}

  /**
   * 获取团队 ID
   */
  getTeamId(): TeamId {
    return BUILTIN_TEAMS.SLIDES;
  }

  /**
   * 执行 Slides Mission（流式）
   */
  async *executeMission(
    missionId: string,
    input: SlidesMissionInput,
    _constraints?: Partial<ConstraintProfile>,
    signal?: AbortSignal,
  ): AsyncGenerator<AdapterMissionEvent> {
    this.logger.log(`[executeMission] Starting slides mission: ${missionId}`);

    const startTime = new Date();
    const sessionId = uuidv4();

    try {
      // 发出 mission_started 事件
      yield {
        type: "mission_started",
        timestamp: new Date(),
        payload: {
          missionId,
          teamId: BUILTIN_TEAMS.SLIDES,
          sessionId,
          input: {
            sourceTextLength: input.sourceText.length,
            targetPages: input.targetPages,
            stylePreference: input.stylePreference,
          },
        },
      };

      // 转换输入格式
      const slidesInput: SlidesTeamInput = {
        sessionId,
        userId: input.userId,
        sourceText: input.sourceText,
        userRequirement: input.userRequirement,
        targetPages: input.targetPages,
        stylePreference: input.stylePreference || "dark",
        targetAudience: input.targetAudience,
        themeId: input.themeId,
      };

      // 调用现有 Slides 编排服务
      // 注意：executeStream 返回 Observable，需要转换为 async generator
      const observable = this.slidesOrchestrator.executeStream(slidesInput);

      let totalPages = 0;
      let checkpointId: string | undefined;
      let qualityScore: number | undefined;

      // 订阅 Observable 并转换事件
      await new Promise<void>((resolve, reject) => {
        const subscription = observable.subscribe({
          next: (slidesEvent: SlidesTeamEvent) => {
            // 检查取消信号
            if (signal?.aborted) {
              subscription.unsubscribe();
              reject(new Error("User cancelled"));
              return;
            }

            // 提取关键信息
            this.extractEventInfo(slidesEvent, {
              onTotalPages: (pages) => {
                totalPages = pages;
              },
              onCheckpointId: (id) => {
                checkpointId = id;
              },
              onQualityScore: (score) => {
                qualityScore = score;
              },
            });
          },
          error: (error) => {
            reject(error);
          },
          complete: () => {
            resolve();
          },
        });

        // 处理取消
        if (signal) {
          signal.addEventListener("abort", () => {
            subscription.unsubscribe();
            reject(new Error("User cancelled"));
          });
        }
      });

      const endTime = new Date();

      // 构建最终结果
      const result: SlidesMissionResult = {
        missionId,
        teamId: BUILTIN_TEAMS.SLIDES,
        success: true,
        output: `PPT 生成完成，共 ${totalPages} 页`,
        deliverables: [
          {
            type: "pptx",
            name: `slides-${sessionId}.pptx`,
            format: "pptx",
            sessionId,
          },
        ],
        sessionId,
        totalPages,
        checkpointId,
        qualityScore,
        metadata: {
          startTime,
          endTime,
          duration: endTime.getTime() - startTime.getTime(),
        },
      };

      // 发出 mission_completed 事件
      yield {
        type: "mission_completed",
        timestamp: endTime,
        payload: { result },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`[executeMission] Error: ${errorMessage}`);

      yield {
        type: "mission_failed",
        timestamp: new Date(),
        payload: {
          missionId,
          error: errorMessage,
        },
      };
    }
  }

  /**
   * 同步执行 Slides Mission
   */
  async execute(
    missionId: string,
    input: SlidesMissionInput,
    constraints?: Partial<ConstraintProfile>,
  ): Promise<SlidesMissionResult> {
    let result: SlidesMissionResult | undefined;

    for await (const event of this.executeMission(
      missionId,
      input,
      constraints,
    )) {
      if (event.type === "mission_completed" && event.payload) {
        result = event.payload.result as SlidesMissionResult;
      }
      if (event.type === "mission_failed" && event.payload) {
        throw new Error(event.payload.error as string);
      }
    }

    if (!result) {
      throw new Error("Mission completed without result");
    }

    return result;
  }

  /**
   * 从 Slides 事件中提取关键信息
   */
  private extractEventInfo(
    event: SlidesTeamEvent,
    callbacks: {
      onTotalPages?: (pages: number) => void;
      onCheckpointId?: (id: string) => void;
      onQualityScore?: (score: number) => void;
    },
  ): void {
    const eventType = event.type as SlidesTeamEventType;

    if (eventType === "execution:completed") {
      const data = event.data as { totalPages?: number; checkpointId?: string };
      if (data.totalPages && callbacks.onTotalPages) {
        callbacks.onTotalPages(data.totalPages);
      }
      if (data.checkpointId && callbacks.onCheckpointId) {
        callbacks.onCheckpointId(data.checkpointId);
      }
    }

    if (eventType === "review:scoring") {
      const data = event.data as { score?: number };
      if (data.score && callbacks.onQualityScore) {
        callbacks.onQualityScore(data.score);
      }
    }
  }

  /**
   * 获取团队能力描述
   */
  getCapabilities(): {
    name: string;
    description: string;
    supportedFormats: string[];
    maxPages: number;
    features: string[];
  } {
    return {
      name: "PPT 生成",
      description: "AI 驱动的专业 PPT 生成，支持多种模板和主题",
      supportedFormats: ["pptx", "pdf", "png", "html"],
      maxPages: 30,
      features: [
        "32 种专业模板",
        "Genspark 暗色/亮色主题",
        "智能内容压缩",
        "图表自动生成",
        "配图智能搜索",
        "批量质量审核",
      ],
    };
  }
}
