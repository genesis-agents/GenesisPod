/**
 * Writing Event Emitter Service
 *
 * 参考 AI Teams 的 TopicEventEmitterService 设计
 * 提供实时事件广播能力
 */

import { Injectable, Logger } from "@nestjs/common";

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

  /**
   * 注册事件发射处理器（由 Gateway 调用）
   */
  registerEmitHandler(handler: WritingEmitHandler): void {
    this.emitHandler = handler;
    this.logger.log("Writing emit handler registered");
  }

  /**
   * 发射事件到项目
   */
  async emitToProject(
    projectId: string,
    event: WritingEventType | string,
    data: unknown,
  ): Promise<void> {
    if (!this.emitHandler) {
      this.logger.debug(`No emit handler registered, skipping event: ${event}`);
      return;
    }

    try {
      await this.emitHandler(projectId, event, {
        timestamp: new Date().toISOString(),
        ...this.normalizeEventData(data),
      });
    } catch (error) {
      this.logger.error(`Failed to emit event ${event}:`, error);
    }
  }

  /**
   * 发送任务开始事件
   */
  async emitMissionStarted(
    projectId: string,
    missionId: string,
    missionType: string,
    targetWordCount: number,
  ): Promise<void> {
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
   */
  async emitMissionCompleted(
    projectId: string,
    missionId: string,
    totalWords: number,
    totalChapters: number,
    totalVolumes: number,
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.MISSION_COMPLETED, {
      missionId,
      totalWords,
      totalChapters,
      totalVolumes,
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
   */
  async emitChapterStarted(
    projectId: string,
    chapterNumber: number,
    title: string,
    volumeIndex: number,
  ): Promise<void> {
    await this.emitToProject(projectId, WritingEventType.CHAPTER_STARTED, {
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
   */
  async emitWorldBuilding(
    projectId: string,
    status: "started" | "completed",
    settings?: Record<string, unknown>,
  ): Promise<void> {
    const event =
      status === "started"
        ? WritingEventType.WORLD_BUILDING_STARTED
        : WritingEventType.WORLD_BUILDING_COMPLETED;
    await this.emitToProject(projectId, event, { settings });
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
