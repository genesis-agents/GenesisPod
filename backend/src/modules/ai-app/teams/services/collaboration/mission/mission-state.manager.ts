/**
 * Mission State Manager
 *
 * 统一管理 Mission 执行过程中的并发控制状态
 * - 使用 Map 替代 Set 以支持 TTL
 * - 定期清理超时项防止内存泄漏
 * - 服务重启时自动清理过期状态
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";

/**
 * 状态项接口，包含开始时间用于 TTL 计算
 */
interface StateEntry {
  startTime: number;
  description?: string;
}

/**
 * 状态统计信息
 */
export interface StateStats {
  executingTasks: number;
  executingMissions: number;
  revisingTasks: number;
  oldestTaskAge: number | null; // 最老任务的年龄（毫秒）
  oldestMissionAge: number | null;
  oldestRevisionAge: number | null;
}

@Injectable()
export class MissionStateManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MissionStateManager.name);

  // ==================== 状态存储 ====================

  /**
   * 正在执行的任务 (taskId -> StateEntry)
   */
  private readonly executingTasks = new Map<string, StateEntry>();

  /**
   * 正在执行 executeNextTasks 的 Mission (missionId -> StateEntry)
   */
  private readonly executingMissions = new Map<string, StateEntry>();

  /**
   * 正在执行修订的任务 (taskId -> StateEntry)
   */
  private readonly revisingTasks = new Map<string, StateEntry>();

  // ==================== 配置 ====================

  /**
   * 状态超时时间（30 分钟）
   * 超过此时间的状态会被自动清理
   */
  private readonly STATE_TTL_MS = 30 * 60 * 1000;

  /**
   * 清理间隔（5 分钟）
   */
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  /**
   * 清理定时器
   */
  private cleanupInterval: NodeJS.Timeout | null = null;

  // ==================== 生命周期 ====================

  onModuleInit(): void {
    this.logger.log(
      `[MissionStateManager] Initializing with TTL=${this.STATE_TTL_MS}ms, cleanup interval=${this.CLEANUP_INTERVAL_MS}ms`,
    );
    this.startCleanupScheduler();
  }

  onModuleDestroy(): void {
    this.logger.log(`[MissionStateManager] Shutting down`);
    this.stopCleanupScheduler();
  }

  // ==================== 任务执行状态 ====================

  /**
   * 标记任务开始执行
   */
  startTask(taskId: string, description?: string): boolean {
    if (this.executingTasks.has(taskId)) {
      this.logger.warn(
        `[MissionStateManager] Task ${taskId} already executing`,
      );
      return false;
    }

    this.executingTasks.set(taskId, {
      startTime: Date.now(),
      description,
    });
    this.logger.debug(
      `[MissionStateManager] Task ${taskId} started. Active tasks: ${this.executingTasks.size}`,
    );
    return true;
  }

  /**
   * 标记任务执行完成
   */
  finishTask(taskId: string): void {
    if (this.executingTasks.delete(taskId)) {
      this.logger.debug(
        `[MissionStateManager] Task ${taskId} finished. Active tasks: ${this.executingTasks.size}`,
      );
    }
  }

  /**
   * 检查任务是否正在执行
   */
  isTaskExecuting(taskId: string): boolean {
    return this.executingTasks.has(taskId);
  }

  // ==================== Mission 执行状态 ====================

  /**
   * 标记 Mission 开始执行 executeNextTasks
   */
  startMissionExecution(missionId: string, description?: string): boolean {
    if (this.executingMissions.has(missionId)) {
      this.logger.warn(
        `[MissionStateManager] Mission ${missionId} already executing`,
      );
      return false;
    }

    this.executingMissions.set(missionId, {
      startTime: Date.now(),
      description,
    });
    this.logger.debug(
      `[MissionStateManager] Mission ${missionId} execution started. Active missions: ${this.executingMissions.size}`,
    );
    return true;
  }

  /**
   * 标记 Mission 执行完成
   */
  finishMissionExecution(missionId: string): void {
    if (this.executingMissions.delete(missionId)) {
      this.logger.debug(
        `[MissionStateManager] Mission ${missionId} execution finished. Active missions: ${this.executingMissions.size}`,
      );
    }
  }

  /**
   * 检查 Mission 是否正在执行
   */
  isMissionExecuting(missionId: string): boolean {
    return this.executingMissions.has(missionId);
  }

  // ==================== 任务修订状态 ====================

  /**
   * 标记任务开始修订
   */
  startRevision(taskId: string, description?: string): boolean {
    if (this.revisingTasks.has(taskId)) {
      this.logger.warn(
        `[MissionStateManager] Task ${taskId} already being revised`,
      );
      return false;
    }

    this.revisingTasks.set(taskId, {
      startTime: Date.now(),
      description,
    });
    this.logger.debug(
      `[MissionStateManager] Task ${taskId} revision started. Active revisions: ${this.revisingTasks.size}`,
    );
    return true;
  }

  /**
   * 标记任务修订完成
   */
  finishRevision(taskId: string): void {
    if (this.revisingTasks.delete(taskId)) {
      this.logger.debug(
        `[MissionStateManager] Task ${taskId} revision finished. Active revisions: ${this.revisingTasks.size}`,
      );
    }
  }

  /**
   * 检查任务是否正在修订
   */
  isRevisionInProgress(taskId: string): boolean {
    return this.revisingTasks.has(taskId);
  }

  // ==================== 统计和调试 ====================

  /**
   * 获取状态统计信息
   */
  getStats(): StateStats {
    const now = Date.now();

    const getOldestAge = (map: Map<string, StateEntry>): number | null => {
      if (map.size === 0) return null;
      let oldest = now;
      for (const entry of map.values()) {
        if (entry.startTime < oldest) {
          oldest = entry.startTime;
        }
      }
      return now - oldest;
    };

    return {
      executingTasks: this.executingTasks.size,
      executingMissions: this.executingMissions.size,
      revisingTasks: this.revisingTasks.size,
      oldestTaskAge: getOldestAge(this.executingTasks),
      oldestMissionAge: getOldestAge(this.executingMissions),
      oldestRevisionAge: getOldestAge(this.revisingTasks),
    };
  }

  /**
   * 获取所有正在执行的任务 ID
   */
  getExecutingTaskIds(): string[] {
    return Array.from(this.executingTasks.keys());
  }

  /**
   * 获取所有正在执行的 Mission ID
   */
  getExecutingMissionIds(): string[] {
    return Array.from(this.executingMissions.keys());
  }

  /**
   * 获取所有正在修订的任务 ID
   */
  getRevisingTaskIds(): string[] {
    return Array.from(this.revisingTasks.keys());
  }

  // ==================== 清理逻辑 ====================

  /**
   * 启动定期清理调度器
   */
  private startCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates();
    }, this.CLEANUP_INTERVAL_MS);

    this.logger.log(
      `[MissionStateManager] Cleanup scheduler started (interval: ${this.CLEANUP_INTERVAL_MS}ms)`,
    );
  }

  /**
   * 停止清理调度器
   */
  private stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log(`[MissionStateManager] Cleanup scheduler stopped`);
    }
  }

  /**
   * 清理超时的状态项
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    let cleanedCount = 0;

    // 清理超时的执行中任务
    for (const [taskId, entry] of this.executingTasks) {
      if (now - entry.startTime > this.STATE_TTL_MS) {
        this.executingTasks.delete(taskId);
        cleanedCount++;
        this.logger.warn(
          `[MissionStateManager] Cleaned expired task state: ${taskId} (age: ${Math.round((now - entry.startTime) / 1000 / 60)}min)`,
        );
      }
    }

    // 清理超时的执行中 Mission
    for (const [missionId, entry] of this.executingMissions) {
      if (now - entry.startTime > this.STATE_TTL_MS) {
        this.executingMissions.delete(missionId);
        cleanedCount++;
        this.logger.warn(
          `[MissionStateManager] Cleaned expired mission state: ${missionId} (age: ${Math.round((now - entry.startTime) / 1000 / 60)}min)`,
        );
      }
    }

    // 清理超时的修订中任务
    for (const [taskId, entry] of this.revisingTasks) {
      if (now - entry.startTime > this.STATE_TTL_MS) {
        this.revisingTasks.delete(taskId);
        cleanedCount++;
        this.logger.warn(
          `[MissionStateManager] Cleaned expired revision state: ${taskId} (age: ${Math.round((now - entry.startTime) / 1000 / 60)}min)`,
        );
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(
        `[MissionStateManager] Cleanup completed: removed ${cleanedCount} expired states`,
      );
    }
  }

  /**
   * 强制清理所有状态（用于测试或紧急情况）
   */
  forceCleanAll(): void {
    const stats = this.getStats();
    this.executingTasks.clear();
    this.executingMissions.clear();
    this.revisingTasks.clear();
    this.logger.warn(
      `[MissionStateManager] Force cleaned all states: ${JSON.stringify(stats)}`,
    );
  }

  /**
   * 手动触发清理（用于 admin 操作）
   */
  triggerCleanup(): { before: StateStats; after: StateStats } {
    const before = this.getStats();
    this.cleanupExpiredStates();
    const after = this.getStats();
    return { before, after };
  }
}
