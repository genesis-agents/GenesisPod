/**
 * Research Event Emitter Service
 *
 * 参考 AI Writing 的 WritingEventEmitterService 设计
 * 提供研究任务实时事件广播能力
 */

import { Injectable, Logger } from "@nestjs/common";

export type ResearchEmitHandler = (
  topicId: string,
  event: string,
  data: unknown,
) => Promise<void>;

/**
 * 研究任务事件类型
 */
export enum ResearchEventType {
  // Mission 状态事件
  MISSION_STARTED = "mission:started",
  MISSION_PROGRESS = "mission:progress",
  MISSION_COMPLETED = "mission:completed",
  MISSION_FAILED = "mission:failed",

  // Leader 事件
  LEADER_THINKING = "leader:thinking",
  LEADER_PLANNING = "leader:planning",
  LEADER_PLAN_READY = "leader:plan_ready",
  LEADER_RESPONSE = "leader:response",

  // Agent 工作事件
  AGENT_WORKING = "agent:working",
  AGENT_COMPLETED = "agent:completed",
  AGENT_FAILED = "agent:failed",

  // 任务事件
  TASK_STARTED = "task:started",
  TASK_PROGRESS = "task:progress",
  TASK_COMPLETED = "task:completed",
  TASK_FAILED = "task:failed",

  // 维度研究事件
  DIMENSION_RESEARCH_STARTED = "dimension:research_started",
  DIMENSION_RESEARCH_PROGRESS = "dimension:research_progress",
  DIMENSION_RESEARCH_COMPLETED = "dimension:research_completed",

  // 报告撰写事件
  REPORT_SYNTHESIS_STARTED = "report:synthesis_started",
  REPORT_SYNTHESIS_PROGRESS = "report:synthesis_progress",
  REPORT_SYNTHESIS_COMPLETED = "report:synthesis_completed",
}

/**
 * Leader 思考数据
 */
export interface LeaderThinkingData {
  missionId: string;
  phase: "understanding" | "analyzing" | "planning" | "assigning";
  content: string;
  progress?: number;
}

/**
 * Agent 工作状态
 */
export interface AgentWorkingData {
  agentId: string;
  agentName: string;
  agentRole: "leader" | "researcher" | "reviewer" | "synthesizer";
  status: "working" | "completed" | "failed";
  taskDescription?: string;
  dimensionName?: string;
  progress?: number;
}

/**
 * 任务进度数据
 */
export interface TaskProgressData {
  taskId: string;
  taskType: string;
  title: string;
  dimensionName?: string;
  status: string;
  progress: number;
  message?: string;
}

/**
 * Mission 进度数据
 */
export interface MissionProgressData {
  missionId: string;
  progress: number;
  phase: string;
  message: string;
  currentTask?: string;
  completedTasks: number;
  totalTasks: number;
  activeAgents?: string[];
}

@Injectable()
export class ResearchEventEmitterService {
  private readonly logger = new Logger(ResearchEventEmitterService.name);
  private emitHandler?: ResearchEmitHandler;

  /**
   * 注册事件发射处理器（由 Gateway 调用）
   */
  registerEmitHandler(handler: ResearchEmitHandler): void {
    this.emitHandler = handler;
    this.logger.log("Research emit handler registered");
  }

  /**
   * 发射事件到专题
   */
  async emitToTopic(
    topicId: string,
    event: ResearchEventType | string,
    data: unknown,
  ): Promise<void> {
    if (!this.emitHandler) {
      this.logger.debug(`No emit handler registered, skipping event: ${event}`);
      return;
    }

    try {
      await this.emitHandler(topicId, event, {
        timestamp: new Date().toISOString(),
        ...this.normalizeEventData(data),
      });
    } catch (error) {
      this.logger.error(`Failed to emit event ${event}:`, error);
    }
  }

  // ==================== Mission 事件 ====================

  /**
   * 发送任务开始事件
   */
  async emitMissionStarted(
    topicId: string,
    missionId: string,
    leaderModel?: string,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.MISSION_STARTED, {
      missionId,
      leaderModel,
      message: "研究任务已启动，Leader 正在分析...",
    });
  }

  /**
   * 发送进度更新事件
   */
  async emitMissionProgress(
    topicId: string,
    data: MissionProgressData,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.MISSION_PROGRESS, data);
  }

  /**
   * 发送任务完成事件
   */
  async emitMissionCompleted(
    topicId: string,
    missionId: string,
    completedTasks: number,
    totalTasks: number,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.MISSION_COMPLETED, {
      missionId,
      completedTasks,
      totalTasks,
      message: `研究完成，共完成 ${completedTasks} 个任务`,
    });
  }

  /**
   * 发送任务失败事件
   */
  async emitMissionFailed(
    topicId: string,
    missionId: string,
    error: string,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.MISSION_FAILED, {
      missionId,
      error,
      message: `研究失败: ${error}`,
    });
  }

  // ==================== Leader 事件 ====================

  /**
   * 发送 Leader 思考事件
   */
  async emitLeaderThinking(
    topicId: string,
    data: LeaderThinkingData,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.LEADER_THINKING, data);
  }

  /**
   * 发送 Leader 规划中事件
   */
  async emitLeaderPlanning(
    topicId: string,
    missionId: string,
    content: string,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.LEADER_PLANNING, {
      missionId,
      content,
      message: content,
    });
  }

  /**
   * 发送 Leader 规划完成事件
   */
  async emitLeaderPlanReady(
    topicId: string,
    missionId: string,
    dimensionCount: number,
    agentCount: number,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.LEADER_PLAN_READY, {
      missionId,
      dimensionCount,
      agentCount,
      message: `规划完成：${dimensionCount} 个研究维度，分配 ${agentCount} 个研究员`,
    });
  }

  /**
   * 发送 Leader 响应事件（多轮对话）
   */
  async emitLeaderResponse(
    topicId: string,
    missionId: string,
    response: string,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.LEADER_RESPONSE, {
      missionId,
      response,
      message: response,
    });
  }

  // ==================== Agent 事件 ====================

  /**
   * 发送 Agent 工作状态事件
   */
  async emitAgentWorking(
    topicId: string,
    data: AgentWorkingData,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.AGENT_WORKING, data);
  }

  /**
   * 发送 Agent 完成事件
   */
  async emitAgentCompleted(
    topicId: string,
    agentId: string,
    agentName: string,
    result?: string,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.AGENT_COMPLETED, {
      agentId,
      agentName,
      result,
      message: `${agentName} 完成工作`,
    });
  }

  // ==================== Task 事件 ====================

  /**
   * 发送任务开始事件
   */
  async emitTaskStarted(
    topicId: string,
    data: TaskProgressData,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.TASK_STARTED, {
      ...data,
      message: `开始执行: ${data.title}`,
    });
  }

  /**
   * 发送任务进度事件
   */
  async emitTaskProgress(
    topicId: string,
    data: TaskProgressData,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.TASK_PROGRESS, data);
  }

  /**
   * 发送任务完成事件
   */
  async emitTaskCompleted(
    topicId: string,
    data: TaskProgressData,
  ): Promise<void> {
    await this.emitToTopic(topicId, ResearchEventType.TASK_COMPLETED, {
      ...data,
      message: `完成: ${data.title}`,
    });
  }

  // ==================== 维度研究事件 ====================

  /**
   * 发送维度研究开始事件
   */
  async emitDimensionResearchStarted(
    topicId: string,
    dimensionName: string,
    agentName: string,
  ): Promise<void> {
    await this.emitToTopic(
      topicId,
      ResearchEventType.DIMENSION_RESEARCH_STARTED,
      {
        dimensionName,
        agentName,
        message: `🔍 ${agentName} 开始研究「${dimensionName}」维度`,
      },
    );
  }

  /**
   * 发送维度研究进度事件
   */
  async emitDimensionResearchProgress(
    topicId: string,
    dimensionName: string,
    progress: number,
    currentStep: string,
  ): Promise<void> {
    await this.emitToTopic(
      topicId,
      ResearchEventType.DIMENSION_RESEARCH_PROGRESS,
      {
        dimensionName,
        progress,
        currentStep,
        message: `「${dimensionName}」${currentStep}`,
      },
    );
  }

  /**
   * 发送维度研究完成事件
   */
  async emitDimensionResearchCompleted(
    topicId: string,
    dimensionName: string,
    findingsCount: number,
    wordCount: number,
  ): Promise<void> {
    await this.emitToTopic(
      topicId,
      ResearchEventType.DIMENSION_RESEARCH_COMPLETED,
      {
        dimensionName,
        findingsCount,
        wordCount,
        message: `✅「${dimensionName}」研究完成，发现 ${findingsCount} 个要点，${wordCount} 字`,
      },
    );
  }

  // ==================== 报告撰写事件 ====================

  /**
   * 发送报告撰写开始事件
   */
  async emitReportSynthesisStarted(topicId: string): Promise<void> {
    await this.emitToTopic(
      topicId,
      ResearchEventType.REPORT_SYNTHESIS_STARTED,
      {
        message: "📊 开始整合研究结果，撰写洞察报告...",
      },
    );
  }

  /**
   * 发送报告撰写完成事件
   */
  async emitReportSynthesisCompleted(
    topicId: string,
    chapterCount: number,
    totalWordCount: number,
  ): Promise<void> {
    await this.emitToTopic(
      topicId,
      ResearchEventType.REPORT_SYNTHESIS_COMPLETED,
      {
        chapterCount,
        totalWordCount,
        message: `📊 报告撰写完成，共 ${chapterCount} 个章节，${totalWordCount} 字`,
      },
    );
  }

  /**
   * 标准化事件数据
   */
  private normalizeEventData(data: unknown): Record<string, unknown> {
    if (data === null || data === undefined) {
      return {};
    }
    if (typeof data === "object") {
      return data as Record<string, unknown>;
    }
    return { value: data };
  }
}
