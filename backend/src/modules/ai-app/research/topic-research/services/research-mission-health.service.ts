/**
 * Research Mission Health Service
 *
 * 健康检测服务 - 检测卡死的研究任务并进行恢复
 * 参考 AI Writing 模块的 WritingMissionHealthCheckService 实现
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import {
  ResearchMissionStatus,
  ResearchTaskStatus,
  ResearchTodoStatus,
} from "@prisma/client";
import { ResearchEventEmitterService } from "./research-event-emitter.service";

// ==================== Configuration ====================

/**
 * Health check configuration
 */
const HEALTH_CHECK_CONFIG = {
  /** Check interval: 5 minutes */
  checkIntervalMs: 5 * 60 * 1000,

  /** Stuck threshold: 30 minutes without progress */
  stuckThresholdMs: 30 * 60 * 1000,

  /** Maximum execution time: 2 hours */
  maxExecutionTimeMs: 2 * 60 * 60 * 1000,

  /** Max retries before giving up */
  maxRetries: 3,
} as const;

// ==================== Types ====================

export interface HealthCheckResult {
  checkedAt: Date;
  totalMissions: number;
  stuckMissions: number;
  recoveredMissions: number;
  failedMissions: number;
  details: MissionHealthDetail[];
}

export interface MissionHealthDetail {
  missionId: string;
  topicId: string;
  status: ResearchMissionStatus;
  startedAt: Date | null;
  lastActivityAt: Date | null;
  stuckDurationMs: number;
  action: "none" | "marked_failed" | "recovery_attempted";
  reason?: string;
}

export interface MissionHealthStatus {
  missionId: string;
  isHealthy: boolean;
  status: ResearchMissionStatus;
  progress: number;
  startedAt: Date | null;
  lastActivityAt: Date | null;
  stuckDurationMs: number;
  estimatedRecoveryPossible: boolean;
  issues: string[];
}

// ==================== Service ====================

@Injectable()
export class ResearchMissionHealthService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ResearchMissionHealthService.name);
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: ResearchEventEmitterService,
  ) {}

  /**
   * Module initialization - start health check loop
   */
  onModuleInit(): void {
    this.startHealthCheckLoop();
    this.logger.log(
      `Health check service started with ${HEALTH_CHECK_CONFIG.checkIntervalMs / 1000}s interval`,
    );
  }

  /**
   * Module destruction - stop health check loop
   */
  onModuleDestroy(): void {
    this.stopHealthCheckLoop();
    this.logger.log("Health check service stopped");
  }

  /**
   * Start the health check loop
   */
  private startHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      return;
    }

    // Run immediately on startup
    this.runHealthCheck().catch((err) => {
      this.logger.error(`Initial health check failed: ${err.message}`);
    });

    // Set up interval
    this.healthCheckInterval = setInterval(() => {
      this.runHealthCheck().catch((err) => {
        this.logger.error(`Scheduled health check failed: ${err.message}`);
      });
    }, HEALTH_CHECK_CONFIG.checkIntervalMs);
  }

  /**
   * Stop the health check loop
   */
  private stopHealthCheckLoop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Run a health check on all active missions
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    if (this.isRunning) {
      this.logger.debug("Health check already running, skipping");
      return {
        checkedAt: new Date(),
        totalMissions: 0,
        stuckMissions: 0,
        recoveredMissions: 0,
        failedMissions: 0,
        details: [],
      };
    }

    this.isRunning = true;
    this.logger.log("Starting health check...");

    try {
      const result: HealthCheckResult = {
        checkedAt: new Date(),
        totalMissions: 0,
        stuckMissions: 0,
        recoveredMissions: 0,
        failedMissions: 0,
        details: [],
      };

      // Find all active missions (PLANNING, EXECUTING, REVIEWING)
      const activeMissions = await this.prisma.researchMission.findMany({
        where: {
          status: {
            in: [
              ResearchMissionStatus.PLANNING,
              ResearchMissionStatus.EXECUTING,
              ResearchMissionStatus.REVIEWING,
            ],
          },
        },
        include: {
          tasks: {
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      });

      result.totalMissions = activeMissions.length;

      if (activeMissions.length === 0) {
        this.logger.log("Health check: No active missions found");
        return result;
      }

      const now = new Date();

      for (const mission of activeMissions) {
        const detail = await this.checkMissionHealth(mission, now);
        result.details.push(detail);

        if (detail.action === "marked_failed") {
          result.stuckMissions++;
          result.failedMissions++;
        } else if (detail.action === "recovery_attempted") {
          result.stuckMissions++;
          result.recoveredMissions++;
        }
      }

      if (result.stuckMissions > 0) {
        this.logger.warn(
          `Health check completed: ${result.stuckMissions} stuck missions found, ` +
            `${result.recoveredMissions} recovered, ${result.failedMissions} marked as failed`,
        );
      } else {
        this.logger.log(
          `Health check completed: ${result.totalMissions} active missions, all healthy`,
        );
      }

      return result;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check health of a single mission
   */
  private async checkMissionHealth(
    mission: any,
    now: Date,
  ): Promise<MissionHealthDetail> {
    const detail: MissionHealthDetail = {
      missionId: mission.id,
      topicId: mission.topicId,
      status: mission.status,
      startedAt: mission.startedAt,
      lastActivityAt: this.getLastActivityTime(mission),
      stuckDurationMs: 0,
      action: "none",
    };

    // Calculate stuck duration
    const lastActivity = detail.lastActivityAt || mission.createdAt;
    detail.stuckDurationMs = now.getTime() - new Date(lastActivity).getTime();

    // Check if mission has exceeded max execution time
    const executionTime = mission.startedAt
      ? now.getTime() - new Date(mission.startedAt).getTime()
      : detail.stuckDurationMs;

    if (executionTime > HEALTH_CHECK_CONFIG.maxExecutionTimeMs) {
      // Mark as failed due to timeout
      await this.markMissionFailed(
        mission,
        `研究任务执行超时（超过 ${Math.round(HEALTH_CHECK_CONFIG.maxExecutionTimeMs / 1000 / 60)} 分钟）`,
      );
      detail.action = "marked_failed";
      detail.reason = "Execution timeout exceeded";
      return detail;
    }

    // Check if mission is stuck
    if (detail.stuckDurationMs > HEALTH_CHECK_CONFIG.stuckThresholdMs) {
      // Mission is stuck - mark as failed
      await this.markMissionFailed(
        mission,
        `研究任务卡死（${Math.round(detail.stuckDurationMs / 1000 / 60)} 分钟无进展）`,
      );
      detail.action = "marked_failed";
      detail.reason = "No progress for extended period";
      return detail;
    }

    return detail;
  }

  /**
   * Get the last activity time from mission or tasks
   */
  private getLastActivityTime(mission: any): Date | null {
    const times: Date[] = [];

    if (mission.updatedAt) times.push(new Date(mission.updatedAt));

    if (mission.tasks?.[0]?.updatedAt) {
      times.push(new Date(mission.tasks[0].updatedAt));
    }

    if (times.length === 0) return null;

    return new Date(Math.max(...times.map((t) => t.getTime())));
  }

  /**
   * Mark a mission as failed
   */
  private async markMissionFailed(mission: any, reason: string): Promise<void> {
    this.logger.warn(`Marking mission ${mission.id} as failed: ${reason}`);

    // Update mission status
    await this.prisma.researchMission.update({
      where: { id: mission.id },
      data: {
        status: ResearchMissionStatus.FAILED,
        completedAt: new Date(),
      },
    });

    // Update all non-completed tasks to failed
    await this.prisma.researchTask.updateMany({
      where: {
        missionId: mission.id,
        status: {
          notIn: [ResearchTaskStatus.COMPLETED, ResearchTaskStatus.FAILED],
        },
      },
      data: {
        status: ResearchTaskStatus.FAILED,
        resultSummary: reason,
        completedAt: new Date(),
      },
    });

    // Update all non-completed todos to failed
    await this.prisma.researchTodo.updateMany({
      where: {
        missionId: mission.id,
        status: {
          notIn: [
            ResearchTodoStatus.COMPLETED,
            ResearchTodoStatus.CANCELLED,
            ResearchTodoStatus.FAILED,
          ],
        },
      },
      data: {
        status: ResearchTodoStatus.FAILED,
        statusMessage: reason,
        completedAt: new Date(),
      },
    });

    // Emit failure event
    await this.eventEmitter.emitMissionFailed(
      mission.topicId,
      mission.id,
      reason,
    );
  }

  /**
   * Get health status for a specific mission
   */
  async getMissionHealthStatus(
    missionId: string,
  ): Promise<MissionHealthStatus> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: {
        tasks: true,
      },
    });

    if (!mission) {
      throw new Error(`Mission ${missionId} not found`);
    }

    const now = new Date();
    const lastActivity = this.getLastActivityTime(mission) || mission.createdAt;
    const stuckDurationMs = now.getTime() - new Date(lastActivity).getTime();

    const issues: string[] = [];

    // Check various health conditions
    const isStuck = stuckDurationMs > HEALTH_CHECK_CONFIG.stuckThresholdMs;
    if (isStuck) {
      issues.push(
        `任务卡死 ${Math.round(stuckDurationMs / 1000 / 60)} 分钟无进展`,
      );
    }

    const executionTime = mission.startedAt
      ? now.getTime() - new Date(mission.startedAt).getTime()
      : stuckDurationMs;

    if (executionTime > HEALTH_CHECK_CONFIG.maxExecutionTimeMs) {
      issues.push(
        `执行时间超过 ${Math.round(HEALTH_CHECK_CONFIG.maxExecutionTimeMs / 1000 / 60)} 分钟`,
      );
    }

    // Check if any tasks are stuck
    const stuckTasks = mission.tasks.filter((task) => {
      if (task.status !== ResearchTaskStatus.EXECUTING) return false;
      if (!task.startedAt) return false;
      const taskDuration = now.getTime() - new Date(task.startedAt).getTime();
      return taskDuration > HEALTH_CHECK_CONFIG.stuckThresholdMs;
    });

    if (stuckTasks.length > 0) {
      issues.push(`${stuckTasks.length} 个任务执行时间过长`);
    }

    const isHealthy =
      mission.status !== ResearchMissionStatus.FAILED &&
      mission.status !== ResearchMissionStatus.CANCELLED &&
      issues.length === 0;

    // Determine if recovery is possible
    const completedTasks = mission.tasks.filter(
      (t) => t.status === ResearchTaskStatus.COMPLETED,
    );
    const estimatedRecoveryPossible =
      completedTasks.length > 0 ||
      mission.status === ResearchMissionStatus.PLANNING;

    return {
      missionId: mission.id,
      isHealthy,
      status: mission.status,
      progress: mission.progressPercent,
      startedAt: mission.startedAt,
      lastActivityAt: lastActivity,
      stuckDurationMs,
      estimatedRecoveryPossible,
      issues,
    };
  }

  /**
   * Check if a mission can be resumed
   */
  async canResume(missionId: string): Promise<boolean> {
    const mission = await this.prisma.researchMission.findUnique({
      where: { id: missionId },
      include: { tasks: true },
    });

    if (!mission) return false;

    // Can only resume failed or cancelled missions
    if (
      mission.status !== ResearchMissionStatus.FAILED &&
      mission.status !== ResearchMissionStatus.CANCELLED
    ) {
      return false;
    }

    // Check if there are any completed tasks (partial progress)
    const completedTasks = mission.tasks.filter(
      (t) => t.status === ResearchTaskStatus.COMPLETED,
    );

    return completedTasks.length > 0;
  }

  /**
   * Get configuration for external use
   */
  getConfig(): typeof HEALTH_CHECK_CONFIG {
    return { ...HEALTH_CHECK_CONFIG };
  }

  /**
   * Force a health check (for testing or manual trigger)
   */
  async forceHealthCheck(): Promise<HealthCheckResult> {
    return this.runHealthCheck();
  }
}
