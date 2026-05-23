/**
 * Radar config snapshot —— C5/G7(2026-05-22,三 app 统一接入):radar mission 在 openSession
 * 冻结 typed MissionConfigSnapshot,与 playground/social 一致(统一契约)。
 *
 * 说明:radar 当前 rerun = 限次重新触发(不从 snapshot 重建输入),故只提供 buildForFreshRun
 * (无 full/incremental/local 变体)——契约一致即可,不为不存在的 rerun-rebuild 造变体(YAGNI)。
 * snapshot 是 radar mission 的 canonical 配置记录(单一真源,getById 暴露)。
 */

import { randomUUID } from "crypto";
import {
  ResolvedBudgetCaps,
  type MissionConfigSnapshot,
} from "@/modules/ai-harness/facade";

export const RADAR_SNAPSHOT_SCHEMA_VERSION = 1;

/** radar 业务输入子集(平台不解释)。topic/budget/runtimeLimits 在 snapshot 顶层。 */
export interface RadarBusinessInput {
  readonly topicId: string;
  readonly topicName: string;
  readonly description?: string | null;
  readonly keywords?: string[];
  readonly entityType?: string | null;
  readonly refreshCron?: string;
  readonly trigger: string;
}

export type RadarConfigSnapshot = MissionConfigSnapshot<RadarBusinessInput>;

/** openSession 首跑冻结 radar config snapshot。换算走 ResolvedBudgetCaps(唯一处)。 */
export function buildRadarConfigSnapshot(args: {
  businessInput: RadarBusinessInput;
  language?: string;
  maxCredits: number;
  budgetMultiplier: number;
  wallTimeCapMs: number;
}): RadarConfigSnapshot {
  return {
    schemaVersion: RADAR_SNAPSHOT_SCHEMA_VERSION,
    snapshotRevision: 0,
    snapshotId: randomUUID(),
    mutationReason: "fresh",
    resolvedAt: new Date().toISOString(),
    topic: args.businessInput.topicName,
    language: args.language ?? "zh-CN",
    businessInput: args.businessInput,
    budget: ResolvedBudgetCaps.resolve({
      maxCredits: args.maxCredits,
      budgetMultiplier: args.budgetMultiplier,
      source: "default",
    }),
    runtimeLimits: { wallTimeCapMs: args.wallTimeCapMs },
  };
}
