/**
 * Social config snapshot —— C5/G7(2026-05-22,三 app 统一接入):social mission 在 openSession
 * 冻结 typed MissionConfigSnapshot,与 playground/radar 一致(统一契约)。
 *
 * 说明:social retry = 从 SocialContent 表重派生(不从 snapshot 重建输入),故只 buildForFreshRun
 * (无 rerun 变体)。snapshot 是 social mission 的 canonical 配置记录(单一真源)。
 */

import { randomUUID } from "crypto";
import {
  ResolvedBudgetCaps,
  type MissionConfigSnapshot,
} from "@/modules/ai-harness/facade";

export const SOCIAL_SNAPSHOT_SCHEMA_VERSION = 1;

/** social 业务输入子集(平台不解释)。topic(=contentId)/language/budget/runtimeLimits 在顶层。 */
export interface SocialBusinessInput {
  readonly contentId: string;
  readonly platforms: readonly string[];
  readonly connectionIds: Readonly<Record<string, string>>;
  readonly depth: string;
  readonly budgetProfile: string;
}

export type SocialConfigSnapshot = MissionConfigSnapshot<SocialBusinessInput>;

/** openSession 首跑冻结 social config snapshot。换算走 ResolvedBudgetCaps(唯一处)。 */
export function buildSocialConfigSnapshot(args: {
  businessInput: SocialBusinessInput;
  language: string;
  maxCredits: number;
  budgetMultiplier: number;
  wallTimeCapMs: number;
}): SocialConfigSnapshot {
  return {
    schemaVersion: SOCIAL_SNAPSHOT_SCHEMA_VERSION,
    snapshotRevision: 0,
    snapshotId: randomUUID(),
    mutationReason: "fresh",
    resolvedAt: new Date().toISOString(),
    topic: args.businessInput.contentId,
    language: args.language,
    businessInput: args.businessInput,
    budget: ResolvedBudgetCaps.resolve({
      maxCredits: args.maxCredits,
      budgetMultiplier: args.budgetMultiplier,
      source: "default",
    }),
    runtimeLimits: { wallTimeCapMs: args.wallTimeCapMs },
  };
}
