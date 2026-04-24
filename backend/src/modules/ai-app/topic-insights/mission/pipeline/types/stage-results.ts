/**
 * StageResults — 上游 stage 输出的类型安全容器
 *
 * - set<T>(stageId, output): 保存 stage 输出
 * - get<T>(stageId): 强制类型读取；未完成抛错
 * - has(stageId): 存在性判断
 * - rebuild(missionId): 从 DB 读回所有上游 output（resume 用）
 *
 * 注意：rebuild 目前是 stub（无持久化绑定）；Tier Core 后续 PR
 * 会接入 stage.persist / 读回路径。
 */

import { StageDependencyError } from "./errors";
import type { StageId } from "./stage";

export class StageResults {
  private readonly results = new Map<StageId, unknown>();

  set<T>(stageId: StageId, output: T): void {
    this.results.set(stageId, output);
  }

  get<T>(stageId: StageId): T {
    if (!this.results.has(stageId)) {
      throw new StageDependencyError("pipeline", stageId);
    }
    return this.results.get(stageId) as T;
  }

  has(stageId: StageId): boolean {
    return this.results.has(stageId);
  }

  /** 清空（主要用于测试） */
  clear(): void {
    this.results.clear();
  }

  /**
   * Resume 时从 DB 读回 stage outputs 到本容器。
   * 当前为 stub —— 等 stage.persist 实现后再接入。
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async rebuild(_missionId: string): Promise<void> {
    // intentionally empty: Tier Core 后续 PR 接入真实 DB 读回路径
  }
}
