/**
 * Interactive Research Service
 *
 * P0: 交互式研究流程
 * 支持研究过程中的用户实时交互：暂停、调整方向、追问、审批中间结果
 *
 * 核心机制：
 * 1. 研究状态机管理（状态转换验证）
 * 2. 交互请求处理和路由
 * 3. 中间结果检查点保存
 * 4. 实时事件广播（通过 ResearchEventEmitterService）
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { ChatFacade } from "@/modules/ai-engine/facade";
import { sanitize } from "../../utils/prompt-sanitizer";
import { AIModelType } from "@prisma/client";
import {
  InteractionType,
  InteractionRequest,
  InteractionResponse,
  ResearchState,
  InteractionCheckpoint,
  RedirectPayload,
  FollowUpPayload,
  AddDimensionPayload,
  AdjustDepthPayload,
} from "../../types/interactive-research.types";

@Injectable()
export class InteractiveResearchService {
  private readonly logger = new Logger(InteractiveResearchService.name);

  /** 活跃研究的状态追踪 */
  private readonly missionStates = new Map<string, ResearchState>();

  /** 活跃研究的检查点 */
  private readonly checkpoints = new Map<string, InteractionCheckpoint>();

  /** 暂停标记（被暂停的 missionId 集合） */
  private readonly pausedMissions = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly chatFacade: ChatFacade,
  ) {}

  /**
   * 处理用户交互请求
   */
  async handleInteraction(
    request: InteractionRequest,
  ): Promise<InteractionResponse> {
    this.logger.log(
      `[handleInteraction] type=${request.type}, missionId=${request.missionId}`,
    );

    const currentState =
      this.missionStates.get(request.missionId) || ResearchState.RESEARCHING;

    // 验证状态转换是否合法
    if (!this.isValidTransition(currentState, request.type)) {
      return {
        success: false,
        type: request.type,
        message: `Cannot perform ${request.type} in state ${currentState}`,
      };
    }

    switch (request.type) {
      case InteractionType.PAUSE:
        return this.handlePause(request.missionId, currentState);

      case InteractionType.RESUME:
        return this.handleResume(request.missionId, currentState);

      case InteractionType.REDIRECT:
        return this.handleRedirect(
          request.missionId,
          request.topicId,
          request.payload as RedirectPayload,
          currentState,
        );

      case InteractionType.FOLLOW_UP:
        return this.handleFollowUp(
          request.missionId,
          request.topicId,
          request.payload as FollowUpPayload,
        );

      case InteractionType.ADD_DIMENSION:
        return this.handleAddDimension(
          request.missionId,
          request.topicId,
          request.payload as AddDimensionPayload,
        );

      case InteractionType.ADJUST_DEPTH:
        return this.handleAdjustDepth(
          request.missionId,
          request.payload as AdjustDepthPayload,
        );

      case InteractionType.APPROVE:
      case InteractionType.REJECT:
        return this.handleApprovalDecision(
          request.missionId,
          request.type,
          request.payload,
        );

      default:
        return {
          success: false,
          type: request.type,
          message: `Unsupported interaction type: ${request.type}`,
        };
    }
  }

  /**
   * 检查研究是否被暂停
   */
  isPaused(missionId: string): boolean {
    return this.pausedMissions.has(missionId);
  }

  /**
   * 获取研究当前状态
   */
  getState(missionId: string): ResearchState {
    return this.missionStates.get(missionId) || ResearchState.RESEARCHING;
  }

  /**
   * 设置研究状态
   */
  setState(missionId: string, state: ResearchState): void {
    this.missionStates.set(missionId, state);
  }

  /**
   * 保存交互检查点
   */
  saveCheckpoint(checkpoint: InteractionCheckpoint): void {
    this.checkpoints.set(checkpoint.missionId, checkpoint);
    this.logger.debug(
      `[saveCheckpoint] Saved checkpoint for mission ${checkpoint.missionId} at phase ${checkpoint.phase}`,
    );
  }

  /**
   * 获取检查点
   */
  getCheckpoint(missionId: string): InteractionCheckpoint | undefined {
    return this.checkpoints.get(missionId);
  }

  /**
   * 清理已完成研究的状态
   */
  cleanup(missionId: string): void {
    this.missionStates.delete(missionId);
    this.checkpoints.delete(missionId);
    this.pausedMissions.delete(missionId);
  }

  // =========================================================================
  // 交互处理方法
  // =========================================================================

  private handlePause(
    missionId: string,
    currentState: ResearchState,
  ): InteractionResponse {
    this.pausedMissions.add(missionId);
    this.missionStates.set(missionId, ResearchState.PAUSED);

    return {
      success: true,
      type: InteractionType.PAUSE,
      message: "Research paused. You can resume anytime.",
      stateChange: {
        previousState: currentState,
        newState: ResearchState.PAUSED,
      },
      suggestedActions: [
        "Resume research to continue from where it paused",
        "Redirect research to change focus",
        "Add new dimensions to explore",
      ],
    };
  }

  private handleResume(
    missionId: string,
    currentState: ResearchState,
  ): InteractionResponse {
    this.pausedMissions.delete(missionId);
    this.missionStates.set(missionId, ResearchState.RESEARCHING);

    return {
      success: true,
      type: InteractionType.RESUME,
      message: "Research resumed from last checkpoint.",
      stateChange: {
        previousState: currentState,
        newState: ResearchState.RESEARCHING,
      },
    };
  }

  private async handleRedirect(
    missionId: string,
    topicId: string,
    payload: RedirectPayload,
    currentState: ResearchState,
  ): Promise<InteractionResponse> {
    this.missionStates.set(missionId, ResearchState.REDIRECTING);

    try {
      // 使用 AI 分析新方向对现有研究的影响
      await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content:
              "You are a research direction analyst. Analyze how a change in research direction affects ongoing research dimensions. Return JSON with: { affectedDimensions: string[], newQueries: string[], preserveDimensions: string[] }",
          },
          {
            role: "user",
            content: `Current topic ID: ${topicId}\nNew direction: ${sanitize(payload.newDirection)}\nAffected dimensions: ${payload.affectedDimensions?.join(", ") || "all"}`,
          },
        ],
        modelType: AIModelType.CHAT,
        skipGuardrails: true, // 内部分析调用，非用户直传
        taskProfile: { creativity: "low", outputLength: "short" },
      });

      this.missionStates.set(missionId, ResearchState.RESEARCHING);

      return {
        success: true,
        type: InteractionType.REDIRECT,
        message: `Research redirected: ${payload.newDirection}`,
        stateChange: {
          previousState: currentState,
          newState: ResearchState.RESEARCHING,
          affectedDimensions: payload.affectedDimensions,
        },
        suggestedActions: [
          "Monitor the redirected research progress",
          "Review interim findings after redirection completes",
        ],
      };
    } catch (error) {
      this.missionStates.set(missionId, currentState);
      return {
        success: false,
        type: InteractionType.REDIRECT,
        message: `Failed to redirect: ${error}`,
      };
    }
  }

  private async handleFollowUp(
    _missionId: string,
    topicId: string,
    payload: FollowUpPayload,
  ): Promise<InteractionResponse> {
    try {
      // 获取当前研究上下文
      const topic = await this.prisma.researchTopic.findUnique({
        where: { id: topicId },
        include: { dimensions: true },
      });

      if (!topic) {
        return {
          success: false,
          type: InteractionType.FOLLOW_UP,
          message: "Topic not found",
        };
      }

      // 使用 AI 回答追问
      const response = await this.chatFacade.chat({
        messages: [
          {
            role: "system",
            content: `You are a research assistant analyzing the topic "${sanitize(topic.name)}". Answer the user's follow-up question based on the research context. Be concise but thorough.`,
          },
          {
            role: "user",
            content: `Follow-up question: ${sanitize(payload.question)}${payload.context ? `\nContext: ${sanitize(payload.context)}` : ""}${payload.targetDimensionId ? `\nFocus on dimension: ${payload.targetDimensionId}` : ""}`,
          },
        ],
        modelType: AIModelType.CHAT,
        skipGuardrails: true, // 含研究上下文数据，可能触发误报
        taskProfile: { creativity: "medium", outputLength: "medium" },
      });

      return {
        success: true,
        type: InteractionType.FOLLOW_UP,
        message: response.content || "Follow-up processed",
        suggestedActions: [
          "Ask another follow-up question",
          "Redirect research based on this insight",
          "Add a new dimension to explore this further",
        ],
      };
    } catch (error) {
      return {
        success: false,
        type: InteractionType.FOLLOW_UP,
        message: `Failed to process follow-up: ${error}`,
      };
    }
  }

  private async handleAddDimension(
    missionId: string,
    topicId: string,
    payload: AddDimensionPayload,
  ): Promise<InteractionResponse> {
    try {
      // 创建新维度
      const dimension = await this.prisma.topicDimension.create({
        data: {
          topicId,
          name: payload.dimensionName,
          description: payload.dimensionDescription,
          searchQueries: payload.searchQueries || [],
          searchSources: ["web", "academic"],
          status: "PENDING",
        },
      });

      return {
        success: true,
        type: InteractionType.ADD_DIMENSION,
        message: `Dimension "${payload.dimensionName}" added successfully`,
        stateChange: {
          previousState: this.getState(missionId),
          newState: this.getState(missionId),
          addedDimensions: [dimension.id],
        },
        suggestedActions: [
          "The new dimension will be researched in the next cycle",
          "You can adjust its search queries for better results",
        ],
      };
    } catch (error) {
      return {
        success: false,
        type: InteractionType.ADD_DIMENSION,
        message: `Failed to add dimension: ${error}`,
      };
    }
  }

  private handleAdjustDepth(
    missionId: string,
    payload: AdjustDepthPayload,
  ): InteractionResponse {
    // 深度调整存储在检查点中，供 Orchestrator 读取
    const checkpoint = this.checkpoints.get(missionId);
    if (checkpoint) {
      (checkpoint as unknown as Record<string, unknown>).adjustedDepth =
        payload.newDepth;
      (checkpoint as unknown as Record<string, unknown>).adjustedDimensionId =
        payload.dimensionId;
    }

    return {
      success: true,
      type: InteractionType.ADJUST_DEPTH,
      message: `Research depth adjusted to "${payload.newDepth}"${payload.dimensionId ? ` for dimension ${payload.dimensionId}` : " globally"}`,
    };
  }

  private handleApprovalDecision(
    _missionId: string,
    type: InteractionType,
    _payload: unknown,
  ): InteractionResponse {
    const isApproved = type === InteractionType.APPROVE;

    return {
      success: true,
      type,
      message: isApproved
        ? "Result approved. Research will continue."
        : "Result rejected. Research will re-attempt with adjustments.",
      suggestedActions: isApproved
        ? ["Monitor next phase progress"]
        : ["Provide specific feedback to guide re-research"],
    };
  }

  // =========================================================================
  // 状态转换验证
  // =========================================================================

  private isValidTransition(
    currentState: ResearchState,
    action: InteractionType,
  ): boolean {
    const transitions: Record<ResearchState, InteractionType[]> = {
      [ResearchState.PLANNING]: [
        InteractionType.PAUSE,
        InteractionType.REDIRECT,
        InteractionType.FOLLOW_UP,
        InteractionType.ADJUST_DEPTH,
      ],
      [ResearchState.RESEARCHING]: [
        InteractionType.PAUSE,
        InteractionType.REDIRECT,
        InteractionType.FOLLOW_UP,
        InteractionType.ADD_DIMENSION,
        InteractionType.REMOVE_DIMENSION,
        InteractionType.ADJUST_DEPTH,
        InteractionType.ADD_CONSTRAINT,
      ],
      [ResearchState.PAUSED]: [
        InteractionType.RESUME,
        InteractionType.REDIRECT,
        InteractionType.FOLLOW_UP,
        InteractionType.ADD_DIMENSION,
        InteractionType.REMOVE_DIMENSION,
        InteractionType.ADJUST_DEPTH,
      ],
      [ResearchState.REVIEWING]: [
        InteractionType.APPROVE,
        InteractionType.REJECT,
        InteractionType.FOLLOW_UP,
        InteractionType.PAUSE,
      ],
      [ResearchState.REDIRECTING]: [
        InteractionType.PAUSE,
        InteractionType.FOLLOW_UP,
      ],
      [ResearchState.SYNTHESIZING]: [
        InteractionType.PAUSE,
        InteractionType.FOLLOW_UP,
      ],
      [ResearchState.COMPLETED]: [InteractionType.FOLLOW_UP],
      [ResearchState.FAILED]: [InteractionType.FOLLOW_UP],
    };

    return transitions[currentState]?.includes(action) ?? false;
  }
}
