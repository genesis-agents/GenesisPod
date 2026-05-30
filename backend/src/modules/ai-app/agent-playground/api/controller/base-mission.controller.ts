/**
 * BaseMissionController —— 共享 ownership / store 注入 + assertOwnership helper
 *
 * 2026-05-15 PR-C god-class 拆分：原 agent-playground.controller.ts (856 行)
 * 拆为 3 个聚焦 controller，共享 assertOwnership 行为。NestJS 装饰器在子类
 * 工作正常，本类不带 @Controller 装饰器，仅作 abstract base。
 */

import { ForbiddenException } from "@nestjs/common";
import { ContentVisibility } from "@prisma/client";
import { MissionOwnershipRegistry } from "@/modules/ai-harness/facade";
import { assertResourceAccess } from "@/common/access/assert-resource-access";
import { MissionStore } from "../../mission/lifecycle/mission-store.service";

export abstract class BaseMissionController {
  constructor(
    protected readonly ownership: MissionOwnershipRegistry,
    protected readonly store: MissionStore,
  ) {}

  /**
   * 读访问守卫（IDOR 收口）：own ∨ SHARED+TopicMember ∨ PUBLIC，否则 404。
   *
   * 双层 ownership：先查内存 registry（fast path）—— 命中即为所有者直接放行；
   * miss 时回退查 DB（Railway recycle 后 in-memory registry 清空，但 mission
   * 在 DB 中仍存在，不应让用户看不到自己的历史 mission）。
   *
   * 自己的 mission（registry / getById 命中）= own 分支放行；非所有者的
   * SHARED/PUBLIC 放行经 `assertResourceAccess` 统一判定（404 不泄露存在性）。
   * 判定逻辑集中在 `common/access`，便于单测与跨 controller 复用。
   *
   * AgentPlaygroundMission 暂无 topicId（多租户走 workspaceId），故 SHARED 协作
   * 放行的 TopicMember 回调在本接入点未注入 —— util 已完整支持并单测，待 mission
   * 落地 topicId / 暴露 by-id 访问元信息后接线（见 risks）。
   *
   * ★ 写/取消/删除等变更操作请改用 {@link assertOwnership}（仅所有者）。
   */
  protected async assertReadAccess(
    missionId: string,
    userId?: string,
  ): Promise<void> {
    if (!userId) throw new ForbiddenException("Authentication required");
    // Fast path：registry 命中所有者 → 直接放行。
    if (this.ownership.getOwner(missionId) === userId) return;

    // 回退查 DB：getById 按 (id, userId) 过滤，命中即为所有者（own 分支）。
    const owned = await this.store.getById(missionId, userId);
    const ownerId = owned ? userId : undefined;
    if (ownerId) {
      // 重新登记 in-memory（下次 hot path），保留 ownership。
      this.ownership.assign(missionId, userId);
    }
    // 经 access 助手统一判定（own 命中即放行；否则按 visibility，目前 PRIVATE → 404）。
    await assertResourceAccess(
      {
        userId: ownerId ?? "",
        visibility: owned?.visibility ?? ContentVisibility.PRIVATE,
        topicId: null,
      },
      { userId },
    );
  }

  /**
   * 变更操作守卫：仅所有者放行（写/取消/删除）。沿用历史 403 语义。
   * Topic 角色（如 ADMIN 可代管）留待后续接入。
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
    // Fallback: registry miss → 查 DB（按 id+userId 过滤，命中即所有者）。
    const persisted = await this.store.getById(missionId, userId);
    if (!persisted) {
      throw new ForbiddenException(`mission ${missionId} not found`);
    }
    this.ownership.assign(missionId, userId);
  }
}
