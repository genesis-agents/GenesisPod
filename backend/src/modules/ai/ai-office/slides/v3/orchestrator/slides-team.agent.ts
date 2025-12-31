/**
 * Slides Team Agent
 *
 * 将 Slides Team 封装为可被其他 Agent 调用的接口
 * 符合 AI Teams 的 Agent 调用规范
 */

import { Injectable, Logger } from "@nestjs/common";
import { Observable, lastValueFrom, toArray } from "rxjs";
import { SlidesTeamOrchestratorService } from "./slides-team-orchestrator.service";
import {
  SlidesTeamInput,
  SlidesTeamEvent,
  SLIDES_TEAM_AGENTS,
} from "./slides-team.types";

/**
 * Agent 调用输入
 */
export interface SlidesAgentInput {
  /** 源文本内容 */
  sourceText: string;
  /** 用户需求描述 */
  userRequirement?: string;
  /** 目标页数 */
  targetPages?: number;
  /** 风格偏好 */
  stylePreference?: "dark" | "light" | "custom";
  /** 目标受众 */
  targetAudience?: string;
  /** 主题 ID */
  themeId?: string;
}

/**
 * Agent 调用输出
 */
export interface SlidesAgentOutput {
  /** 执行是否成功 */
  success: boolean;
  /** 执行 ID */
  executionId: string;
  /** 生成的页数 */
  totalPages: number;
  /** 检查点 ID（用于获取结果） */
  checkpointId?: string;
  /** 质量评分 */
  qualityScore?: number;
  /** 错误信息 */
  error?: string;
  /** 执行时间（毫秒） */
  duration: number;
  /** 事件历史摘要 */
  eventsSummary: string[];
}

/**
 * Agent 能力描述
 */
export interface SlidesAgentCapability {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

/**
 * Slides Team Agent
 *
 * 提供三种调用模式：
 * 1. execute() - 同步执行，等待完成后返回结果
 * 2. executeStream() - 流式执行，返回 Observable 用于 SSE
 * 3. getCapabilities() - 获取 Agent 能力描述
 */
@Injectable()
export class SlidesTeamAgent {
  private readonly logger = new Logger(SlidesTeamAgent.name);

  /**
   * Agent 名称
   */
  readonly name = "slides-team";

  /**
   * Agent 描述
   */
  readonly description =
    "AI PPT 生成团队，由 5 个专业 Agent 协作完成高质量 PPT 制作";

  /**
   * Agent 成员
   */
  readonly team = SLIDES_TEAM_AGENTS;

  constructor(private readonly orchestrator: SlidesTeamOrchestratorService) {}

  /**
   * 获取 Agent 能力描述
   * 用于其他 Agent 了解如何调用此 Agent
   */
  getCapabilities(): SlidesAgentCapability {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: "object",
        required: ["sourceText"],
        properties: {
          sourceText: {
            type: "string",
            description: "要转换为 PPT 的源文本内容",
          },
          userRequirement: {
            type: "string",
            description: "用户对 PPT 的特殊要求（可选）",
          },
          targetPages: {
            type: "number",
            description: "目标页数，默认由 AI 自动决定",
          },
          stylePreference: {
            type: "string",
            enum: ["dark", "light", "custom"],
            description: "视觉风格偏好，默认为 dark",
          },
          targetAudience: {
            type: "string",
            description: "目标受众描述，用于调整内容风格",
          },
          themeId: {
            type: "string",
            description: "主题模板 ID，默认为 genspark-dark",
          },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          success: { type: "boolean" },
          executionId: { type: "string" },
          totalPages: { type: "number" },
          checkpointId: { type: "string" },
          qualityScore: { type: "number" },
          error: { type: "string" },
          duration: { type: "number" },
          eventsSummary: { type: "array", items: { type: "string" } },
        },
      },
    };
  }

  /**
   * 同步执行 - 等待完成后返回结果
   * 适用于其他 Agent 调用时需要获取完整结果的场景
   */
  async execute(
    input: SlidesAgentInput,
    context: { sessionId: string; userId: string },
  ): Promise<SlidesAgentOutput> {
    const startTime = Date.now();

    this.logger.log(
      `[execute] Starting Slides Team Agent for session: ${context.sessionId}`,
    );

    try {
      // 构建完整输入
      const teamInput: SlidesTeamInput = {
        sessionId: context.sessionId,
        userId: context.userId,
        sourceText: input.sourceText,
        userRequirement: input.userRequirement,
        targetPages: input.targetPages,
        stylePreference: input.stylePreference,
        targetAudience: input.targetAudience,
        themeId: input.themeId,
      };

      // 收集所有事件
      const events$ = this.orchestrator.executeStream(teamInput);
      const events = await lastValueFrom(events$.pipe(toArray()));

      // 提取关键信息
      const completedEvent = events.find(
        (e) => e.type === "execution:completed",
      );
      const failedEvent = events.find((e) => e.type === "execution:failed");

      const duration = Date.now() - startTime;

      if (failedEvent) {
        const failedData = failedEvent.data as { error: string };
        return {
          success: false,
          executionId: failedEvent.executionId,
          totalPages: 0,
          error: failedData.error,
          duration,
          eventsSummary: this.summarizeEvents(events),
        };
      }

      if (completedEvent) {
        const completedData = completedEvent.data as {
          totalPages: number;
          checkpointId: string;
        };

        // 查找质量评分
        const reviewEvent = events.find(
          (e) =>
            e.type === "phase:completed" &&
            (e.data as { phase: string }).phase === "reviewing",
        );
        const qualityScore = reviewEvent
          ? (reviewEvent.data as { result?: { overallScore?: number } })?.result
              ?.overallScore
          : undefined;

        return {
          success: true,
          executionId: completedEvent.executionId,
          totalPages: completedData.totalPages,
          checkpointId: completedData.checkpointId,
          qualityScore,
          duration,
          eventsSummary: this.summarizeEvents(events),
        };
      }

      // 未预期的情况
      return {
        success: false,
        executionId: events[0]?.executionId || "unknown",
        totalPages: 0,
        error: "Execution completed without expected completion event",
        duration,
        eventsSummary: this.summarizeEvents(events),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.logger.error(`[execute] Slides Team Agent failed: ${errorMessage}`);

      return {
        success: false,
        executionId: "error",
        totalPages: 0,
        error: errorMessage,
        duration,
        eventsSummary: [`Error: ${errorMessage}`],
      };
    }
  }

  /**
   * 流式执行 - 返回 Observable 用于 SSE
   * 适用于前端需要实时展示进度的场景
   */
  executeStream(
    input: SlidesAgentInput,
    context: { sessionId: string; userId: string },
  ): Observable<SlidesTeamEvent> {
    this.logger.log(
      `[executeStream] Starting Slides Team Agent stream for session: ${context.sessionId}`,
    );

    const teamInput: SlidesTeamInput = {
      sessionId: context.sessionId,
      userId: context.userId,
      sourceText: input.sourceText,
      userRequirement: input.userRequirement,
      targetPages: input.targetPages,
      stylePreference: input.stylePreference,
      targetAudience: input.targetAudience,
      themeId: input.themeId,
    };

    return this.orchestrator.executeStream(teamInput);
  }

  /**
   * 总结事件流
   */
  private summarizeEvents(events: SlidesTeamEvent[]): string[] {
    const summary: string[] = [];

    // 阶段完成事件
    const phaseEvents = events.filter((e) => e.type === "phase:completed");
    for (const event of phaseEvents) {
      const data = event.data as { phase: string; duration: number };
      summary.push(`${data.phase} 阶段完成 (${data.duration}ms)`);
    }

    // Agent 完成事件
    const agentEvents = events.filter((e) => e.type === "agent:completed");
    for (const event of agentEvents) {
      const data = event.data as { agentName: string; result: string };
      summary.push(`${data.agentName}: ${data.result}`);
    }

    // Leader 审核事件
    const handoffEvents = events.filter((e) => e.type === "agent:handoff");
    for (const event of handoffEvents) {
      const data = event.data as {
        fromAgent: string;
        toAgent: string;
        message: string;
      };
      if (data.toAgent === "leader") {
        summary.push(`Leader 审核 ${data.fromAgent} 的成果`);
      }
    }

    return summary;
  }
}
