/**
 * ResumeRerunPolicyService — Backend-authoritative resumable/rerunnable decisions（B2-1a）
 *
 * 落地依据：thinning plan
 *   §6.5.1 resume rules
 *   §6.5.1.b first-cut resume matrix by failure locus
 *   §6.5.2 / §6.5.2.a rerun semantics
 *   §5.3 configSnapshot canonical input source
 *
 * 设计：
 * - 纯计算服务（除注入 checkpoint store 外无 side effect）
 * - projector / query service 调用它，但本身不调 projector
 * - cascade 仍在 rerun controller / dispatcher 内决定；本服务仅 surface allowed + reason
 */

import { Injectable } from "@nestjs/common";

import type { RerunnableStageEntry } from "../../api/contracts/view-state.contract";
import type { MissionDetail } from "../lifecycle/mission-store.service";
import { PrismaMissionCheckpointStore } from "../lifecycle/prisma-mission-checkpoint.store";

// ============================================================================
// §6.5.1.b first-cut resume matrix（frontend stage id 为 key）
// ============================================================================

/** 14 个 canonical stage 的 resume 资格。 */
const STAGE_RESUME_MATRIX: Record<
  string,
  { allowedIfCheckpoint: boolean; reasonDenied?: string }
> = {
  "s1-budget": {
    allowedIfCheckpoint: false,
    reasonDenied: "cheap to restart, no meaningful checkpoint value",
  },
  "s2-leader-plan": { allowedIfCheckpoint: true },
  "s3-researchers": { allowedIfCheckpoint: true },
  "s4-leader-assess": { allowedIfCheckpoint: true },
  "s5-reconciler": { allowedIfCheckpoint: true },
  "s6-analyst": { allowedIfCheckpoint: true },
  "s7-writer-outline": { allowedIfCheckpoint: true },
  "s8-writer-draft": { allowedIfCheckpoint: true },
  "s8b-quality-enhancement": { allowedIfCheckpoint: true },
  "s9-critic-l4": { allowedIfCheckpoint: true },
  "s9b-objective-evaluation": { allowedIfCheckpoint: true },
  "s10-leader-signoff": { allowedIfCheckpoint: true },
  "s11-persist": {
    allowedIfCheckpoint: false,
    reasonDenied: "treat as rerun or restart boundary",
  },
  "s12-self-evolution": {
    allowedIfCheckpoint: false,
    reasonDenied: "postlude, non-blocking in public contract",
  },
};

/** matrix key 顺序（B2-2 projector 输出 rerunnableStages 时按此顺序排列）。 */
export const ORDERED_STAGE_IDS: readonly string[] = [
  "s1-budget",
  "s2-leader-plan",
  "s3-researchers",
  "s4-leader-assess",
  "s5-reconciler",
  "s6-analyst",
  "s7-writer-outline",
  "s8-writer-draft",
  "s8b-quality-enhancement",
  "s9-critic-l4",
  "s9b-objective-evaluation",
  "s10-leader-signoff",
  "s11-persist",
  "s12-self-evolution",
];

// ============================================================================
// 决策输入 + 输出
// ============================================================================

export interface ResumeDecision {
  resumable: boolean;
  /** denied 时给前端显示的 reason。canonical 文本，§5.3 rule 4 要求显式提及 legacy snapshot absence。 */
  reason?: string;
}

export interface RerunDecisionInput {
  /** view 投影后的 mission.status（已应用 §6.4.1.a mapping）。 */
  publicStatus:
    | "starting"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | "quality-failed";
  hasConfigSnapshot: boolean;
  hasCheckpoint: boolean;
  /**
   * Prisma `last_completed_stage` 列：Int? stage ordinal（1-based，对齐 ORDERED_STAGE_IDS 顺序）。
   * 失败时（publicStatus=failed/quality-failed）用于查 stage matrix。
   */
  lastCompletedStageOrdinal: number | null;
}

// ============================================================================
// Service
// ============================================================================

@Injectable()
export class ResumeRerunPolicyService {
  constructor(
    private readonly checkpointStore: PrismaMissionCheckpointStore,
  ) {}

  /**
   * 加载 checkpoint 存在性（§5.3 rule "checkpoint exists" 实质 = configSnapshot 非空
   * 且 checkpoint store 能 reconstruct enough state）。
   *
   * legacy null config snapshot 直接判 false（§5.3 rule 3）。
   */
  async loadCheckpointAvailability(
    mission: MissionDetail,
  ): Promise<{ hasConfigSnapshot: boolean; hasCheckpoint: boolean }> {
    const hasConfigSnapshot = mission.configSnapshot != null;
    if (!hasConfigSnapshot) {
      return { hasConfigSnapshot: false, hasCheckpoint: false };
    }
    const snapshot = await this.checkpointStore.load(mission.id);
    return { hasConfigSnapshot, hasCheckpoint: snapshot != null };
  }

  /**
   * §6.5.1 resumable 决策。
   *
   * 输入：mission 内部状态 + checkpoint availability + ownership 已校验（caller 保证，§6.5.1 rule 4）。
   *
   * §6.5.1 4 条规则：
   *   1. checkpoint or equivalent resumable state exists
   *   2. backend allows resume from current state
   *   3. ownership and access checks pass（caller 已保证）
   *   4. no stricter business guard rejects resume
   */
  computeResumable(input: RerunDecisionInput): ResumeDecision {
    // §5.3 rule 3: legacy null configSnapshot → denied
    if (!input.hasConfigSnapshot) {
      return {
        resumable: false,
        reason:
          "legacy mission row without configSnapshot — cannot resume through canonical path",
      };
    }

    // §6.5.1 rule 1
    if (!input.hasCheckpoint) {
      return { resumable: false, reason: "no checkpoint available" };
    }

    // §6.5.1 rule 2: 仅 failed 或 cancelled 可 resume；terminal completed/quality-failed 不可
    if (input.publicStatus === "completed" || input.publicStatus === "quality-failed") {
      return {
        resumable: false,
        reason: "mission already terminal-success or quality-failed",
      };
    }
    if (input.publicStatus === "running" || input.publicStatus === "starting") {
      return { resumable: false, reason: "mission still active, resume not applicable" };
    }

    // failed / cancelled + checkpoint + configSnapshot：检查 stage 维度
    const stage = ordinalToStageId(input.lastCompletedStageOrdinal);

    if (stage && STAGE_RESUME_MATRIX[stage]?.allowedIfCheckpoint === false) {
      return {
        resumable: false,
        reason:
          STAGE_RESUME_MATRIX[stage]?.reasonDenied ?? "stage not in resumable matrix",
      };
    }

    return { resumable: true };
  }

  /**
   * §6.5.2.a first-cut rerun policy。
   *
   * rerunnableStages 数组按 ORDERED_STAGE_IDS 顺序输出，14 项。
   * cascade 由 rerun controller 决定；本服务只返回 allowed + 静态原因。
   */
  computeRerunnableStages(input: RerunDecisionInput): RerunnableStageEntry[] {
    // legacy null configSnapshot → 全部 denied（§5.3 rule 3 / §6.5.2.a init rule 1）
    if (!input.hasConfigSnapshot) {
      return ORDERED_STAGE_IDS.map((id) => ({
        id,
        allowed: false,
        reason:
          "legacy mission row without configSnapshot — cannot rerun through canonical path",
      }));
    }

    // running mission：禁 rerun（避免与 in-flight 写路径冲突）
    if (input.publicStatus === "running" || input.publicStatus === "starting") {
      return ORDERED_STAGE_IDS.map((id) => ({
        id,
        allowed: false,
        reason: "mission still active; cancel or wait before rerun",
      }));
    }

    return ORDERED_STAGE_IDS.map((id) => {
      const matrix = STAGE_RESUME_MATRIX[id];
      if (!matrix) {
        return { id, allowed: false, reason: "stage not in canonical matrix" };
      }
      if (!matrix.allowedIfCheckpoint) {
        return { id, allowed: false, reason: matrix.reasonDenied };
      }
      return { id, allowed: true };
    });
  }
}

/**
 * Prisma `last_completed_stage` Int 序数 → ORDERED_STAGE_IDS 中的字符串 id。
 * 1-based：ordinal=1 → s1-budget；越界返回 null。
 */
function ordinalToStageId(ordinal: number | null): string | null {
  if (ordinal == null) return null;
  if (ordinal < 1 || ordinal > ORDERED_STAGE_IDS.length) return null;
  return ORDERED_STAGE_IDS[ordinal - 1];
}
