/**
 * radar-todo-board.projector.ts — Canonical TodoBoardState for radar（B7-2a）
 *
 * 落地依据：thinning plan §B7-2 / §6.6.3 / §23.8.
 *
 * Pattern mirror social todo-board.projector：
 *   - Pre-allocate 9 个 radar stage placeholder（s1-source-resolve … s9-daily-top-n）
 *   - 事件驱动 stage:started / completed / failed 更新 status
 *   - radar 无 fanout（content-based + topic-fixed），所以无 platform / dim sub-todo
 *   - Mission terminal cleanup
 *   - Anchor sort by stage ordinal
 */

import type {
  RadarTodoBoardEntry,
  RadarTodoBoardSentinel,
} from "../../api/contracts/view-state.contract";

interface SourceEvent {
  type: string;
  payload: unknown;
  timestamp: number;
  agentId?: string;
}

interface RadarRunRowLike {
  id: string;
  status: string;
  startedAt: Date | string | null;
}

// ============================================================================
// 9 stage presets（mirror radar/mission/pipeline/stages/ 目录）
// ============================================================================

interface StagePreset {
  id: string;
  title: string;
}

const SYSTEM_STAGE_PRESETS: ReadonlyArray<StagePreset> = [
  { id: "s1-source-resolve", title: "信息源解析" },
  { id: "s2-collect", title: "信源采集" },
  { id: "s3-dedupe", title: "去重清洗" },
  { id: "s4-relevance", title: "相关性筛选" },
  { id: "s5-quality", title: "质量评估" },
  { id: "s6-entity", title: "实体抽取" },
  { id: "s7-insight", title: "洞察生成" },
  { id: "s8-persist", title: "持久化" },
  { id: "s9-daily-top-n", title: "Daily Top-N" },
];

const STAGE_ORDINAL: Record<string, number> = SYSTEM_STAGE_PRESETS.reduce(
  (acc, preset, idx) => {
    acc[preset.id] = idx + 1;
    return acc;
  },
  {} as Record<string, number>,
);

// ============================================================================
// Builder
// ============================================================================

interface BuilderState {
  todos: Map<string, RadarTodoBoardEntry>;
  order: string[];
}

function makeBuilder(): BuilderState {
  return { todos: new Map(), order: [] };
}

function upsert(
  state: BuilderState,
  id: string,
  init: () => RadarTodoBoardEntry,
  mutate?: (t: RadarTodoBoardEntry) => void,
): RadarTodoBoardEntry {
  let cur = state.todos.get(id);
  if (!cur) {
    cur = init();
    state.todos.set(id, cur);
    state.order.push(id);
  }
  if (mutate) mutate(cur);
  return cur;
}

function makeSystemStageTodo(
  preset: StagePreset,
  ts: number,
): RadarTodoBoardEntry {
  return {
    id: `system:${preset.id}`,
    origin: "system-stage",
    scope: "system",
    status: "pending",
    title: preset.title,
    systemStageId: preset.id,
    createdAt: ts,
  };
}

function evSuffix(type: string): string {
  return type.includes(".") ? type.slice(type.indexOf(".") + 1) : type;
}

function getStepId(ev: SourceEvent): string | null {
  const p = ev.payload as Record<string, unknown> | null;
  if (p && typeof p.stepId === "string") return p.stepId;
  return null;
}

// ============================================================================
// Public entry
// ============================================================================

export function projectRadarTodoBoard(
  row: RadarRunRowLike | null,
  events: ReadonlyArray<SourceEvent>,
): RadarTodoBoardSentinel {
  if (!row) return { kind: "empty-todo-board" };

  const state = makeBuilder();
  const missionCreatedAt =
    row.startedAt == null
      ? Date.now()
      : typeof row.startedAt === "string"
        ? new Date(row.startedAt).getTime()
        : row.startedAt.getTime();

  // 1. Pre-allocate 9 stage placeholders
  for (const preset of SYSTEM_STAGE_PRESETS) {
    upsert(state, `system:${preset.id}`, () =>
      makeSystemStageTodo(preset, missionCreatedAt),
    );
  }

  // 2. Iterate events
  for (const ev of events) {
    const suffix = evSuffix(ev.type);
    const ts = ev.timestamp;

    if (suffix === "stage:started" || suffix === "stage.started") {
      const stepId = getStepId(ev);
      if (stepId) {
        upsert(
          state,
          `system:${stepId}`,
          () => {
            const preset = SYSTEM_STAGE_PRESETS.find(
              (p) => p.id === stepId,
            ) ?? { id: stepId, title: stepId };
            return makeSystemStageTodo(preset, ts);
          },
          (t) => {
            if (t.status === "pending") t.status = "in_progress";
            if (!t.startedAt) t.startedAt = ts;
          },
        );
      }
      continue;
    }
    if (suffix === "stage:completed" || suffix === "stage.completed") {
      const stepId = getStepId(ev);
      if (stepId) {
        upsert(
          state,
          `system:${stepId}`,
          () => {
            const preset = SYSTEM_STAGE_PRESETS.find(
              (p) => p.id === stepId,
            ) ?? { id: stepId, title: stepId };
            return makeSystemStageTodo(preset, ts);
          },
          (t) => {
            t.status = "done";
            t.endedAt = ts;
          },
        );
      }
      continue;
    }
    if (suffix === "stage:failed" || suffix === "stage.failed") {
      const stepId = getStepId(ev);
      if (stepId) {
        upsert(
          state,
          `system:${stepId}`,
          () => {
            const preset = SYSTEM_STAGE_PRESETS.find(
              (p) => p.id === stepId,
            ) ?? { id: stepId, title: stepId };
            return makeSystemStageTodo(preset, ts);
          },
          (t) => {
            t.status = "failed";
            t.endedAt = ts;
          },
        );
      }
      continue;
    }
  }

  // 3. Mission terminal cleanup
  const status = row.status;
  const isTerminal =
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "rejected";
  if (isTerminal) {
    for (const t of state.todos.values()) {
      if (t.status === "pending" || t.status === "in_progress") {
        if (status === "completed") t.status = "done";
        else t.status = "failed";
      }
    }
  }

  // 4. Anchor sort by stage ordinal
  const items = state.order
    .map((id) => state.todos.get(id)!)
    .slice()
    .sort((a, b) => {
      const ka =
        a.scope === "system" && a.systemStageId
          ? (STAGE_ORDINAL[a.systemStageId] ?? 10)
          : 10;
      const kb =
        b.scope === "system" && b.systemStageId
          ? (STAGE_ORDINAL[b.systemStageId] ?? 10)
          : 10;
      if (ka !== kb) return ka - kb;
      return a.createdAt - b.createdAt;
    });

  return { kind: "todo-board", items, isFirstCutTruncated: false };
}
