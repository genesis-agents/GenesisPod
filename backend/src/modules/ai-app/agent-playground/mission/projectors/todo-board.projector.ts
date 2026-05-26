/**
 * todo-board.projector.ts — Canonical TodoBoardState first-cut（B3-1）
 *
 * 落地依据：thinning plan §6.6.3 / §B3-1
 *
 * Source anchor:
 *   frontend/lib/features/agent-playground/todo-ledger.ts (2229 LOC)
 *
 * 这是 first cut，仅 port §6.6.3 "Truth logic to port" 6 项中最基础的：
 *   1. ✅ system-stage placeholder creation（14 个 canonical stage）
 *   2. ✅ mission-scope leader-plan rollup（dimensions 各派生一条 dim todo）
 *   3. ⏳ TODO B3-1 follow-up: retry child-task creation / closure
 *   4. ⏳ TODO B3-1 follow-up: dimension chapter lifecycle updates
 *   5. ⏳ TODO B3-1 follow-up: mission terminal cleanup
 *   6. ⏳ TODO B3-1 follow-up: critic / reconciler / reviewer todos
 *
 * 输出 isFirstCutTruncated=true 提示前端 follow-up 待补。
 *
 * UI-only 助手（§6.6.3 second list）保留在前端，本 projector 不实现：
 *   - deriveStageArtifacts / deriveLayerBreadcrumb / presentation-only ordering
 */

import type { MissionDetail } from "../lifecycle/mission-store.service";
import type {
  TodoBoardEntry,
  TodoBoardSentinel,
  TodoStatus,
} from "../../api/contracts/view-state.contract";
import { ORDERED_STAGE_IDS } from "../rerun/resume-rerun-policy.service";

interface BoardSourceEvent {
  type: string;
  payload: unknown;
  timestamp: number;
}

/** stage label 表（与 stage-view.projector 同步；后续可上提到 stage-label-mapping.contract.ts）。 */
const STAGE_LABEL_FOR_TODO: Record<string, string> = {
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
// Public entry
// ============================================================================

export function projectTodoBoard(
  row: MissionDetail | null,
  events: ReadonlyArray<BoardSourceEvent>,
): TodoBoardSentinel {
  if (!row) {
    return { kind: "empty-todo-board" };
  }

  const items: TodoBoardEntry[] = [];

  // 1. 14 个 system-stage placeholder todos（按 ORDERED_STAGE_IDS 顺序）
  const stageStatus = aggregateStageStatusFromEvents(events);
  for (const stageId of ORDERED_STAGE_IDS) {
    const observed = stageStatus.get(stageId);
    const status = observed?.status ?? "pending";
    items.push({
      id: `sys-${stageId}`,
      origin: "system-stage",
      scope: "system",
      status,
      title: STAGE_LABEL_FOR_TODO[stageId] ?? stageId,
      systemStageId: stageId,
      createdAt: new Date(row.startedAt).getTime(),
      startedAt: observed?.startedAt,
      endedAt: observed?.endedAt,
    });
  }

  // 2. dimension rollup（mission.dimensions 各派生一条 dim todo）
  const dimensions = extractDimensions(row.dimensions);
  for (const dim of dimensions) {
    items.push({
      id: `dim-${dim.id}`,
      origin: "leader-plan",
      scope: "dimension",
      status: mapMissionStatusToTodo(row.status),
      title: dim.name || dim.id,
      dimensionRef: dim.name,
      createdAt: new Date(row.startedAt).getTime(),
    });
  }

  return {
    kind: "todo-board",
    items,
    isFirstCutTruncated: true,
  };
}

// ============================================================================
// helpers
// ============================================================================

interface StageObservation {
  status: TodoStatus;
  startedAt?: number;
  endedAt?: number;
}

function aggregateStageStatusFromEvents(
  events: ReadonlyArray<BoardSourceEvent>,
): Map<string, StageObservation> {
  // 复用 stage-view 的逻辑结果会更准，但 first cut 内嵌简化版避免循环 import
  const out = new Map<string, StageObservation>();
  for (const ev of events) {
    const stepId = getStepId(ev);
    if (!stepId) continue;
    const mapped = mapStepToFrontendStage(stepId);
    const obs = out.get(mapped) ?? ({ status: "pending" } as StageObservation);
    if (ev.type.endsWith("stage.started") || ev.type === "stage.started") {
      obs.status = "in_progress";
      obs.startedAt ??= ev.timestamp;
    } else if (ev.type.endsWith("stage.completed") || ev.type === "stage.completed") {
      obs.status = "done";
      obs.endedAt = ev.timestamp;
    } else if (ev.type.endsWith("stage.failed") || ev.type === "stage.failed") {
      obs.status = "failed";
      obs.endedAt = ev.timestamp;
    }
    out.set(mapped, obs);
  }
  return out;
}

function getStepId(ev: BoardSourceEvent): string | null {
  const payload = ev.payload as Record<string, unknown> | null;
  if (payload && typeof payload.stepId === "string") return payload.stepId;
  return null;
}

/**
 * step id → frontend stage id 映射（subset；完整版在 step-id-mapping.contract.ts）。
 */
function mapStepToFrontendStage(stepId: string): string {
  const map: Record<string, string> = {
    "s3-researcher-collect": "s3-researchers",
    "s8-writer": "s8-writer-draft",
    "s9-critic": "s9-critic-l4",
    "s9b-objective-eval": "s9b-objective-evaluation",
    "s10-leader-foreword-signoff": "s10-leader-signoff",
  };
  return map[stepId] ?? stepId;
}

function mapMissionStatusToTodo(status: string): TodoStatus {
  switch (status) {
    case "completed":
      return "done";
    case "failed":
      return "failed";
    case "rejected":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "in_progress";
    default:
      return "pending";
  }
}

function extractDimensions(
  raw: unknown,
): Array<{ id: string; name: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((d): d is Record<string, unknown> => d != null && typeof d === "object")
    .map((d) => ({
      id: typeof d.id === "string" ? d.id : "",
      name: typeof d.name === "string" ? d.name : "",
    }))
    .filter((d) => d.id);
}
