// @blueprint:domain
/**
 * BaseMissionController —— 共享 ownership / store 注入 + assertOwnership helper
 *
 * 2026-05-15 PR-C god-class 拆分：原 agent-playground.controller.ts (856 行)
 * 拆为 3 个聚焦 controller，共享 assertOwnership 行为。NestJS 装饰器在子类
 * 工作正常，本类不带 @Controller 装饰器，仅作 abstract base。
 */

import { ForbiddenException } from "@nestjs/common";
import { MissionOwnershipRegistry } from "@/modules/ai-harness/facade";
import { MissionStore } from "../../mission/lifecycle/mission-store.service";

export abstract class BaseMissionController {
  constructor(
    protected readonly ownership: MissionOwnershipRegistry,
    protected readonly store: MissionStore,
  ) {}

  /**
   * 双层 ownership：先查内存 registry（fast path），miss 时回退查 DB。
   * Railway recycle 后 in-memory registry 清空，但 mission 在 DB 中仍存在，
   * 不应该让用户看不到自己的历史 mission。
   */
  protected async assertOwnership(
    missionId: string,
    userId?: string,
  ): Promise<void> {
    if (!userId) throw new ForbiddenException("Authentication required");
    const owner = this.ownership.getOwner(missionId);
    if (owner) {
      if (owner !== userId) {
        throw new ForbiddenException(`mission ${missionId} not owned by you`);
      }
      return;
    }
    // Fallback: registry miss → 查 DB
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted) {
      throw new ForbiddenException(`mission ${missionId} not found`);
    }
    // DB 命中 → 重新登记 in-memory（下次 hot path），保留 ownership
    this.ownership.assign(missionId, userId);
  }
}
