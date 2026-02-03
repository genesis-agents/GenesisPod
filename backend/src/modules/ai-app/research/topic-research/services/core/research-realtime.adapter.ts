/**
 * Research Realtime Adapter
 *
 * 将 AI Research 的实时事件需求适配到 AI Engine RealtimeModule
 * 提供统一的进度追踪和事件发射能力
 */

import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EngineEventEmitterService } from "@/modules/ai-engine/realtime/services/engine-event-emitter.service";
import { ProgressTrackerService } from "@/modules/ai-engine/realtime/services/progress-tracker.service";
import {
  RoomConfig,
  EngineEvent,
} from "@/modules/ai-engine/realtime/abstractions/event-emitter.interface";
import { ResearchEventType } from "./research-event-emitter.service";

/**
 * 研究任务阶段定义
 */
const RESEARCH_PHASES = [
  { id: "planning", name: "Leader 规划", weight: 0.1 },
  { id: "researching", name: "维度研究", weight: 0.6 },
  { id: "reviewing", name: "质量审查", weight: 0.15 },
  { id: "synthesizing", name: "报告撰写", weight: 0.15 },
];

/**
 * 快速研究阶段定义
 */
const QUICK_RESEARCH_PHASES = [
  { id: "planning", name: "Leader 规划", weight: 0.15 },
  { id: "researching", name: "维度研究", weight: 0.7 },
  { id: "synthesizing", name: "报告撰写", weight: 0.15 },
];

@Injectable()
export class ResearchRealtimeAdapter implements OnModuleInit {
  private readonly logger = new Logger(ResearchRealtimeAdapter.name);

  constructor(
    private readonly engineEmitter: EngineEventEmitterService,
    private readonly progressTracker: ProgressTrackerService,
  ) {}

  onModuleInit() {
    this.logger.log(
      "ResearchRealtimeAdapter initialized - using AI Engine RealtimeModule",
    );
  }

  /**
   * 创建专题房间配置
   */
  private createTopicRoomConfig(topicId: string): RoomConfig {
    return {
      roomId: `research:topic:${topicId}`,
      roomType: "topic",
      entityId: topicId,
    };
  }

  /**
   * 创建任务房间配置
   */
  private createMissionRoomConfig(missionId: string): RoomConfig {
    return {
      roomId: `research:mission:${missionId}`,
      roomType: "mission",
      entityId: missionId,
    };
  }

  // ==================== 进度追踪 ====================

  /**
   * 启动任务进度追踪
   */
  startMissionTracking(
    topicId: string,
    missionId: string,
    isQuickMode: boolean = false,
  ): void {
    const phases = isQuickMode ? QUICK_RESEARCH_PHASES : RESEARCH_PHASES;
    const roomConfig = this.createMissionRoomConfig(missionId);

    this.progressTracker.create({
      id: missionId,
      type: "research_mission",
      name: `研究任务 ${missionId}`,
      roomConfig,
      phases,
      metadata: { topicId, isQuickMode },
    });

    this.progressTracker.start(missionId);
    this.logger.debug(
      `Started tracking mission ${missionId} with ${phases.length} phases`,
    );
  }

  /**
   * 开始阶段
   */
  startPhase(missionId: string, phaseId: string, message?: string): void {
    this.progressTracker.startPhase(missionId, phaseId, message);
  }

  /**
   * 更新阶段进度
   * @returns 当前总体进度
   */
  updatePhaseProgress(
    missionId: string,
    phaseId: string,
    progress: number,
    message?: string,
  ): number {
    this.progressTracker.updatePhaseProgress(
      missionId,
      phaseId,
      progress,
      message,
    );
    const progressEvent = this.progressTracker.getProgress(missionId);
    return progressEvent?.progress ?? 0;
  }

  /**
   * 完成阶段
   */
  completePhase(missionId: string, phaseId: string, message?: string): void {
    this.progressTracker.completePhase(missionId, phaseId, message);
  }

  /**
   * 获取当前进度
   */
  getMissionProgress(missionId: string): number {
    const progress = this.progressTracker.getProgress(missionId);
    return progress?.progress ?? 0;
  }

  /**
   * 完成任务追踪
   */
  completeMissionTracking(missionId: string, message?: string): void {
    this.progressTracker.complete(missionId, message);
    this.logger.debug(`Completed tracking for mission ${missionId}`);
  }

  /**
   * 任务失败
   */
  failMissionTracking(missionId: string, error: string): void {
    this.progressTracker.fail(missionId, error);
    this.logger.debug(`Failed tracking for mission ${missionId}: ${error}`);
  }

  // ==================== 事件发射 ====================

  /**
   * 创建引擎事件
   */
  private createEvent<T>(
    type: string,
    payload: T,
    topicId?: string,
    missionId?: string,
  ): EngineEvent<T> {
    return {
      type,
      payload,
      metadata: {
        timestamp: new Date(),
        source: "research",
        correlationId: missionId,
        sessionId: topicId,
      },
    };
  }

  /**
   * 发送事件到专题房间
   */
  emitToTopic<T>(topicId: string, eventType: string, data: T): void {
    const roomConfig = this.createTopicRoomConfig(topicId);
    const event = this.createEvent(eventType, data, topicId);
    this.engineEmitter.emitToRoom(roomConfig, event);
  }

  /**
   * 发送事件到任务房间
   */
  emitToMission<T>(missionId: string, eventType: string, data: T): void {
    const roomConfig = this.createMissionRoomConfig(missionId);
    const event = this.createEvent(eventType, data, undefined, missionId);
    this.engineEmitter.emitToRoom(roomConfig, event);
  }

  /**
   * 同时发送到专题和任务房间
   */
  emitToBoth<T>(
    topicId: string,
    missionId: string,
    eventType: string,
    data: T,
  ): void {
    this.emitToTopic(topicId, eventType, data);
    this.emitToMission(missionId, eventType, data);
  }

  // ==================== 便捷方法 ====================

  /**
   * 发送任务开始事件
   */
  emitMissionStarted(
    topicId: string,
    missionId: string,
    leaderModel?: string,
    isQuickMode: boolean = false,
  ): void {
    this.startMissionTracking(topicId, missionId, isQuickMode);
    this.startPhase(missionId, "planning", "Leader 开始规划");

    this.emitToBoth(topicId, missionId, ResearchEventType.MISSION_STARTED, {
      missionId,
      leaderModel,
      message: "研究任务已启动，Leader 正在分析...",
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送进度更新事件（带进度追踪）
   */
  emitMissionProgress(
    topicId: string,
    missionId: string,
    phase: string,
    phaseProgress: number,
    message: string,
    extras?: Record<string, unknown>,
  ): void {
    const overall = this.updatePhaseProgress(
      missionId,
      phase,
      phaseProgress,
      message,
    );

    this.emitToBoth(topicId, missionId, ResearchEventType.MISSION_PROGRESS, {
      missionId,
      phase,
      phaseProgress,
      progress: overall,
      message,
      timestamp: new Date().toISOString(),
      ...extras,
    });
  }

  /**
   * 发送任务完成事件
   */
  emitMissionCompleted(
    topicId: string,
    missionId: string,
    stats: {
      completedTasks: number;
      totalTasks: number;
      totalWords?: number;
    },
  ): void {
    this.completeMissionTracking(missionId, "研究完成");

    this.emitToBoth(topicId, missionId, ResearchEventType.MISSION_COMPLETED, {
      missionId,
      ...stats,
      message: `研究完成，共完成 ${stats.completedTasks} 个任务`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送任务失败事件
   */
  emitMissionFailed(topicId: string, missionId: string, error: string): void {
    this.failMissionTracking(missionId, error);

    this.emitToBoth(topicId, missionId, ResearchEventType.MISSION_FAILED, {
      missionId,
      error,
      message: `研究失败: ${error}`,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 发送维度研究进度事件
   */
  emitDimensionProgress(
    topicId: string,
    missionId: string,
    dimensionName: string,
    progress: number,
    currentStep: string,
  ): void {
    const overall = this.updatePhaseProgress(
      missionId,
      "researching",
      progress,
      currentStep,
    );

    this.emitToBoth(
      topicId,
      missionId,
      ResearchEventType.DIMENSION_RESEARCH_PROGRESS,
      {
        dimensionName,
        progress,
        currentStep,
        overallProgress: overall,
        message: `「${dimensionName}」研究进度 ${progress}%`,
        timestamp: new Date().toISOString(),
      },
    );
  }

  /**
   * 发送 Agent 工作状态事件
   */
  emitAgentWorking(
    topicId: string,
    missionId: string,
    agentData: {
      agentId: string;
      agentName: string;
      agentRole: string;
      status: "working" | "completed" | "failed";
      taskDescription?: string;
      progress?: number;
      modelId?: string;
    },
  ): void {
    this.emitToBoth(topicId, missionId, ResearchEventType.AGENT_WORKING, {
      ...agentData,
      timestamp: new Date().toISOString(),
    });
  }

  // ==================== 订阅管理 ====================

  /**
   * 订阅专题事件
   * @returns 取消订阅函数
   */
  subscribeToTopic(
    topicId: string,
    callback: (eventType: string, data: unknown) => void,
  ): () => void {
    // 订阅所有研究相关事件
    const unsubscribers = Object.values(ResearchEventType).map((eventType) =>
      this.engineEmitter.subscribe(eventType, (event: EngineEvent) => {
        // 检查事件是否属于该专题
        if (event.metadata?.sessionId === topicId) {
          callback(event.type, event.payload);
        }
      }),
    );

    // 加入房间（如果有 socket）
    // Note: 实际的 socket join 由 Gateway 处理

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * 订阅任务事件
   * @returns 取消订阅函数
   */
  subscribeToMission(
    missionId: string,
    callback: (eventType: string, data: unknown) => void,
  ): () => void {
    const unsubscribers = Object.values(ResearchEventType).map((eventType) =>
      this.engineEmitter.subscribe(eventType, (event: EngineEvent) => {
        if (event.metadata?.correlationId === missionId) {
          callback(event.type, event.payload);
        }
      }),
    );

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }
}
