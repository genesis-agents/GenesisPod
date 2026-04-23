/**
 * StageRegistry — 存储所有已注册的 Stage
 *
 * 由各个 Stage 实现 module 在 onModuleInit 里 register，
 * Orchestrator 根据 depth / condition 从 registry 选出本次 mission 要跑的 stage。
 */

import { Injectable, Logger } from "@nestjs/common";
import type { Stage, StageId } from "./types";

@Injectable()
export class StageRegistry {
  private readonly logger = new Logger(StageRegistry.name);
  private readonly stages = new Map<StageId, Stage>();

  register(stage: Stage): void {
    if (this.stages.has(stage.id)) {
      this.logger.warn(
        `Stage ${stage.id} already registered; overwriting with "${stage.name}"`,
      );
    }
    this.stages.set(stage.id, stage);
  }

  get(id: StageId): Stage | undefined {
    return this.stages.get(id);
  }

  mustGet(id: StageId): Stage {
    const s = this.stages.get(id);
    if (!s) {
      throw new Error(`StageRegistry: stage ${id} not registered`);
    }
    return s;
  }

  all(): ReadonlyArray<Stage> {
    return Array.from(this.stages.values());
  }

  /** 列出已注册 stage id（便于 debug / SSE 展示） */
  listIds(): StageId[] {
    return Array.from(this.stages.keys());
  }

  /** 主要用于测试 */
  clear(): void {
    this.stages.clear();
  }
}
