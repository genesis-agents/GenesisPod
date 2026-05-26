/**
 * stage-view.projector.ts — Pure projector for canonical stages[]（B2-2）
 *
 * 落地依据：thinning plan §6.4.2 / §6.4.2.a
 *
 * 纯函数（无 DI），输入 events + lastCompletedStage，输出 14 个 canonical stage。
 * §6.4.2 rule 5: 没事件的 stage 默认 pending，不擅自标 skipped。
 */

import { mapStepIdToFrontendStageId } from "../../api/contracts/step-id-mapping.contract";
import type {
  MissionViewBaseStage,
  StageStatus,
} from "../../api/contracts/view-state.contract";
import { ORDERED_STAGE_IDS } from "../rerun/resume-rerun-policy.service";

// ============================================================================
// canonical stage labels（与 §6.4.2.a 14 个 stage 对齐）
// ============================================================================

/** stage label 中文映射。任何修改需同步前端 i18n 与 fixture expected-view.json。 */
const STAGE_LABELS: Record<string, string> = {
  "s1-budget": "预算计算",
  "s2-leader-plan": "Leader 规划",
  "s3-researchers": "研究员收集",
  "s4-leader-assess": "Leader 评估",
  "s5-reconciler": "协调器",
  "s6-analyst": "分析师",
  "s7-writer-outline": "写作大纲",
  "s8-writer-draft": "草稿撰写",
  "s8b-quality-enhancement": "章节质量增强",
  "s9-critic-l4": "L4 评审",
  "s9b-objective-evaluation": "客观评估",
  "s10-leader-signoff": "Leader 签署",
  "s11-persist": "持久化",
  "s12-self-evolution": "自我进化",
};

// ============================================================================
// Event shape (subset; full type in MissionEventBuffer)
// ============================================================================

interface StageRelevantEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

interface StageEventDigest {
  startedAt?: string;
  endedAt?: string;
  attempts: number;
  observed: Set<StageStatus>;
  failedDetail?: string;
  /** 最后看到的 verb（用于解决 rerun-in-flight：done → started 后状态应为 running）。 */
  lastVerb?: "started" | "completed" | "failed" | "skipped";
}

// ============================================================================
// Projector
// ============================================================================

export function projectStages(
  events: ReadonlyArray<StageRelevantEvent>,
): MissionViewBaseStage[] {
  const digestByStage = aggregateByStage(events);

  return ORDERED_STAGE_IDS.map((id) => {
    const digest = digestByStage.get(id);
    const label = STAGE_LABELS[id] ?? id;

    if (!digest) {
      return { id, label, status: "pending" as StageStatus };
    }

    const status = resolveStageStatus(digest);
    return {
      id,
      label,
      status,
      startedAt: digest.startedAt,
      endedAt: digest.endedAt,
      attempts: digest.attempts > 1 ? digest.attempts : undefined,
      detail: status === "failed" ? digest.failedDetail : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function aggregateByStage(
  events: ReadonlyArray<StageRelevantEvent>,
): Map<string, StageEventDigest> {
  const result = new Map<string, StageEventDigest>();

  for (const ev of events) {
    const verb = extractVerb(ev.type);
    if (!verb) continue;
    const stageId = extractStageId(ev);
    if (!stageId) continue;
    const mapped = mapStepIdToFrontendStageId(stageId);

    const digest =
      result.get(mapped) ??
      ({
        attempts: 0,
        observed: new Set<StageStatus>(),
      } as StageEventDigest);

    const tsIso = isoTime(ev.timestamp);

    switch (verb) {
      case "started":
        digest.startedAt = tsIso; // 覆盖（rerun 时记录最新一轮 startedAt）
        digest.attempts += 1;
        digest.observed.add("running");
        digest.lastVerb = "started";
        // rerun-in-flight：clear 上一轮的 endedAt 让 view 显示当前轮 startedAt
        digest.endedAt = undefined;
        break;
      case "completed":
        digest.endedAt = tsIso;
        digest.observed.add("done");
        digest.lastVerb = "completed";
        break;
      case "failed":
        digest.endedAt = tsIso;
        digest.observed.add("failed");
        digest.failedDetail = extractFailDetail(ev) ?? digest.failedDetail;
        digest.lastVerb = "failed";
        break;
      case "skipped":
        digest.observed.add("skipped");
        digest.lastVerb = "skipped";
        break;
      default:
        // 其他 verb 不影响 stage status
        break;
    }

    result.set(mapped, digest);
  }

  return result;
}

/**
 * §6.4.2 status resolution。
 *
 * 优先级（rerun-in-flight 语义）：
 *   1. lastVerb = failed → failed（终态）
 *   2. lastVerb = started → running（即使之前 done，rerun 后仍是 running）
 *   3. lastVerb = completed → done
 *   4. lastVerb = skipped → skipped
 *   5. 无任何 verb → pending
 *
 * 用 lastVerb 而非 observed Set 解决 done→started 的 rerun-in-flight bug。
 */
function resolveStageStatus(digest: StageEventDigest): StageStatus {
  switch (digest.lastVerb) {
    case "failed":
      return "failed";
    case "started":
      return "running";
    case "completed":
      return "done";
    case "skipped":
      return "skipped";
    default:
      return "pending";
  }
}

function extractStageId(ev: StageRelevantEvent): string | null {
  // 兼容两种形态：
  //   1) type = "agent-playground.stage.<verb>", payload.stepId = "s5-reconciler"
  //   2) type = "stage.started" 顶层（fixture 形态）
  const payload = ev.payload as Record<string, unknown> | null;
  if (payload && typeof payload.stepId === "string") {
    return payload.stepId;
  }
  return null;
}

function extractVerb(eventType: string): "started" | "completed" | "failed" | "skipped" | null {
  if (eventType.endsWith("stage.started") || eventType === "stage.started") {
    return "started";
  }
  if (eventType.endsWith("stage.completed") || eventType === "stage.completed") {
    return "completed";
  }
  if (eventType.endsWith("stage.failed") || eventType === "stage.failed") {
    return "failed";
  }
  if (eventType.endsWith("stage.skipped") || eventType === "stage.skipped") {
    return "skipped";
  }
  return null;
}

function extractFailDetail(ev: StageRelevantEvent): string | null {
  const payload = ev.payload as Record<string, unknown> | null;
  if (!payload) return null;
  if (typeof payload.detail === "string") return payload.detail;
  if (typeof payload.message === "string") return payload.message;
  return null;
}

function isoTime(timestamp: number | string): string {
  if (typeof timestamp === "string") return timestamp;
  return new Date(timestamp).toISOString();
}
