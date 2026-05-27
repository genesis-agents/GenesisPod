/**
 * social-todo-board.projector.ts — Canonical TodoBoardState for social（B7-1a）
 *
 * 落地依据：thinning plan §B7-1 / §6.6.3 todo truth canonical / §23.8 social/radar 对齐
 *
 * Pattern mirror playground todo-board.projector.ts：
 *   - Pre-allocate 13 个 social stage placeholder（s1-mission-budget-eval … s12-self-evolution）
 *   - 事件驱动：mission/stage lifecycle + publish:executed/verified → todo upsert
 *   - 平台维度：每个 row.platforms 元素 → 一个 "platform" scope todo（s8-publish 周边）
 *   - anchor sort：与 playground 同设计，按 stage ordinal + origin 锚位排序
 *
 * §6.4.1.a social-specific status mapping (aborted → cancelled) 在 mission-view.projector
 * resolvePublicStatus 处理；此处 TodoBoard 仅消费 row.status 终态即可。
 */

import type {
  SocialPlatform,
  SocialTodoBoardEntry,
  SocialTodoBoardSentinel,
} from "../../api/contracts/view-state.contract";

interface SourceEvent {
  type: string;
  payload: unknown;
  timestamp: number;
  agentId?: string;
}

interface SocialMissionRowLike {
  id: string;
  status: string;
  startedAt: Date | string;
  completedAt?: Date | string | null;
  platforms?: unknown;
  contentId?: string | null;
}

// ============================================================================
// 13 stage presets（mirror social/mission/pipeline/stages/ 目录）
// ============================================================================

interface StagePreset {
  id: string;
  title: string;
  desc: string;
}

const SYSTEM_STAGE_PRESETS: ReadonlyArray<StagePreset> = [
  {
    id: "s1-mission-budget-eval",
    title: "预算评估",
    desc: "估算 token 预算并校验余额",
  },
  {
    id: "s2-platform-probe",
    title: "平台探测",
    desc: "探测目标平台的限制与可发布能力",
  },
  {
    id: "s3-content-transform",
    title: "内容转换",
    desc: "将原文转化为平台适配草稿",
  },
  {
    id: "s4-leader-assess-transform",
    title: "Leader 评审转换",
    desc: "Leader 评审平台适配草稿质量",
  },
  { id: "s5-cover-craft", title: "封面制作", desc: "生成 / 选择平台封面" },
  { id: "s6-body-compose", title: "正文组装", desc: "正文拼装 + 平台格式化" },
  { id: "s7-polish-review", title: "润色复审", desc: "润色 + Leader 终审" },
  { id: "s8-publish-execute", title: "发布执行", desc: "调用各平台 API 发布" },
  { id: "s8b-publish-retry", title: "发布重试", desc: "失败平台自动重试" },
  {
    id: "s9-publish-verify",
    title: "发布核验",
    desc: "拉取已发布内容核验展现",
  },
  { id: "s10-leader-signoff", title: "Leader 签字", desc: "Leader 综合签字" },
  { id: "s11-mission-persist", title: "持久化", desc: "落库归档 trajectory" },
  {
    id: "s12-self-evolution",
    title: "自我进化",
    desc: "复盘 + FailureLearner",
  },
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
  todos: Map<string, SocialTodoBoardEntry>;
  order: string[];
}

function makeBuilder(): BuilderState {
  return { todos: new Map(), order: [] };
}

function upsert(
  state: BuilderState,
  id: string,
  init: () => SocialTodoBoardEntry,
  mutate?: (t: SocialTodoBoardEntry) => void,
): SocialTodoBoardEntry {
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
): SocialTodoBoardEntry {
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

function getString(p: unknown, key: string): string | undefined {
  if (!p || typeof p !== "object") return undefined;
  const v = (p as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function getStepId(ev: SourceEvent): string | null {
  const p = ev.payload as Record<string, unknown> | null;
  if (p && typeof p.stepId === "string") return p.stepId;
  return null;
}

function extractPlatforms(raw: unknown): SocialPlatform[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is SocialPlatform => typeof p === "string");
}

// ============================================================================
// Public entry
// ============================================================================

export function projectSocialTodoBoard(
  row: SocialMissionRowLike | null,
  events: ReadonlyArray<SourceEvent>,
): SocialTodoBoardSentinel {
  if (!row) return { kind: "empty-todo-board" };

  const state = makeBuilder();
  const missionCreatedAt =
    typeof row.startedAt === "string"
      ? new Date(row.startedAt).getTime()
      : row.startedAt.getTime();

  // 1. Pre-allocate 13 stage placeholder
  for (const preset of SYSTEM_STAGE_PRESETS) {
    upsert(state, `system:${preset.id}`, () =>
      makeSystemStageTodo(preset, missionCreatedAt),
    );
  }

  // 2. Pre-allocate per-platform placeholders（s8-publish 周边）
  const platforms = extractPlatforms(row.platforms);
  for (const platform of platforms) {
    upsert(state, `platform:${platform}`, () => ({
      id: `platform:${platform}`,
      origin: "platform-publish",
      scope: "platform",
      status: "pending",
      title: `发布到 ${platform}`,
      platform,
      createdAt: missionCreatedAt,
    }));
  }

  // 3. Iterate events
  for (const ev of events) {
    const suffix = evSuffix(ev.type);
    const ts = ev.timestamp;
    const payload = ev.payload as Record<string, unknown> | null;

    // ── stage lifecycle ────────────────────────────────────────────
    if (suffix === "stage:started" || suffix === "stage.started") {
      const stepId = getStepId(ev);
      if (stepId) {
        const sid = `system:${stepId}`;
        upsert(
          state,
          sid,
          () => {
            const preset = SYSTEM_STAGE_PRESETS.find(
              (p) => p.id === stepId,
            ) ?? {
              id: stepId,
              title: stepId,
              desc: "",
            };
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
            ) ?? {
              id: stepId,
              title: stepId,
              desc: "",
            };
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
            ) ?? {
              id: stepId,
              title: stepId,
              desc: "",
            };
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

    // ── publish lifecycle per platform ─────────────────────────────
    if (suffix === "publish:executed") {
      const platform = getString(payload, "platform") as
        | SocialPlatform
        | undefined;
      const status = getString(payload, "status"); // PUBLISHED / FAILED / SKIPPED
      if (platform) {
        upsert(
          state,
          `platform:${platform}`,
          () => ({
            id: `platform:${platform}`,
            origin: "platform-publish",
            scope: "platform",
            status: "in_progress",
            title: `发布到 ${platform}`,
            platform,
            createdAt: ts,
            startedAt: ts,
          }),
          (t) => {
            if (!t.startedAt) t.startedAt = ts;
            if (status === "PUBLISHED") t.status = "done";
            else if (status === "FAILED") t.status = "failed";
            else if (status === "SKIPPED") t.status = "done";
            else t.status = "in_progress";
            t.endedAt = ts;
          },
        );
      }
      continue;
    }
    if (suffix === "publish:verified") {
      const platform = getString(payload, "platform") as
        | SocialPlatform
        | undefined;
      if (platform) {
        upsert(
          state,
          `platform:${platform}`,
          () => ({
            id: `platform:${platform}`,
            origin: "platform-publish",
            scope: "platform",
            status: "done",
            title: `发布到 ${platform}`,
            platform,
            createdAt: ts,
            startedAt: ts,
            endedAt: ts,
          }),
          (t) => {
            // 核验通过保持 done
            if (t.status !== "failed") t.status = "done";
          },
        );
      }
      continue;
    }
  }

  // 4. Mission terminal cleanup
  const status = row.status;
  const isTerminal =
    status === "completed" || status === "failed" || status === "aborted";
  if (isTerminal) {
    for (const t of state.todos.values()) {
      if (t.status === "pending" || t.status === "in_progress") {
        if (status === "completed") t.status = "done";
        else if (status === "failed") t.status = "failed";
        else if (status === "aborted") t.status = "failed";
      }
    }
  }

  // 5. Anchor sort: system stages by ordinal, platforms anchored to s8-publish (sortKey 8.5)
  const items = sortByAnchor(state);

  return { kind: "todo-board", items, isFirstCutTruncated: false };
}

function sortByAnchor(state: BuilderState): SocialTodoBoardEntry[] {
  const all = state.order.map((id) => state.todos.get(id)!);
  function sortKey(t: SocialTodoBoardEntry): number {
    if (t.scope === "system" && t.systemStageId) {
      return STAGE_ORDINAL[t.systemStageId] ?? 13.5;
    }
    if (t.scope === "platform") {
      // platforms appear between s8-publish-execute (8) and s8b-publish-retry (9)
      return 8.5;
    }
    return 13.5; // mission scope, no specific anchor → 末尾
  }
  return all.slice().sort((a, b) => {
    const k = sortKey(a) - sortKey(b);
    if (k !== 0) return k;
    return a.createdAt - b.createdAt;
  });
}
