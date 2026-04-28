/**
 * Writing Realtime Adapter
 *
 * 将 AI Writing 的实时事件需求适配到 AI Engine RealtimeModule
 * 提供统一的进度追踪和事件发射能力
 */

import { Injectable, Logger, OnModuleInit, Optional } from "@nestjs/common";
import { AgentFacade } from "@/modules/ai-harness/facade";
import type {
  RoomConfig,
  EngineEvent,
} from "@/modules/ai-harness/facade";
import { WritingEventType } from "./writing-event-emitter.service";

/**
 * 写作任务阶段定义
 */
const WRITING_PHASES = [
  { id: "preparation", name: "准备阶段", weight: 0.1 },
  { id: "planning", name: "大纲规划", weight: 0.1 },
  { id: "writing", name: "章节写作", weight: 0.6 },
  { id: "checking", name: "一致性检查", weight: 0.1 },
  { id: "editing", name: "编辑润色", weight: 0.1 },
];

/**
 * 单章节写作阶段定义
 */
const CHAPTER_PHASES = [
  { id: "context", name: "上下文提取", weight: 0.15 },
  { id: "drafting", name: "初稿写作", weight: 0.5 },
  { id: "consistency", name: "一致性检查", weight: 0.2 },
  { id: "revision", name: "修订完善", weight: 0.15 },
];

@Injectable()
export class WritingRealtimeAdapter implements OnModuleInit {
  private readonly logger = new Logger(WritingRealtimeAdapter.name);

  constructor(@Optional() private readonly agentFacade?: AgentFacade) {}

  onModuleInit() {
    this.logger.log(
      "WritingRealtimeAdapter initialized - using AI Engine RealtimeModule",
    );
  }

  /**
   * 创建项目房间配置
   */
  private createProjectRoomConfig(projectId: string): RoomConfig {
    return {
      roomId: `writing:project:${projectId}`,
      roomType: "project",
      entityId: projectId,
    };
  }

  /**
   * 创建任务房间配置
   */
  private createMissionRoomConfig(missionId: string): RoomConfig {
    return {
      roomId: `writing:mission:${missionId}`,
      roomType: "mission",
      entityId: missionId,
    };
  }

  // ==================== 进度追踪 ====================

  /**
   * 启动任务进度追踪
   */
  startMissionTracking(projectId: string, missionId: string): void {
    const roomConfig = this.createMissionRoomConfig(missionId);

    this.agentFacade?.realtimeProgress?.create({
      id: missionId,
      type: "writing_mission",
      name: `写作任务 ${missionId}`,
      roomConfig,
      phases: WRITING_PHASES,
      metadata: { projectId },
    });

    this.agentFacade?.realtimeProgress?.start(missionId);
    this.logger.debug(`Started tracking writing mission ${missionId}`);
  }

  /**
   * 启动章节写作进度追踪
   */
  startChapterTracking(chapterId: string, missionId: string): void {
    const trackingId = `chapter:${chapterId}`;
    const roomConfig = this.createMissionRoomConfig(missionId);

    this.agentFacade?.realtimeProgress?.create({
      id: trackingId,
      type: "chapter_writing",
      name: `章节写作 ${chapterId}`,
      roomConfig,
      phases: CHAPTER_PHASES,
      metadata: { chapterId, missionId },
    });

    this.agentFacade?.realtimeProgress?.start(trackingId);
    this.logger.debug(`Started tracking chapter ${chapterId}`);
  }

  /**
   * 开始阶段
   */
  startPhase(trackingId: string, phaseId: string, message?: string): void {
    this.agentFacade?.realtimeProgress?.startPhase(
      trackingId,
      phaseId,
      message,
    );
  }

  /**
   * 更新任务阶段进度
   */
  updateMissionProgress(
    missionId: string,
    phase: string,
    progress: number,
    message?: string,
  ): number {
    this.agentFacade?.realtimeProgress?.updatePhaseProgress(
      missionId,
      phase,
      progress,
      message,
    );
    const progressEvent =
      this.agentFacade?.realtimeProgress?.getProgress(missionId);
    return progressEvent?.progress ?? 0;
  }

  /**
   * 更新章节写作进度
   */
  updateChapterProgress(
    chapterId: string,
    phase: string,
    progress: number,
    message?: string,
  ): number {
    const trackingId = `chapter:${chapterId}`;
    this.agentFacade?.realtimeProgress?.updatePhaseProgress(
      trackingId,
      phase,
      progress,
      message,
    );
    const progressEvent =
      this.agentFacade?.realtimeProgress?.getProgress(trackingId);
    return progressEvent?.progress ?? 0;
  }

  /**
   * 完成阶段
   */
  completePhase(trackingId: string, phaseId: string, message?: string): void {
    this.agentFacade?.realtimeProgress?.completePhase(
      trackingId,
      phaseId,
      message,
    );
  }

  /**
   * 完成任务追踪
   */
  completeMissionTracking(missionId: string, message?: string): void {
    this.agentFacade?.realtimeProgress?.complete(missionId, message);
    this.logger.debug(`Completed tracking for mission ${missionId}`);
  }

  /**
   * 完成章节追踪
   */
  completeChapterTracking(chapterId: string, message?: string): void {
    const trackingId = `chapter:${chapterId}`;
    this.agentFacade?.realtimeProgress?.complete(trackingId, message);
    this.logger.debug(`Completed tracking for chapter ${chapterId}`);
  }

  /**
   * 任务失败
   */
  failMissionTracking(missionId: string, error: string): void {
    this.agentFacade?.realtimeProgress?.fail(missionId, error);
  }

  // ==================== 事件发射 ====================

  /**
   * 创建引擎事件
   */
  private createEvent<T>(
    type: string,
    payload: T,
    projectId?: string,
    missionId?: string,
  ): EngineEvent<T> {
    return {
      type,
      payload,
      metadata: {
        timestamp: new Date(),
        source: "writing",
        correlationId: missionId,
        sessionId: projectId,
      },
    };
  }

  /**
   * 发送事件到项目房间
   */
  emitToProject<T>(projectId: string, eventType: string, data: T): void {
    const roomConfig = this.createProjectRoomConfig(projectId);
    const event = this.createEvent(eventType, data, projectId);
    this.agentFacade?.realtimeEmitter?.emitToRoom(roomConfig, event);
  }

  /**
   * 发送事件到任务房间
   */
  emitToMission<T>(missionId: string, eventType: string, data: T): void {
    const roomConfig = this.createMissionRoomConfig(missionId);
    const event = this.createEvent(eventType, data, undefined, missionId);
    this.agentFacade?.realtimeEmitter?.emitToRoom(roomConfig, event);
  }

  /**
   * 同时发送到项目和任务房间
   */
  emitToBoth<T>(
    projectId: string,
    missionId: string,
    eventType: string,
    data: T,
  ): void {
    this.emitToProject(projectId, eventType, data);
    this.emitToMission(missionId, eventType, data);
  }

  // ==================== 便捷方法 ====================

  /**
   * 发送任务开始事件
   */
  emitMissionStarted(
    projectId: string,
    missionId: string,
    missionType: string,
    targetWordCount: number,
  ): void {
    this.startMissionTracking(projectId, missionId);
    this.startPhase(missionId, "preparation", "准备写作任务");

    this.emitToBoth(projectId, missionId, WritingEventType.MISSION_STARTED, {
      missionId,
      missionType,
      targetWordCount,
      message: "写作任务已启动...",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送进度更新事件
   */
  emitMissionProgress(
    projectId: string,
    missionId: string,
    phase: string,
    phaseProgress: number,
    currentStep: string,
    activeAgents: string[],
  ): void {
    const overall = this.updateMissionProgress(
      missionId,
      phase,
      phaseProgress,
      currentStep,
    );

    this.emitToBoth(projectId, missionId, WritingEventType.MISSION_PROGRESS, {
      missionId,
      phase,
      phaseProgress,
      progress: overall,
      currentStep,
      activeAgents,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送任务完成事件
   */
  emitMissionCompleted(
    projectId: string,
    missionId: string,
    totalWords: number,
    totalChapters: number,
    totalVolumes: number,
  ): void {
    this.completeMissionTracking(missionId, "写作完成");

    this.emitToBoth(projectId, missionId, WritingEventType.MISSION_COMPLETED, {
      missionId,
      totalWords,
      totalChapters,
      totalVolumes,
      message: `写作完成：${totalChapters} 章，${totalWords} 字`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送任务失败事件
   */
  emitMissionFailed(projectId: string, missionId: string, error: string): void {
    this.failMissionTracking(missionId, error);

    this.emitToBoth(projectId, missionId, WritingEventType.MISSION_FAILED, {
      missionId,
      error,
      message: `写作失败: ${error}`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送章节开始事件
   */
  emitChapterStarted(
    projectId: string,
    missionId: string,
    chapterId: string,
    chapterNumber: number,
    title: string,
    volumeIndex: number,
  ): void {
    this.startChapterTracking(chapterId, missionId);
    this.startPhase(`chapter:${chapterId}`, "context", "提取上下文");

    this.emitToBoth(projectId, missionId, WritingEventType.CHAPTER_STARTED, {
      chapterId,
      chapterNumber,
      title,
      volumeIndex,
      message: `开始写作第 ${chapterNumber} 章：${title}`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送章节内容事件
   */
  emitChapterContent(
    projectId: string,
    missionId: string,
    chapterId: string,
    chapterNumber: number,
    title: string,
    content: string,
    wordCount: number,
    volumeIndex: number,
  ): void {
    this.completePhase(`chapter:${chapterId}`, "drafting", "初稿完成");

    this.emitToBoth(projectId, missionId, WritingEventType.CHAPTER_CONTENT, {
      chapterId,
      chapterNumber,
      title,
      content,
      wordCount,
      volumeIndex,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送章节完成事件
   */
  emitChapterCompleted(
    projectId: string,
    missionId: string,
    chapterId: string,
    chapterNumber: number,
    wordCount: number,
  ): void {
    this.completeChapterTracking(chapterId, "章节完成");

    this.emitToBoth(projectId, missionId, WritingEventType.CHAPTER_COMPLETED, {
      chapterId,
      chapterNumber,
      wordCount,
      message: `第 ${chapterNumber} 章完成，${wordCount} 字`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送 Agent 工作状态事件
   */
  emitAgentWorking(
    projectId: string,
    missionId: string,
    agentData: {
      agentId: string;
      agentName: string;
      agentRole: "architect" | "keeper" | "writer" | "checker" | "editor";
      status: "working" | "completed" | "failed";
      taskDescription?: string;
      progress?: number;
    },
  ): void {
    this.emitToBoth(projectId, missionId, WritingEventType.AGENT_WORKING, {
      ...agentData,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送一致性检查事件
   */
  emitConsistencyCheck(
    projectId: string,
    missionId: string,
    chapterId: string,
    chapterNumber: number,
    passed: boolean,
    issues: Array<{
      type: string;
      severity: "error" | "warning" | "info";
      description: string;
      suggestion?: string;
    }>,
  ): void {
    this.completePhase(`chapter:${chapterId}`, "consistency", "一致性检查完成");

    const event = passed
      ? WritingEventType.CONSISTENCY_CHECK_STARTED
      : WritingEventType.CONSISTENCY_ISSUES_FOUND;

    this.emitToBoth(projectId, missionId, event, {
      chapterId,
      chapterNumber,
      passed,
      issues,
      message: passed
        ? `第 ${chapterNumber} 章一致性检查通过`
        : `第 ${chapterNumber} 章发现 ${issues.length} 个一致性问题`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送 Leader 响应事件
   */
  emitLeaderResponse(
    projectId: string,
    missionId: string,
    response: string,
  ): void {
    this.emitToBoth(projectId, missionId, WritingEventType.LEADER_RESPONSE, {
      missionId,
      response,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送守护者上下文就绪事件
   */
  emitKeeperContextReady(
    projectId: string,
    missionId: string,
    chapterId: string,
    chapterNumber: number,
    context: {
      relevantCharacters: string[];
      relevantLocations: string[];
      previousEvents: string[];
      warnings: string[];
    },
  ): void {
    this.completePhase(`chapter:${chapterId}`, "context", "上下文准备就绪");

    this.emitToBoth(
      projectId,
      missionId,
      WritingEventType.KEEPER_CONTEXT_READY,
      {
        chapterId,
        chapterNumber,
        context,
        message: `第 ${chapterNumber} 章上下文准备就绪`,
        timestamp: new Date().toISOString(),
      },
    );
  }

  // ==================== 订阅管理 ====================

  /**
   * 订阅项目事件
   */
  subscribeToProject(
    projectId: string,
    callback: (eventType: string, data: unknown) => void,
  ): () => void {
    const unsubscribers = Object.values(WritingEventType).map((eventType) =>
      this.agentFacade?.realtimeEmitter?.subscribe(
        eventType,
        (event: EngineEvent) => {
          if (event.metadata?.sessionId === projectId) {
            callback(event.type, event.payload);
          }
        },
      ),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub?.());
    };
  }

  /**
   * 订阅任务事件
   */
  subscribeToMission(
    missionId: string,
    callback: (eventType: string, data: unknown) => void,
  ): () => void {
    const unsubscribers = Object.values(WritingEventType).map((eventType) =>
      this.agentFacade?.realtimeEmitter?.subscribe(
        eventType,
        (event: EngineEvent) => {
          if (event.metadata?.correlationId === missionId) {
            callback(event.type, event.payload);
          }
        },
      ),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub?.());
    };
  }
}
