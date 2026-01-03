/**
 * Coding Task Service
 *
 * 将 AI Coding 多智能体流程与 ai-agents 任务持久化能力整合
 * 支持任务状态保存、断点恢复、事件流
 */

import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { Subject, Observable } from "rxjs";
import { filter, map } from "rxjs/operators";
import { AiCodingProjectStatus, Prisma } from "@prisma/client";
import {
  ProjectEventEmitterService,
  ProjectProgressEvent,
} from "./project-event-emitter.service";

/**
 * 任务阶段
 */
export enum CodingTaskPhase {
  INIT = "init",
  PM = "pm",
  ARCHITECT = "architect",
  PM_LEAD = "pm_lead",
  ENGINEER = "engineer",
  QA = "qa",
  DOCUMENT = "document",
  COMPLETE = "complete",
}

/**
 * 任务检查点
 */
export interface TaskCheckpoint {
  phase: CodingTaskPhase;
  progress: number;
  outputs: Record<string, unknown>;
  agentStatus: Record<string, unknown>;
  timestamp: string;
}

/**
 * 任务事件
 */
export interface CodingTaskEvent {
  type:
    | "phase_start"
    | "phase_progress"
    | "phase_complete"
    | "error"
    | "complete";
  phase?: CodingTaskPhase;
  progress?: number;
  message?: string;
  data?: unknown;
  error?: string;
}

/**
 * 任务事件（带 projectId）
 */
interface ProjectTaskEvent {
  projectId: string;
  event: CodingTaskEvent;
}

@Injectable()
export class CodingTaskService {
  private readonly logger = new Logger(CodingTaskService.name);
  private readonly eventSubject = new Subject<ProjectTaskEvent>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: ProjectEventEmitterService,
  ) {}

  /**
   * 保存任务检查点
   */
  async saveCheckpoint(
    projectId: string,
    checkpoint: TaskCheckpoint,
  ): Promise<void> {
    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        checkpoint: checkpoint as unknown as Prisma.InputJsonValue,
        progress: checkpoint.progress,
        outputs: checkpoint.outputs as unknown as Prisma.InputJsonValue,
        agentStatus: checkpoint.agentStatus as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.debug(
      `Checkpoint saved for project ${projectId}: ${checkpoint.phase} (${checkpoint.progress}%)`,
    );
  }

  /**
   * 获取任务检查点
   */
  async getCheckpoint(projectId: string): Promise<TaskCheckpoint | null> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project?.checkpoint) {
      return null;
    }

    return project.checkpoint as unknown as TaskCheckpoint;
  }

  /**
   * 检查任务是否可以恢复
   */
  async canResume(projectId: string): Promise<{
    canResume: boolean;
    checkpoint?: TaskCheckpoint;
    reason?: string;
  }> {
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return { canResume: false, reason: "Project not found" };
    }

    // 只有 PROCESSING 或 FAILED 状态的项目可以恢复
    if (
      project.status !== AiCodingProjectStatus.PROCESSING &&
      project.status !== AiCodingProjectStatus.FAILED
    ) {
      return {
        canResume: false,
        reason: `Cannot resume project with status: ${project.status}`,
      };
    }

    const checkpoint = project.checkpoint as unknown as TaskCheckpoint | null;
    if (!checkpoint) {
      return {
        canResume: false,
        reason: "No checkpoint found",
      };
    }

    // 检查检查点是否过期（24小时）
    const checkpointTime = new Date(checkpoint.timestamp).getTime();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - checkpointTime > maxAge) {
      return {
        canResume: false,
        reason: "Checkpoint expired",
      };
    }

    return {
      canResume: true,
      checkpoint,
    };
  }

  /**
   * 获取下一个阶段
   */
  getNextPhase(currentPhase: CodingTaskPhase): CodingTaskPhase | null {
    const phases = [
      CodingTaskPhase.INIT,
      CodingTaskPhase.PM,
      CodingTaskPhase.ARCHITECT,
      CodingTaskPhase.PM_LEAD,
      CodingTaskPhase.ENGINEER,
      CodingTaskPhase.QA,
      CodingTaskPhase.DOCUMENT,
      CodingTaskPhase.COMPLETE,
    ];

    const currentIndex = phases.indexOf(currentPhase);
    if (currentIndex === -1 || currentIndex >= phases.length - 1) {
      return null;
    }

    return phases[currentIndex + 1];
  }

  /**
   * 获取阶段进度范围
   */
  getPhaseProgressRange(phase: CodingTaskPhase): {
    start: number;
    end: number;
  } {
    const ranges: Record<CodingTaskPhase, { start: number; end: number }> = {
      [CodingTaskPhase.INIT]: { start: 0, end: 5 },
      [CodingTaskPhase.PM]: { start: 5, end: 20 },
      [CodingTaskPhase.ARCHITECT]: { start: 20, end: 40 },
      [CodingTaskPhase.PM_LEAD]: { start: 40, end: 50 },
      [CodingTaskPhase.ENGINEER]: { start: 50, end: 80 },
      [CodingTaskPhase.QA]: { start: 80, end: 95 },
      [CodingTaskPhase.DOCUMENT]: { start: 95, end: 100 },
      [CodingTaskPhase.COMPLETE]: { start: 100, end: 100 },
    };
    return ranges[phase];
  }

  /**
   * 发布任务事件
   */
  publishEvent(projectId: string, event: CodingTaskEvent): void {
    this.eventSubject.next({ projectId, event });

    // 同时通过 WebSocket 发送
    if (event.phase) {
      const progressEvent: ProjectProgressEvent = {
        projectId,
        phase: event.phase,
        status:
          event.type === "phase_start"
            ? "started"
            : event.type === "phase_complete"
              ? "completed"
              : event.type === "error"
                ? "failed"
                : "progress",
        progress: event.progress || 0,
        message: event.message || "",
        data: event.data,
      };
      this.eventEmitter.emitProgress(progressEvent);
    }
  }

  /**
   * 获取任务事件流
   */
  getTaskStream(projectId: string): Observable<CodingTaskEvent> {
    return this.eventSubject.pipe(
      filter((te) => te.projectId === projectId),
      filter((te) => !!te.event),
      map((te) => te.event),
    );
  }

  /**
   * 标记阶段开始
   */
  async markPhaseStart(
    projectId: string,
    phase: CodingTaskPhase,
    message?: string,
  ): Promise<void> {
    const range = this.getPhaseProgressRange(phase);

    this.publishEvent(projectId, {
      type: "phase_start",
      phase,
      progress: range.start,
      message: message || `开始 ${phase} 阶段`,
    });

    await this.saveCheckpoint(projectId, {
      phase,
      progress: range.start,
      outputs: {},
      agentStatus: {
        [phase]: { status: "RUNNING", startedAt: new Date().toISOString() },
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 标记阶段完成
   */
  async markPhaseComplete(
    projectId: string,
    phase: CodingTaskPhase,
    outputs: Record<string, unknown>,
    message?: string,
  ): Promise<void> {
    const range = this.getPhaseProgressRange(phase);

    // 获取现有的 outputs
    const project = await this.prisma.aiCodingProject.findUnique({
      where: { id: projectId },
    });
    const existingOutputs = (project?.outputs || {}) as Record<string, unknown>;

    const mergedOutputs = { ...existingOutputs, ...outputs };

    this.publishEvent(projectId, {
      type: "phase_complete",
      phase,
      progress: range.end,
      message: message || `${phase} 阶段完成`,
      data: outputs,
    });

    await this.saveCheckpoint(projectId, {
      phase,
      progress: range.end,
      outputs: mergedOutputs,
      agentStatus: {
        [phase]: { status: "COMPLETED", completedAt: new Date().toISOString() },
      },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 标记阶段失败
   */
  async markPhaseFailed(
    projectId: string,
    phase: CodingTaskPhase,
    error: string,
  ): Promise<void> {
    this.publishEvent(projectId, {
      type: "error",
      phase,
      error,
      message: `${phase} 阶段失败: ${error}`,
    });

    // 更新项目状态为失败
    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        status: AiCodingProjectStatus.FAILED,
        errorMessage: error,
      },
    });
  }

  /**
   * 标记任务完成
   */
  async markTaskComplete(
    projectId: string,
    outputs: Record<string, unknown>,
  ): Promise<void> {
    this.publishEvent(projectId, {
      type: "complete",
      phase: CodingTaskPhase.COMPLETE,
      progress: 100,
      message: "项目生成完成！",
      data: outputs,
    });

    await this.prisma.aiCodingProject.update({
      where: { id: projectId },
      data: {
        status: AiCodingProjectStatus.COMPLETED,
        progress: 100,
        completedAt: new Date(),
        outputs: outputs as Prisma.InputJsonValue,
        checkpoint: Prisma.JsonNull, // 清除检查点
      },
    });

    // 发送完成事件
    await this.eventEmitter.emitComplete(projectId, true, outputs);
  }

  /**
   * 清理过期检查点
   */
  async cleanupExpiredCheckpoints(
    maxAge: number = 24 * 60 * 60 * 1000,
  ): Promise<number> {
    const expiredDate = new Date(Date.now() - maxAge);

    // 清除过期的检查点（将 checkpoint 设为 null）
    const result = await this.prisma.aiCodingProject.updateMany({
      where: {
        updatedAt: { lt: expiredDate },
        checkpoint: { not: Prisma.JsonNull },
        status: {
          in: [AiCodingProjectStatus.PROCESSING, AiCodingProjectStatus.FAILED],
        },
      },
      data: {
        checkpoint: Prisma.JsonNull,
      },
    });

    this.logger.log(`Cleaned up ${result.count} expired checkpoints`);
    return result.count;
  }
}
