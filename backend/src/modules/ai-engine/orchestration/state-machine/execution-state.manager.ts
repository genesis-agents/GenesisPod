/**
 * Execution State Manager
 *
 * 通用的任务执行状态管理器，提供：
 * - 并发任务执行跟踪
 * - 任务状态 TTL 管理
 * - 定期清理超时状态
 * - 状态统计和调试
 *
 * 使用场景：
 * - Mission 执行状态管理
 * - Agent 任务并发控制
 * - 长时间运行任务的生命周期管理
 *
 * ★ P4 沉淀：从 AI Teams MissionStateManager 提取的通用能力
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";

// ==================== 类型定义 ====================

/**
 * 状态项接口，包含开始时间用于 TTL 计算
 */
export interface StateEntry {
  startTime: number;
  description?: string;
  metadata?: Record<string, unknown>;
}

/**
 * 状态类别枚举
 */
export enum StateCategory {
  /** 任务执行 */
  TASK = "task",
  /** 工作流/Mission 执行 */
  WORKFLOW = "workflow",
  /** 修订/重试 */
  REVISION = "revision",
  /** 自定义类别 */
  CUSTOM = "custom",
}

/**
 * 状态统计信息
 */
export interface ExecutionStateStats {
  /** 各类别的活跃数量 */
  activeCounts: Record<StateCategory | string, number>;
  /** 各类别最老状态的年龄（毫秒） */
  oldestAges: Record<StateCategory | string, number | null>;
  /** 总活跃状态数 */
  totalActive: number;
  /** 清理配置 */
  config: {
    ttlMs: number;
    cleanupIntervalMs: number;
  };
}

/**
 * 状态管理配置
 */
export interface ExecutionStateConfig {
  /** 状态超时时间（毫秒） */
  ttlMs?: number;
  /** 清理间隔（毫秒） */
  cleanupIntervalMs?: number;
  /** 是否启用自动清理 */
  enableAutoCleanup?: boolean;
}

// ==================== 服务实现 ====================

@Injectable()
export class ExecutionStateManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExecutionStateManager.name);

  // ==================== 状态存储 ====================

  /**
   * 多类别状态存储: category -> (id -> StateEntry)
   */
  private readonly stateStore = new Map<string, Map<string, StateEntry>>();

  // ==================== 配置 ====================

  /** 状态超时时间（默认 30 分钟） */
  private ttlMs = 30 * 60 * 1000;

  /** 清理间隔（默认 5 分钟） */
  private cleanupIntervalMs = 5 * 60 * 1000;

  /** 是否启用自动清理 */
  private enableAutoCleanup = true;

  /** 清理定时器 */
  private cleanupInterval: NodeJS.Timeout | null = null;

  // ==================== 生命周期 ====================

  onModuleInit(): void {
    this.logger.log(
      `[ExecutionStateManager] Initializing with TTL=${this.ttlMs}ms, cleanup interval=${this.cleanupIntervalMs}ms`,
    );
    if (this.enableAutoCleanup) {
      this.startCleanupScheduler();
    }
  }

  onModuleDestroy(): void {
    this.logger.log(`[ExecutionStateManager] Shutting down`);
    this.stopCleanupScheduler();
  }

  /**
   * 配置状态管理器
   */
  configure(config: ExecutionStateConfig): void {
    if (config.ttlMs !== undefined) {
      this.ttlMs = config.ttlMs;
    }
    if (config.cleanupIntervalMs !== undefined) {
      this.cleanupIntervalMs = config.cleanupIntervalMs;
    }
    if (config.enableAutoCleanup !== undefined) {
      this.enableAutoCleanup = config.enableAutoCleanup;
      if (this.enableAutoCleanup) {
        this.startCleanupScheduler();
      } else {
        this.stopCleanupScheduler();
      }
    }
    this.logger.log(
      `[ExecutionStateManager] Configured: TTL=${this.ttlMs}ms, cleanup=${this.cleanupIntervalMs}ms, autoCleanup=${this.enableAutoCleanup}`,
    );
  }

  // ==================== 状态操作 API ====================

  /**
   * 开始跟踪一个状态
   * @returns true 如果成功开始，false 如果已存在
   */
  start(
    category: StateCategory | string,
    id: string,
    description?: string,
    metadata?: Record<string, unknown>,
  ): boolean {
    const categoryStore = this.getOrCreateCategory(category);

    if (categoryStore.has(id)) {
      this.logger.warn(
        `[ExecutionStateManager] ${category}:${id} already active`,
      );
      return false;
    }

    categoryStore.set(id, {
      startTime: Date.now(),
      description,
      metadata,
    });

    this.logger.debug(
      `[ExecutionStateManager] Started ${category}:${id}. Active in category: ${categoryStore.size}`,
    );
    return true;
  }

  /**
   * 结束跟踪一个状态
   */
  finish(category: StateCategory | string, id: string): void {
    const categoryStore = this.stateStore.get(category);
    if (categoryStore?.delete(id)) {
      this.logger.debug(
        `[ExecutionStateManager] Finished ${category}:${id}. Active in category: ${categoryStore.size}`,
      );
    }
  }

  /**
   * 检查状态是否活跃
   */
  isActive(category: StateCategory | string, id: string): boolean {
    return this.stateStore.get(category)?.has(id) ?? false;
  }

  /**
   * 获取状态信息
   */
  getState(
    category: StateCategory | string,
    id: string,
  ): StateEntry | undefined {
    return this.stateStore.get(category)?.get(id);
  }

  /**
   * 获取类别中所有活跃的 ID
   */
  getActiveIds(category: StateCategory | string): string[] {
    return Array.from(this.stateStore.get(category)?.keys() ?? []);
  }

  /**
   * 获取类别中所有活跃的状态
   */
  getActiveStates(
    category: StateCategory | string,
  ): Map<string, StateEntry> | undefined {
    return this.stateStore.get(category);
  }

  // ==================== 便捷方法 (兼容 MissionStateManager) ====================

  /** 开始任务执行 */
  startTask(taskId: string, description?: string): boolean {
    return this.start(StateCategory.TASK, taskId, description);
  }

  /** 结束任务执行 */
  finishTask(taskId: string): void {
    this.finish(StateCategory.TASK, taskId);
  }

  /** 检查任务是否正在执行 */
  isTaskExecuting(taskId: string): boolean {
    return this.isActive(StateCategory.TASK, taskId);
  }

  /** 开始工作流执行 */
  startWorkflow(workflowId: string, description?: string): boolean {
    return this.start(StateCategory.WORKFLOW, workflowId, description);
  }

  /** 结束工作流执行 */
  finishWorkflow(workflowId: string): void {
    this.finish(StateCategory.WORKFLOW, workflowId);
  }

  /** 检查工作流是否正在执行 */
  isWorkflowExecuting(workflowId: string): boolean {
    return this.isActive(StateCategory.WORKFLOW, workflowId);
  }

  /** 开始修订 */
  startRevision(taskId: string, description?: string): boolean {
    return this.start(StateCategory.REVISION, taskId, description);
  }

  /** 结束修订 */
  finishRevision(taskId: string): void {
    this.finish(StateCategory.REVISION, taskId);
  }

  /** 检查是否正在修订 */
  isRevisionInProgress(taskId: string): boolean {
    return this.isActive(StateCategory.REVISION, taskId);
  }

  // ==================== 统计和调试 ====================

  /**
   * 获取状态统计信息
   */
  getStats(): ExecutionStateStats {
    const now = Date.now();
    const activeCounts: Record<string, number> = {};
    const oldestAges: Record<string, number | null> = {};
    let totalActive = 0;

    for (const [category, store] of this.stateStore) {
      activeCounts[category] = store.size;
      totalActive += store.size;

      if (store.size === 0) {
        oldestAges[category] = null;
      } else {
        let oldest = now;
        for (const entry of store.values()) {
          if (entry.startTime < oldest) {
            oldest = entry.startTime;
          }
        }
        oldestAges[category] = now - oldest;
      }
    }

    return {
      activeCounts,
      oldestAges,
      totalActive,
      config: {
        ttlMs: this.ttlMs,
        cleanupIntervalMs: this.cleanupIntervalMs,
      },
    };
  }

  /**
   * 获取执行中任务 ID 列表 (兼容方法)
   */
  getExecutingTaskIds(): string[] {
    return this.getActiveIds(StateCategory.TASK);
  }

  /**
   * 获取执行中工作流 ID 列表 (兼容方法)
   */
  getExecutingMissionIds(): string[] {
    return this.getActiveIds(StateCategory.WORKFLOW);
  }

  /**
   * 获取正在修订的任务 ID 列表 (兼容方法)
   */
  getRevisingTaskIds(): string[] {
    return this.getActiveIds(StateCategory.REVISION);
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
    }, this.cleanupIntervalMs);

    this.logger.log(
      `[ExecutionStateManager] Cleanup scheduler started (interval: ${this.cleanupIntervalMs}ms)`,
    );
  }

  /**
   * 停止清理调度器
   */
  private stopCleanupScheduler(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger.log(`[ExecutionStateManager] Cleanup scheduler stopped`);
    }
  }

  /**
   * 清理超时的状态项
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [category, store] of this.stateStore) {
      for (const [id, entry] of store) {
        if (now - entry.startTime > this.ttlMs) {
          store.delete(id);
          cleanedCount++;
          this.logger.warn(
            `[ExecutionStateManager] Cleaned expired state: ${category}:${id} (age: ${Math.round((now - entry.startTime) / 1000 / 60)}min)`,
          );
        }
      }
    }

    if (cleanedCount > 0) {
      this.logger.log(
        `[ExecutionStateManager] Cleanup completed: removed ${cleanedCount} expired states`,
      );
    }
  }

  /**
   * 强制清理所有状态（用于测试或紧急情况）
   */
  forceCleanAll(): void {
    const stats = this.getStats();
    for (const store of this.stateStore.values()) {
      store.clear();
    }
    this.logger.warn(
      `[ExecutionStateManager] Force cleaned all states: ${JSON.stringify(stats)}`,
    );
  }

  /**
   * 清理指定类别的所有状态
   */
  clearCategory(category: StateCategory | string): void {
    const store = this.stateStore.get(category);
    if (store) {
      const count = store.size;
      store.clear();
      this.logger.log(
        `[ExecutionStateManager] Cleared ${count} states from category ${category}`,
      );
    }
  }

  /**
   * 手动触发清理（用于 admin 操作）
   */
  triggerCleanup(): {
    before: ExecutionStateStats;
    after: ExecutionStateStats;
  } {
    const before = this.getStats();
    this.cleanupExpiredStates();
    const after = this.getStats();
    return { before, after };
  }

  // ==================== 私有方法 ====================

  /**
   * 获取或创建类别存储
   */
  private getOrCreateCategory(category: string): Map<string, StateEntry> {
    let store = this.stateStore.get(category);
    if (!store) {
      store = new Map();
      this.stateStore.set(category, store);
    }
    return store;
  }
}
