/**
 * Mission Kernel Bridge Service
 *
 * 内核进程管理 + 进度追踪 + 事件日志 + 记忆 + 资源管理 + 调度器
 * 从 ResearchMissionService 拆分，降低 God Service 复杂度
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { MemoryLayer } from "@prisma/client";
import {
  MissionExecutorService,
  EventJournalService,
  KernelMemoryManagerService,
  ResourceManagerService,
  KernelSchedulerService,
} from "@/modules/ai-kernel/facade";
import { ProgressTrackerService } from "@/modules/ai-engine/facade";
import { LruMap } from "@/common/utils/lru-map";

@Injectable()
export class MissionKernelBridgeService {
  private readonly logger = new Logger(MissionKernelBridgeService.name);
  private readonly kernelProcessIds = new LruMap<string, string>(500);

  constructor(
    @Optional() private readonly missionExecutor?: MissionExecutorService,
    @Optional() private readonly progressTracker?: ProgressTrackerService,
    @Optional() private readonly kernelJournal?: EventJournalService,
    @Optional() private readonly kernelMemory?: KernelMemoryManagerService,
    @Optional() private readonly resourceManager?: ResourceManagerService,
    @Optional() private readonly kernelScheduler?: KernelSchedulerService,
  ) {}

  /**
   * 获取 missionId 对应的 kernel processId
   */
  getProcessId(missionId: string): string | undefined {
    return this.kernelProcessIds.get(missionId);
  }

  // ────────────────────────── Kernel Process ──────────────────────────

  /**
   * 初始化 Mission：spawn 进程 + 创建进度追踪 + 日志调度器统计
   */
  async initMission(params: {
    missionId: string;
    userId: string;
    topicId: string;
    topicName: string;
    mode: string;
    researchDepth: string;
  }): Promise<void> {
    const { missionId, userId, topicId, topicName, mode, researchDepth } =
      params;

    // ★ AI Kernel: 创建进程记录
    if (this.missionExecutor) {
      try {
        const kernelResult = await this.missionExecutor.execute({
          userId,
          agentId: "research-leader",
          teamSessionId: missionId,
          input: { topicId, mode, researchDepth, title: topicName },
        });
        this.kernelProcessIds.set(missionId, kernelResult.processId);
        this.logger.log(
          `[Kernel] Process ${kernelResult.processId} spawned for research mission ${missionId}`,
        );
        this.recordKernelEvent(missionId, "mission.started", {
          topicId,
          mode,
          researchDepth,
        });
      } catch (err) {
        this.logger.warn(
          `[Kernel] Failed to spawn process: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } else {
      this.logger.debug(
        "[Degraded] MissionExecutorService unavailable, skipping kernel process spawn",
      );
    }

    // ★ AI Kernel: 创建进度追踪
    if (this.progressTracker) {
      this.progressTracker.create({
        id: missionId,
        type: "research",
        name: `Research: ${topicName}`,
        roomConfig: {
          roomId: `mission:${missionId}`,
          roomType: "mission",
          entityId: missionId,
        },
        phases: [
          { id: "planning", name: "Research Planning", weight: 0.1 },
          { id: "researching", name: "Dimension Research", weight: 0.6 },
          { id: "reviewing", name: "Quality Review", weight: 0.15 },
          { id: "synthesizing", name: "Report Synthesis", weight: 0.15 },
        ],
      });
      this.progressTracker.start(missionId);
    } else {
      this.logger.debug(
        "[Degraded] ProgressTrackerService unavailable, skipping progress tracking",
      );
    }

    // ★ Batch 3: KernelScheduler — 记录调度器状态用于可观测性
    if (this.kernelScheduler) {
      void (async () => {
        try {
          const stats = await this.kernelScheduler!.getStats();
          this.logger.log(
            `[KernelScheduler] Stats at mission start: running=${stats.running}, ` +
              `ready=${stats.ready}, maxConcurrent=${stats.maxConcurrent}`,
          );
        } catch (e) {
          this.logger.debug(`KernelScheduler getStats failed: ${e}`);
        }
      })();
    } else {
      this.logger.debug(
        "[Degraded] KernelSchedulerService unavailable, skipping scheduler stats",
      );
    }
  }

  // ────────────────────────── Progress Tracking ──────────────────────────

  /**
   * 开始进度阶段
   */
  startPhase(missionId: string, phaseId: string): void {
    if (this.progressTracker) {
      this.progressTracker.startPhase(missionId, phaseId);
    } else {
      this.logger.debug(
        `[Degraded] ProgressTrackerService unavailable, skipping startPhase: ${phaseId}`,
      );
    }
  }

  /**
   * 完成进度阶段
   */
  completePhase(missionId: string, phaseId: string): void {
    if (this.progressTracker) {
      this.progressTracker.completePhase(missionId, phaseId);
    } else {
      this.logger.debug(
        `[Degraded] ProgressTrackerService unavailable, skipping completePhase: ${phaseId}`,
      );
    }
  }

  /**
   * 标记进度追踪失败
   */
  failTracking(missionId: string, errorMsg: string): void {
    if (this.progressTracker) {
      const task = this.progressTracker.getTask(missionId);
      if (task) {
        for (const phase of task.phases) {
          if (phase.status === "in_progress") {
            this.progressTracker.failPhase(missionId, phase.id, errorMsg);
          }
        }
      }
      this.progressTracker.fail(missionId, errorMsg);
    } else {
      this.logger.debug(
        `[Degraded] ProgressTrackerService unavailable, skipping failTracking: ${missionId}`,
      );
    }
  }

  /**
   * 标记进度追踪完成
   */
  completeTracking(missionId: string): void {
    if (this.progressTracker) {
      this.progressTracker.complete(missionId);
    } else {
      this.logger.debug(
        `[Degraded] ProgressTrackerService unavailable, skipping completeTracking: ${missionId}`,
      );
    }
  }

  // ────────────────────────── Kernel Events ──────────────────────────

  /**
   * 记录内核事件（fire-and-forget）
   */
  recordKernelEvent(
    missionId: string,
    type: string,
    payload?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.kernelJournal) {
      if (!this.kernelJournal) {
        this.logger.debug(
          `[Degraded] EventJournalService unavailable, skipping kernel event: ${type}`,
        );
      }
      return;
    }
    void this.kernelJournal
      .record(processId, type, payload)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Kernel] Failed to record event ${type}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
  }

  /**
   * 完成内核进程
   */
  completeKernelProcess(
    missionId: string,
    output?: Record<string, unknown>,
  ): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.missionExecutor) {
      if (!this.missionExecutor) {
        this.logger.debug(
          "[Degraded] MissionExecutorService unavailable, skipping process completion",
        );
      }
      return;
    }
    void this.missionExecutor
      .complete(processId, output)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Kernel] Failed to complete process: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.kernelProcessIds.delete(missionId);
  }

  /**
   * 标记内核进程失败
   */
  failKernelProcess(missionId: string, error: string): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.missionExecutor) {
      if (!this.missionExecutor) {
        this.logger.debug(
          "[Degraded] MissionExecutorService unavailable, skipping process failure",
        );
      }
      return;
    }
    void this.missionExecutor
      .fail(processId, error)
      .catch((err: unknown) =>
        this.logger.warn(
          `[Kernel] Failed to mark process as failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    this.kernelProcessIds.delete(missionId);
  }

  // ────────────────────────── Resource Management ──────────────────────────

  /**
   * 检查资源预算
   */
  async checkBudget(
    missionId: string,
  ): Promise<{ canProceed: boolean; reason?: string }> {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.resourceManager) {
      if (!this.resourceManager) {
        this.logger.debug(
          "[Degraded] ResourceManagerService unavailable, skipping budget check",
        );
      }
      return { canProceed: true };
    }
    try {
      return await this.resourceManager.checkBudget(processId);
    } catch (e) {
      this.logger.debug(`ResourceManager checkBudget failed: ${e}`);
      return { canProceed: true };
    }
  }

  /**
   * 记录资源消耗（fire-and-forget）
   */
  consumeResources(
    missionId: string,
    tokensUsed: number,
    costUsed: number,
  ): void {
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId || !this.resourceManager) {
      if (!this.resourceManager) {
        this.logger.debug(
          "[Degraded] ResourceManagerService unavailable, skipping resource consumption",
        );
      }
      return;
    }
    if (tokensUsed > 0) {
      void this.resourceManager
        .consume(processId, { tokensUsed, costUsed })
        .catch((e) =>
          this.logger.debug(`ResourceManager consume failed: ${e}`),
        );
    }
  }

  // ────────────────────────── Kernel Memory ──────────────────────────

  /**
   * 写入内核记忆（fire-and-forget）
   */
  writeMemory(params: {
    missionId: string;
    layer: MemoryLayer;
    key: string;
    value: unknown;
    expiresAt?: Date;
  }): void {
    const { missionId, layer, key, value, expiresAt } = params;
    if (!this.kernelMemory) {
      this.logger.debug(
        `[Degraded] KernelMemoryManagerService unavailable, skipping memory write: ${key}`,
      );
      return;
    }
    const processId = this.kernelProcessIds.get(missionId);
    if (!processId) return;
    void this.kernelMemory
      .write({ processId, layer, key, value, expiresAt })
      .catch((err) => this.logger.debug("Memory write failed", err));
  }
}
