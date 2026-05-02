/**
 * Progress Tracker Service
 * 进度追踪服务
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../realtime/abstractions/progress-tracker.interface";
import type { ProgressEvent } from "../realtime/abstractions/event-emitter.interface";
import { calculateOverallProgress } from "../realtime/abstractions/progress-tracker.interface";
import { EventBusService } from "./event-bus.service";

/**
 * 进度追踪服务
 */
@Injectable()
export class ProgressTrackerService implements IProgressTracker {
  private readonly logger = new Logger(ProgressTrackerService.name);
  private readonly tasks = new Map<string, TrackedTask>();
  private readonly callbacks = new Map<
    string,
    Map<string, (progress: ProgressEvent) => void>
  >();
  private readonly completeCallbacks = new Map<
    string,
    (task: TrackedTask) => void
  >();
  private readonly failCallbacks = new Map<
    string,
    (task: TrackedTask, error: string) => void
  >();
  private callbackCounter = 0;

  constructor(private readonly eventEmitter: EventBusService) {}

  /**
   * 创建任务追踪
   * ★ 如果任务已存在，直接返回现有任务（防止重复创建覆盖状态）
   */
  create(request: CreateTrackedTaskRequest): TrackedTask {
    // ★ 防止重复创建：如果任务已存在，直接返回
    const existingTask = this.tasks.get(request.id);
    if (existingTask) {
      this.logger.debug(`Task already exists, skipping create: ${request.id}`);
      return existingTask;
    }

    const phases: TaskPhase[] = request.phases.map((p, index) => ({
      id: p.id,
      name: p.name,
      order: index,
      weight: p.weight ?? 1,
      status: "pending",
    }));

    const task: TrackedTask = {
      id: request.id,
      type: request.type,
      name: request.name,
      roomConfig: request.roomConfig,
      phases,
      progress: 0,
      status: "pending",
      metadata: request.metadata,
    };

    this.tasks.set(request.id, task);
    this.callbacks.set(request.id, new Map());

    this.logger.debug(`Created task tracker: ${request.id} (${request.name})`);

    return task;
  }

  /**
   * 开始任务
   */
  start(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) {
      this.logger.warn(`Task ${taskId} not found`);
      return;
    }

    task.status = "running";
    task.startedAt = new Date();

    this.emitProgress(task, "任务开始");
  }

  /**
   * 开始阶段
   */
  startPhase(taskId: string, phaseId: string, message?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const phase = task.phases.find((p) => p.id === phaseId);
    if (!phase) {
      this.logger.warn(`Phase ${phaseId} not found in task ${taskId}`);
      return;
    }

    phase.status = "in_progress";
    phase.startedAt = new Date();
    task.currentPhaseId = phaseId;

    this.emitProgress(task, message ?? `开始: ${phase.name}`);
  }

  /**
   * 更新阶段进度
   */
  updatePhaseProgress(
    taskId: string,
    phaseId: string,
    progress: number,
    message?: string,
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    // 计算整体进度
    const phase = task.phases.find((p) => p.id === phaseId);
    if (phase) {
      // 根据阶段进度更新任务进度
      task.progress = this.calculateProgress(task, phaseId, progress);
    }

    this.emitProgress(task, message);
  }

  /**
   * 完成阶段
   */
  completePhase(taskId: string, phaseId: string, message?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const phase = task.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    phase.status = "completed";
    phase.completedAt = new Date();

    task.progress = calculateOverallProgress(task.phases);

    this.emitProgress(task, message ?? `完成: ${phase.name}`);
  }

  /**
   * 跳过阶段
   */
  skipPhase(taskId: string, phaseId: string, reason?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const phase = task.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    phase.status = "skipped";

    task.progress = calculateOverallProgress(task.phases);

    this.emitProgress(task, reason ?? `跳过: ${phase.name}`);
  }

  /**
   * 阶段失败
   */
  failPhase(taskId: string, phaseId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    const phase = task.phases.find((p) => p.id === phaseId);
    if (!phase) return;

    phase.status = "failed";
    phase.error = error;

    this.emitProgress(task, `失败: ${phase.name} - ${error}`);
  }

  /**
   * 完成任务
   */
  complete(taskId: string, message?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "completed";
    task.progress = 100;
    task.completedAt = new Date();

    this.emitProgress(task, message ?? "任务完成");

    // 触发完成回调
    const callback = this.completeCallbacks.get(taskId);
    if (callback) {
      callback(task);
      this.completeCallbacks.delete(taskId);
    }

    this.logger.debug(`Task completed: ${taskId}`);
  }

  /**
   * 任务失败
   */
  fail(taskId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "failed";
    task.error = error;
    task.completedAt = new Date();

    this.emitProgress(task, `任务失败: ${error}`);

    // 触发失败回调
    const callback = this.failCallbacks.get(taskId);
    if (callback) {
      callback(task, error);
      this.failCallbacks.delete(taskId);
    }

    this.logger.error(`Task failed: ${taskId} - ${error}`);
  }

  /**
   * 取消任务
   */
  cancel(taskId: string, reason?: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = "cancelled";
    task.completedAt = new Date();

    this.emitProgress(task, reason ?? "任务已取消");

    this.logger.debug(`Task cancelled: ${taskId}`);
  }

  /**
   * 获取当前进度
   */
  getProgress(taskId: string): ProgressEvent | null {
    const task = this.tasks.get(taskId);
    if (!task) return null;

    return this.createProgressEvent(task);
  }

  /**
   * 获取任务详情
   */
  getTask(taskId: string): TrackedTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * 获取所有活跃任务
   */
  getActiveTasks(): TrackedTask[] {
    return Array.from(this.tasks.values()).filter(
      (t) => t.status === "pending" || t.status === "running",
    );
  }

  /**
   * 清理已完成的任务
   * ★ 在清理前发送清理事件通知订阅者
   */
  cleanup(olderThan?: Date): number {
    const threshold = olderThan || new Date(Date.now() - 60 * 60 * 1000); // 默认 1 小时
    let cleaned = 0;

    for (const [id, task] of this.tasks) {
      if (
        ["completed", "failed", "cancelled"].includes(task.status) &&
        task.completedAt &&
        task.completedAt < threshold
      ) {
        // ★ 在删除前通知订阅者任务即将被清理
        const callbacks = this.callbacks.get(id);
        if (callbacks && callbacks.size > 0) {
          const cleanupProgress = this.createProgressEvent(
            task,
            "任务记录已清理",
          );
          for (const callback of callbacks.values()) {
            try {
              callback(cleanupProgress);
            } catch (error) {
              this.logger.error(
                `Cleanup notification callback error: ${error}`,
              );
            }
          }
        }

        this.tasks.delete(id);
        this.callbacks.delete(id);
        this.completeCallbacks.delete(id);
        this.failCallbacks.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} completed tasks`);
    }

    return cleaned;
  }

  /**
   * 设置进度回调
   */
  onProgress(
    taskId: string,
    callback: (progress: ProgressEvent) => void,
  ): () => void {
    const callbacks = this.callbacks.get(taskId);
    if (!callbacks) {
      this.logger.warn(`Task ${taskId} not found`);
      return () => {};
    }

    const callbackId = `cb_${++this.callbackCounter}`;
    callbacks.set(callbackId, callback);

    return () => {
      callbacks.delete(callbackId);
    };
  }

  /**
   * 设置任务完成回调
   */
  onComplete(
    taskId: string,
    callback: (task: TrackedTask) => void,
  ): () => void {
    this.completeCallbacks.set(taskId, callback);
    return () => {
      this.completeCallbacks.delete(taskId);
    };
  }

  /**
   * 设置任务失败回调
   */
  onFail(
    taskId: string,
    callback: (task: TrackedTask, error: string) => void,
  ): () => void {
    this.failCallbacks.set(taskId, callback);
    return () => {
      this.failCallbacks.delete(taskId);
    };
  }

  /**
   * 计算进度
   * ★ 添加进度参数边界检查
   */
  private calculateProgress(
    task: TrackedTask,
    currentPhaseId: string,
    phaseProgress: number,
  ): number {
    const phases = task.phases;
    const totalWeight = phases.reduce((sum, p) => sum + p.weight, 0);
    if (totalWeight === 0) return 0;

    // ★ 边界检查：确保进度在 0-100 范围内
    const safeProgress = Math.min(100, Math.max(0, phaseProgress));

    let completedWeight = 0;
    for (const phase of phases) {
      if (phase.status === "completed" || phase.status === "skipped") {
        completedWeight += phase.weight;
      } else if (phase.id === currentPhaseId) {
        completedWeight += phase.weight * (safeProgress / 100);
      }
    }

    return Math.round((completedWeight / totalWeight) * 100);
  }

  /**
   * 创建进度事件
   */
  private createProgressEvent(
    task: TrackedTask,
    message?: string,
  ): ProgressEvent {
    const currentPhase = task.currentPhaseId
      ? task.phases.find((p) => p.id === task.currentPhaseId)
      : null;

    return {
      taskId: task.id,
      taskType: task.type,
      phase: currentPhase?.name ?? "",
      progress: task.progress,
      message,
      currentStep:
        task.phases.filter((p) => p.status === "completed").length + 1,
      totalSteps: task.phases.length,
      details: {
        taskName: task.name,
        status: task.status,
      },
    };
  }

  /**
   * 发射进度事件
   */
  private emitProgress(task: TrackedTask, message?: string): void {
    const progress = this.createProgressEvent(task, message);

    // 发射到 WebSocket
    this.eventEmitter.emitProgress(task.roomConfig, progress);

    // 触发本地回调
    const callbacks = this.callbacks.get(task.id);
    if (callbacks) {
      for (const callback of callbacks.values()) {
        try {
          callback(progress);
        } catch (error) {
          this.logger.error(`Progress callback error: ${error}`);
        }
      }
    }
  }
}
