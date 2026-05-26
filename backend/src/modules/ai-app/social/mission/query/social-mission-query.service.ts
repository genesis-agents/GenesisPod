/**
 * SocialMissionQueryService — Canonical view input aggregator for social（B7-1）
 *
 * 落地依据：thinning plan §B7-1 / §6.5.1 rule 3 (ownership in QueryService).
 *
 * Mirror playground 的 MissionQueryService 模式，但 social pipeline 是
 * content-based 不是 dimension-based — 输入 row 字段不同。
 *
 * 当前 first cut：仅返回 row（基础投影所需）+ resume/rerun 状态依据
 * persisted status 简单判断。完整 ResumeRerunPolicyService for social
 * 排入 follow-up（plan §B7 readiness assessment §5）。
 */

import { ForbiddenException, Injectable } from "@nestjs/common";

import { SocialMissionStore } from "../lifecycle/social-mission-store.service";

export interface SocialMissionQueryInputs {
  mode: "starting-placeholder" | "row-loaded";
  missionId: string;
  row: Awaited<ReturnType<SocialMissionStore["getById"]>>;
}

@Injectable()
export class SocialMissionQueryService {
  constructor(private readonly store: SocialMissionStore) {}

  async loadInputs(
    missionId: string,
    userId: string | undefined,
  ): Promise<SocialMissionQueryInputs> {
    if (!userId) {
      throw new ForbiddenException("Authentication required");
    }
    const row = await this.store.getById(missionId, userId);
    if (!row) {
      // social 没有像 playground 那样的 in-memory ownership starting-placeholder
      // 路径 — content-based mission 直接 4xx，不返回占位
      throw new ForbiddenException(`mission ${missionId} not found`);
    }
    return { mode: "row-loaded", missionId, row };
  }
}
