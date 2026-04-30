/**
 * RerunLockRegistry — 防同 mission 同 todo 并发重跑
 *
 * 用户连点 2 次"重跑此任务"会创建 2 个并发本地重跑流，互相覆盖产物。
 * 用 Map<missionId, Set<todoId>> 锁住，第二次调用直接抛 BadRequestException。
 *
 * 设计：
 *   - in-memory（process-local）—— Railway 单进程足够；多实例时迁 Redis
 *   - 自动释放：finally 中 release()
 *   - mission 取消时 releaseAll() 清整个 mission 锁
 */

import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class RerunLockRegistry {
  private readonly log = new Logger(RerunLockRegistry.name);
  private readonly locks = new Map<string, Set<string>>();

  acquire(missionId: string, todoId: string): boolean {
    let todos = this.locks.get(missionId);
    if (!todos) {
      todos = new Set<string>();
      this.locks.set(missionId, todos);
    }
    if (todos.has(todoId)) {
      this.log.warn(
        `[rerun-lock] denied — mission=${missionId} todo=${todoId} already running`,
      );
      return false;
    }
    todos.add(todoId);
    return true;
  }

  release(missionId: string, todoId: string): void {
    const todos = this.locks.get(missionId);
    if (!todos) return;
    todos.delete(todoId);
    if (todos.size === 0) this.locks.delete(missionId);
  }

  releaseAll(missionId: string): void {
    this.locks.delete(missionId);
  }

  isLocked(missionId: string, todoId: string): boolean {
    return this.locks.get(missionId)?.has(todoId) ?? false;
  }
}
