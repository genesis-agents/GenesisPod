/**
 * Writing Event Emitter Service
 *
 * 参考 AI Teams 的 TopicEventEmitterService 设计
 * 提供实时事件广播能力
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { WritingRealtimeAdapter } from "./writing-realtime.adapter";

export type WritingEmitHandler = (
  projectId: string,
  event: string,
  data: unknown,
) => Promise<void>;

/**
 * 写作任务事件类型
 */
export enum WritingEventType {
  // Mission 状态事件
  MISSION_STARTED = "mission:started",
  MISSION_PROGRESS = "mission:progress",
  MISSION_COMPLETED = "mission:completed",
  MISSION_FAILED = "mission:failed",

  // Leader 多轮对话响应事件
  LEADER_RESPONSE = "leader:response",

  // Agent 工作事件
  AGENT_WORKING = "agent:working",
  AGENT_COMPLETED = "agent:completed",
  AGENT_FAILED = "agent:failed",

  // 章节事件
  CHAPTER_STARTED = "chapter:started",
  CHAPTER_CONTENT = "chapter:content",
  CHAPTER_COMPLETED = "chapter:completed",

  // 一致性检查事件
  CONSISTENCY_CHECK_STARTED = "consistency:check_started",
  CONSISTENCY_ISSUES_FOUND = "consistency:issues_found",
  CONSISTENCY_FIX_STARTED = "consistency:fix_started",
  CONSISTENCY_FIX_COMPLETED = "consistency:fix_completed",

  // 世界观设定事件
  WORLD_BUILDING_STARTED = "world:building_started",
  WORLD_BUILDING_COMPLETED = "world:building_completed",

  // 守护者增强事件
  KEEPER_EXTRACTING_CONTEXT = "keeper:extracting_context",
  KEEPER_CONTEXT_READY = "keeper:context_ready",
  KEEPER_UPDATING_BIBLE = "keeper:updating_bible",
  KEEPER_BIBLE_UPDATED = "keeper:bible_updated",
}

/**
 * Agent 工作状态
 */
export interface AgentWorkingData {
  agentId: string;
  agentName: string;
  agentRole: "architect" | "keeper" | "writer" | "checker" | "editor";
  status: "working" | "completed" | "failed";
  taskDescription?: string;
  progress?: number;
}

/**
 * 章节内容数据
 */
export interface ChapterContentData {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  volumeIndex: number;
}

/**
 * 一致性检查结果
 */
export interface ConsistencyCheckData {
  chapterNumber: number;
  passed: boolean;
  issues: Array<{
    type: string;
    severity: "error" | "warning" | "info";
    description: string;
    suggestion?: string;
  }>;
}

@Injectable()
export class WritingEventEmitterService {
  private readonly logger = new Logger(WritingEventEmitterService.name);
  private emitHandler?: WritingEmitHandler;

  constructor(
    @Optional() private readonly realtimeAdapter?: WritingRealtimeAdapter,
  ) {
    if (this.realtimeAdapter) {
      this.logger.log(
        "WritingEventEmitterService initialized with RealtimeAdapter integration",
      );
    }
  }

  /**
   * 注册事件发射处理器（由 Gateway 调用）
   */
  registerEmitHandler(handler: WritingEmitHandler): void {
    this.emitHandler = handler;
    this.logger.log("Writing emit handler registered");
  }

  /**
   * 发射事件到项目
   * ★ 优先使用 RealtimeAdapter（如果可用），同时保持原有 handler 兼容
   */
  async emitToProject(
    projectId: string,
    event: WritingEventType | string,
    data: unknown,
  ): Promise<void> {
    const normalizedData = {
      timestamp: new Date().toISOString(),
      ...this.normalizeEventData(data),
    };

    // ★ 使用 RealtimeAdapter 发射事件（如果可用）
    if (this.realtimeAdapter) {
      try {
        this.realtimeAdapter.emitToProject(projectId, event, normalizedData);
      } catch (error) {
        this.logger.error(
          `[RealtimeAdapter] Failed to emit event ${event}:`,
          error,
        );
      }
    }

    // ★ 保持原有 handler 兼容（Gateway 注册的处理器）
    if (this.emitHandler) {
      try {
        await this.emitHandler(projectId, event, normalizedData);
      } catch (error) {
        this.logger.error(
          `[EmitHandler] Failed to emit event ${event}:`,
          error,
        );
      }
    }

    if (!this.realtimeAdapter && !this.emitHandler) {
      this.logger.debug(`No emit handler registered, skipping event: ${event}`);
    }
  }

  /**
   * 发送任务开始事件
   * ★ 同时启动进度追踪（如果 RealtimeAdapter 可用）
   */
  async emitMissionStarted(
    projectId: string,
    missionId: string,
    missionType: string,
    targetWordCount: number,
  ): Promise<void> {
    // ★ 启动进度追踪
    if (this.realtimeAdapter) {
      this.realtimeAdapter.startMissionTracking(projectId, missionId);
      this.realtimeAdapter.startPhase(missionId, "preparation", "准备写作任务");
    }

    await this.emitToProject(projectId, WritingEventType.MISSION_STARTED, {
      missionId,
      missionType,
      targetWordCount,
    });
  }

  /**
   * 发送进度更新事件
   */
  async emitMissionProgress(
    projectId: string,
    missionId: string,
    progress: number,
    currentStep: string,
    activeAgents: string[],
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.MISSION_PROGRESS, {
      missionId,
      progress,
      currentStep,
      activeAgents,
    });
  }

  /**
   * 发送任务完成事件
   * ★ 同时完成进度追踪（先完成 writing 阶段，再完成整体任务）
   */
  async emitMissionCompleted(
    projectId: string,
    missionId: string,
    totalWords: number,
    totalChapters: number,
    totalVolumes: number,
  ): Promise<void> {
    // ★ 先完成 writing 阶段，确保进度平滑过渡
    if (this.realtimeAdapter) {
      this.realtimeAdapter.completePhase(missionId, "writing", "章节写作完成");
      // 注：checking 和 editing 阶段当前业务中未单独使用，直接完成任务
      this.realtimeAdapter.completeMissionTracking(missionId, "写作完成");
    }

    await this.emitToProject(projectId, WritingEventType.MISSION_COMPLETED, {
      missionId,
      totalWords,
      totalChapters,
      totalVolumes,
    });
  }

  /**
   * 发送任务失败事件
   * ★ 同时标记进度追踪失败
   */
  async emitMissionFailed(
    projectId: string,
    missionId: string,
    error: string,
  ): Promise<void> {
    // ★ 标记进度追踪失败
    if (this.realtimeAdapter) {
      this.realtimeAdapter.failMissionTracking(missionId, error);
    }

    await this.emitToProject(projectId, WritingEventType.MISSION_FAILED, {
      missionId,
      error,
    });
  }

  /**
   * 发送 Agent 工作状态事件
   */
  async emitAgentWorking(
    projectId: string,
    data: AgentWorkingData,
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.AGENT_WORKING, data);
  }

  /**
   * 发送章节开始事件
   * ★ 第一章开始时完成 planning 阶段，开始 writing 阶段
   */
  async emitChapterStarted(
    projectId: string,
    chapterNumber: number,
    title: string,
    volumeIndex: number,
    missionId?: string,
  ): Promise<void> {
    // ★ 第一章开始时进行阶段转换：planning → writing
    if (chapterNumber === 1 && this.realtimeAdapter && missionId) {
      this.realtimeAdapter.completePhase(missionId, "planning", "大纲规划完成");
      this.realtimeAdapter.startPhase(missionId, "writing", "开始章节写作");
    }

    await this.emitToProject(projectId, WritingEventType.CHAPTER_STARTED, {
      missionId,
      chapterNumber,
      title,
      volumeIndex,
    });
  }

  /**
   * 发送章节内容事件（中间输出）
   */
  async emitChapterContent(
    projectId: string,
    data: ChapterContentData,
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.CHAPTER_CONTENT, data);
  }

  /**
   * 发送章节完成事件
   */
  async emitChapterCompleted(
    projectId: string,
    chapterNumber: number,
    wordCount: number,
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.CHAPTER_COMPLETED, {
      chapterNumber,
      wordCount,
    });
  }

  /**
   * 发送一致性检查事件
   */
  async emitConsistencyCheck(
    projectId: string,
    data: ConsistencyCheckData,
  ): Promise<void> {
    const event = data.passed
      ? WritingEventType.CONSISTENCY_CHECK_STARTED
      : WritingEventType.CONSISTENCY_ISSUES_FOUND;
    await this.emitToProject(projectId, event, data);
  }

  /**
   * 发送一致性修复事件
   */
  async emitConsistencyFix(
    projectId: string,
    chapterNumber: number,
    fixedIssues: number,
    status: "started" | "completed",
  ): Promise<void> {
    const event =
      status === "started"
        ? WritingEventType.CONSISTENCY_FIX_STARTED
        : WritingEventType.CONSISTENCY_FIX_COMPLETED;
    await this.emitToProject(projectId, event, {
      chapterNumber,
      fixedIssues,
    });
  }

  /**
   * 发送世界观建设事件
   * ★ 在 completed 时完成 preparation 阶段，开始 planning 阶段
   */
  async emitWorldBuilding(
    projectId: string,
    status: "started" | "completed",
    settings?: Record<string, unknown>,
    missionId?: string,
  ): Promise<void> {
    // ★ 阶段转换：preparation → planning
    if (status === "completed" && this.realtimeAdapter && missionId) {
      this.realtimeAdapter.completePhase(
        missionId,
        "preparation",
        "世界观建设完成",
      );
      this.realtimeAdapter.startPhase(missionId, "planning", "开始大纲规划");
    }

    const event =
      status === "started"
        ? WritingEventType.WORLD_BUILDING_STARTED
        : WritingEventType.WORLD_BUILDING_COMPLETED;
    await this.emitToProject(projectId, event, { missionId, settings });
  }

  /**
   * 发送 Leader 响应事件（多轮对话）
   */
  async emitLeaderResponse(
    projectId: string,
    missionId: string,
    response: string,
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.LEADER_RESPONSE, {
      missionId,
      response,
    });
  }

  /**
   * 发送守护者提取上下文事件
   */
  async emitKeeperExtractingContext(
    projectId: string,
    chapterNumber: number,
  ): Promise<void> {
    await this.emitToProject(
      projectId,
      WritingEventType.KEEPER_EXTRACTING_CONTEXT,
      { chapterNumber },
    );
  }

  /**
   * 发送守护者上下文就绪事件
   */
  async emitKeeperContextReady(
    projectId: string,
    chapterNumber: number,
    context: {
      relevantCharacters: string[];
      relevantLocations: string[];
      previousEvents: string[];
      warnings: string[];
    },
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.KEEPER_CONTEXT_READY, {
      chapterNumber,
      context,
    });
  }

  /**
   * 发送守护者更新圣经事件
   */
  async emitKeeperUpdatingBible(
    projectId: string,
    chapterNumber: number,
  ): Promise<void> {
    await this.emitToProject(
      projectId,
      WritingEventType.KEEPER_UPDATING_BIBLE,
      { chapterNumber },
    );
  }

  /**
   * 发送守护者圣经更新完成事件
   */
  async emitKeeperBibleUpdated(
    projectId: string,
    chapterNumber: number,
    updates: {
      newFacts: string[];
      characterUpdates: string[];
      timelineEvents: string[];
    },
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.KEEPER_BIBLE_UPDATED, {
      chapterNumber,
      updates,
    });
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
