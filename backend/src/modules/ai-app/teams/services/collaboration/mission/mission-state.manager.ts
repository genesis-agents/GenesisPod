/**
 * Mission State Manager
 *
 * 统一管理 Mission 执行过程中的并发控制状态
 *
 * ★ 重构后：作为 AI Engine ExecutionStateManager 的薄包装器
 *   - 保持原有接口不变（StateStats, 方法签名）
 *   - 委托给 ExecutionStateManager 执行
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  ExecutionStateManager,
  StateCategory,
  ExecutionStateStats,
} from "@/modules/ai-engine/orchestration/state-machine";

/**
 * 状态统计信息 (保持原有接口)
 * @deprecated 推荐直接使用 ExecutionStateStats
 */
export interface StateStats {
  executingTasks: number;
  executingMissions: number;
  revisingTasks: number;
  oldestTaskAge: number | null;
  oldestMissionAge: number | null;
  oldestRevisionAge: number | null;
}

/**
 * Mission 状态管理器
 *
 * 提供 Mission 专用的状态管理能力
 * 内部委托给 AI Engine 的 ExecutionStateManager
 */
@Injectable()
export class MissionStateManager {
  private readonly logger = new Logger(MissionStateManager.name);

  constructor(private readonly executionStateManager: ExecutionStateManager) {
    this.logger.log(
      "[MissionStateManager] Initialized (delegating to ExecutionStateManager)",
    );
  }

  // ==================== 任务执行状态 ====================

  /**
   * 标记任务开始执行
   */
  startTask(taskId: string, description?: string): boolean {
    return this.executionStateManager.startTask(taskId, description);
  }

  /**
   * 标记任务执行完成
   */
  finishTask(taskId: string): void {
    this.executionStateManager.finishTask(taskId);
  }

  /**
   * 检查任务是否正在执行
   */
  isTaskExecuting(taskId: string): boolean {
    return this.executionStateManager.isTaskExecuting(taskId);
  }

  // ==================== Mission 执行状态 ====================

  /**
   * 标记 Mission 开始执行 executeNextTasks
   */
  startMissionExecution(missionId: string, description?: string): boolean {
    return this.executionStateManager.startWorkflow(missionId, description);
  }

  /**
   * 标记 Mission 执行完成
   */
  finishMissionExecution(missionId: string): void {
    this.executionStateManager.finishWorkflow(missionId);
  }

  /**
   * 检查 Mission 是否正在执行
   */
  isMissionExecuting(missionId: string): boolean {
    return this.executionStateManager.isWorkflowExecuting(missionId);
  }

  // ==================== 任务修订状态 ====================

  /**
   * 标记任务开始修订
   */
  startRevision(taskId: string, description?: string): boolean {
    return this.executionStateManager.startRevision(taskId, description);
  }

  /**
   * 标记任务修订完成
   */
  finishRevision(taskId: string): void {
    this.executionStateManager.finishRevision(taskId);
  }

  /**
   * 检查任务是否正在修订
   */
  isRevisionInProgress(taskId: string): boolean {
    return this.executionStateManager.isRevisionInProgress(taskId);
  }

  // ==================== 统计和调试 ====================

  /**
   * 获取状态统计信息
   * 转换为原有的 StateStats 格式
   */
  getStats(): StateStats {
    const stats = this.executionStateManager.getStats();

    return {
      executingTasks: stats.activeCounts[StateCategory.TASK] || 0,
      executingMissions: stats.activeCounts[StateCategory.WORKFLOW] || 0,
      revisingTasks: stats.activeCounts[StateCategory.REVISION] || 0,
      oldestTaskAge: stats.oldestAges[StateCategory.TASK] ?? null,
      oldestMissionAge: stats.oldestAges[StateCategory.WORKFLOW] ?? null,
      oldestRevisionAge: stats.oldestAges[StateCategory.REVISION] ?? null,
    };
  }

  /**
   * 获取所有正在执行的任务 ID
   */
  getExecutingTaskIds(): string[] {
    return this.executionStateManager.getExecutingTaskIds();
  }

  /**
   * 获取所有正在执行的 Mission ID
   */
  getExecutingMissionIds(): string[] {
    return this.executionStateManager.getExecutingMissionIds();
  }

  /**
   * 获取所有正在修订的任务 ID
   */
  getRevisingTaskIds(): string[] {
    return this.executionStateManager.getRevisingTaskIds();
  }

  // ==================== 清理方法 ====================

  /**
   * 强制清理所有状态（用于测试或紧急情况）
   */
  forceCleanAll(): void {
    this.executionStateManager.forceCleanAll();
  }

  /**
   * 手动触发清理（用于 admin 操作）
   */
  triggerCleanup(): { before: StateStats; after: StateStats } {
    const result = this.executionStateManager.triggerCleanup();

    // 转换为 StateStats 格式
    const convertStats = (stats: ExecutionStateStats): StateStats => ({
      executingTasks: stats.activeCounts[StateCategory.TASK] || 0,
      executingMissions: stats.activeCounts[StateCategory.WORKFLOW] || 0,
      revisingTasks: stats.activeCounts[StateCategory.REVISION] || 0,
      oldestTaskAge: stats.oldestAges[StateCategory.TASK] ?? null,
      oldestMissionAge: stats.oldestAges[StateCategory.WORKFLOW] ?? null,
      oldestRevisionAge: stats.oldestAges[StateCategory.REVISION] ?? null,
    });

    return {
      before: convertStats(result.before),
      after: convertStats(result.after),
    };
  }
}
