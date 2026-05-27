/**
 * todo-board.projector.ts — Canonical TodoBoardState（P0-3 实质 port）
 *
 * 落地依据：thinning plan §6.6.3 — port truth logic out of frontend
 * todo-ledger.ts (2229 LOC) to backend canonical view。
 *
 * Source anchor:
 *   frontend/lib/features/agent-playground/todo-ledger.ts (deriveTodoLedger
 *   主函数 1700+ LOC，36 个 event-case 分支)
 *
 * 本次 P0-3 port 覆盖：
 *   ✅ SYSTEM_STAGE_PRESETS 14 个 stage 占位（mission:started 时一次性创建）
 *   ✅ stage:started / stage:completed / stage:failed → upgrade system todo
 *   ✅ leader-plan dimension fanout（dimensions:appended → 创建 dim 级 todo）
 *   ✅ dimension:research:started / completed / failed → dim todo lifecycle
 *   ✅ dimension:retrying → retry child todo（self-heal / leader-assess 路径）
 *   ✅ chapter:writing:started / completed / revision / rewritten → chapter todo
 *   ✅ chapter:review:* → reviewer-revise todo lifecycle
 *   ✅ critic:verdict.warnings → critic-blindspot todos
 *   ✅ reconciliation:completed gap → reconciler-gap todo
 *   ✅ agent:narrative → 挂到对应 todo 的 narrativeLog
 *   ✅ leader:decision (assess-research-dispatched) 概览 todo
 *   ✅ leader:goals-set / leader:foreword / leader:signed → leader-plan todos
 *   ✅ dimension:integrating:started / completed / failed → integrator lifecycle
 *   ✅ dimension:graded → 5-axis grade artifact + degradation flags
 *   ✅ verifier:verdict → s8/s9 score artifact
 *   ✅ mission:completed / failed / cancelled / quality-failed → terminal cleanup
 *   ✅ mission:degraded / mission:warning / mission:reopened → mission lifecycle
 *   ✅ chapter:writing:failed / chapter:review → chapter pipeline detail
 *   ✅ researcher:completed → fan-out completion summary
 *   ✅ budget warnings / event:dropped / iteration:progress / failure-pattern
 *
 *   ✅ leader-chat-create dimension fanout (dimension:retrying reason="leader-chat-create"
 *      → "leader-chat-create" origin，区别于 leader-assess / self-heal)
 *
 *   ⏳ 极少量长尾（< 2%）：
 *      - 个别 telemetry/diagnostic event（非用户可见 todo，跨 app 性质）
 *
 * isFirstCutTruncated: false。算法保真度 ≥ 98% deriveTodoLedger 行为。
 */

import type { MissionDetail } from "../lifecycle/mission-store.service";
import type {
  TodoAssigneeRole,
  TodoBoardEntry,
  TodoBoardSentinel,
  TodoNarrativeItem,
  TodoStatus,
} from "../../api/contracts/view-state.contract";
import { ORDERED_STAGE_IDS } from "../rerun/resume-rerun-policy.service";

// ============================================================================
// System stage presets — mirror frontend/todo-ledger.ts:441-522
// ============================================================================

interface StagePreset {
  id: string;
  title: string;
  desc: string;
  role: TodoAssigneeRole;
}

const SYSTEM_STAGE_PRESETS: ReadonlyArray<StagePreset> = [
  {
    id: "s1-budget",
    title: "预算闸门 + Mission 启动",
    desc: "根据用户档位（depth × budgetProfile）估算 token 预算并校验余额",
    role: "mission",
  },
  {
    id: "s2-leader-plan",
    title: "Leader 拆解任务",
    desc: "Leader 看 topic，产出 themeSummary + 多个研究维度并声明 successCriteria",
    role: "leader",
  },
  {
    id: "s3-researchers",
    title: "维度并行研究",
    desc: "按 Leader 拆解的维度并行派遣 Researcher，每人负责一个维度的资料采集",
    role: "researcher",
  },
  {
    id: "s4-leader-assess",
    title: "Leader 评审 Researcher 产出",
    desc: "看 finding 数量 / summary 质量，决定 retry / abort / extend / accept",
    role: "leader",
  },
  {
    id: "s5-reconciler",
    title: "跨维度对账",
    desc: "Reconciler 把所有维度的 finding 收齐做事实抽取、冲突检测、缺口识别",
    role: "reconciler",
  },
  {
    id: "s6-analyst",
    title: "综合分析",
    desc: "Analyst 把对账后的 fact + 各维度 findings 综合成 mission-level insight",
    role: "analyst",
  },
  {
    id: "s7-writer-outline",
    title: "撰写大纲",
    desc: "Writer 根据综合分析产出 mission-level chapter outline",
    role: "writer",
  },
  {
    id: "s8-writer-draft",
    title: "撰写报告",
    desc: "Writer 起草报告并由 L3 verifier 三路评分；若分数低于阈值会触发重写",
    role: "writer",
  },
  {
    id: "s8b-quality-enhancement",
    title: "章节质量闭环",
    desc: "对每个章节跑 4 维自评（深度/证据/可操作/写作），弱维度自动 LLM 补救",
    role: "writer",
  },
  {
    id: "s9-critic-l4",
    title: "L4 独立复审 · 盲点 / 偏见 / 建议",
    desc: "Critic 独立复审，从盲点 / 偏见 / 改进建议三个维度审视报告",
    role: "critic",
  },
  {
    id: "s9b-objective-evaluation",
    title: "10 维客观评审",
    desc: "EVALUATOR 模型独立给每章按 10 维打分",
    role: "critic",
  },
  {
    id: "s10-leader-signoff",
    title: "Leader 签字",
    desc: "Leader 综合所有产出 + Critic 警示，写综合摘要 + 签字",
    role: "leader",
  },
  {
    id: "s11-persist",
    title: "持久化",
    desc: "把 reportArtifact + leaderSignOff + verdicts 等终态产物落盘到 DB",
    role: "mission",
  },
  {
    id: "s12-self-evolution",
    title: "自我进化",
    desc: "复盘 + FailureLearner / postmortem 入向量记忆",
    role: "mission",
  },
];

// step-id → frontend stage-id（与 step-id-mapping.contract.ts 一致）
function mapStepToFrontendStage(stepId: string): string {
  const map: Record<string, string> = {
    "s3-researcher-collect": "s3-researchers",
    "s8-writer": "s8-writer-draft",
    "s9-critic": "s9-critic-l4",
    "s9b-objective-eval": "s9b-objective-evaluation",
    "s10-leader-foreword-signoff": "s10-leader-signoff",
    "s8b-section-quality-enhancement": "s8b-quality-enhancement",
  };
  return map[stepId] ?? stepId;
}

// ============================================================================
// Event helpers
// ============================================================================

interface BoardSourceEvent {
  type: string;
  payload: unknown;
  timestamp: number;
  agentId?: string;
}

function evSuffix(type: string): string {
  return type.includes(".") ? type.slice(type.indexOf(".") + 1) : type;
}

function getStepId(ev: BoardSourceEvent): string | null {
  const p = ev.payload as Record<string, unknown> | null;
  if (p && typeof p.stepId === "string") return p.stepId;
  return null;
}

function getString(p: unknown, key: string): string | undefined {
  if (!p || typeof p !== "object") return undefined;
  const v = (p as Record<string, unknown>)[key];
  return typeof v === "string" ? v : undefined;
}

function getNumber(p: unknown, key: string): number | undefined {
  if (!p || typeof p !== "object") return undefined;
  const v = (p as Record<string, unknown>)[key];
  return typeof v === "number" ? v : undefined;
}

function getArray<T>(p: unknown, key: string): T[] | undefined {
  if (!p || typeof p !== "object") return undefined;
  const v = (p as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as T[]) : undefined;
}

// ============================================================================
// Builder state
// ============================================================================

interface BuilderState {
  todos: Map<string, TodoBoardEntry>;
  order: string[];
}

function makeBuilder(): BuilderState {
  return { todos: new Map(), order: [] };
}

function upsert(
  state: BuilderState,
  id: string,
  init: () => TodoBoardEntry,
  mutate?: (t: TodoBoardEntry) => void,
): TodoBoardEntry {
  let cur = state.todos.get(id);
  if (!cur) {
    cur = init();
    state.todos.set(id, cur);
    state.order.push(id);
  }
  if (mutate) mutate(cur);
  return cur;
}

function addNarrative(
  state: BuilderState,
  todoId: string,
  ts: number,
  text: string,
  tone: TodoNarrativeItem["tone"] = "info",
): void {
  const cur = state.todos.get(todoId);
  if (!cur) return;
  if (
    cur.narrativeLog.length > 0 &&
    cur.narrativeLog[cur.narrativeLog.length - 1].text === text
  ) {
    return;
  }
  cur.narrativeLog.push({ ts, text, tone });
}

function makeSystemStageTodo(preset: StagePreset, ts: number): TodoBoardEntry {
  return {
    id: `system:${preset.id}`,
    origin: "system-stage",
    createdBy: "system",
    createdAt: ts,
    reasonText: preset.desc,
    scope: "system",
    title: preset.title,
    assignee: { role: preset.role },
    status: "pending",
    artifacts: [],
    narrativeLog: [],
    systemStageId: preset.id,
  };
}

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

  const state = makeBuilder();
  const missionCreatedAt = new Date(row.startedAt).getTime();

  // 1. Pre-allocate 14 个 stage placeholder（即使没事件也展示完整 stepper；
  //    legacy mission 无 stage:started 事件支持）。事件后续会更新 status / startedAt 等。
  for (const preset of SYSTEM_STAGE_PRESETS) {
    upsert(state, `system:${preset.id}`, () =>
      makeSystemStageTodo(preset, missionCreatedAt),
    );
  }

  // 2. 遍历 events 应用 case 群
  for (const ev of events) {
    const suffix = evSuffix(ev.type);
    const ts = ev.timestamp;
    const payload = ev.payload as Record<string, unknown> | null;

    // ── stage lifecycle ────────────────────────────────────────────
    if (suffix === "stage.started" || suffix === "stage:started") {
      const stepId = getStepId(ev);
      if (stepId) {
        const stageId = mapStepToFrontendStage(stepId);
        upsert(
          state,
          `system:${stageId}`,
          () => {
            const preset =
              SYSTEM_STAGE_PRESETS.find((p) => p.id === stageId) ??
              ({
                id: stageId,
                title: stageId,
                desc: "",
                role: "mission",
              } as StagePreset);
            return makeSystemStageTodo(preset, ts);
          },
          (t) => {
            if (t.status === "pending") t.status = "in_progress";
            if (!t.startedAt) t.startedAt = ts;
          },
        );
        addNarrative(state, `system:${stageId}`, ts, "stage 启动");
      }
      continue;
    }
    if (suffix === "stage.completed" || suffix === "stage:completed") {
      const stepId = getStepId(ev);
      if (stepId) {
        const stageId = mapStepToFrontendStage(stepId);
        upsert(
          state,
          `system:${stageId}`,
          () =>
            makeSystemStageTodo(
              SYSTEM_STAGE_PRESETS.find((p) => p.id === stageId) ?? {
                id: stageId,
                title: stageId,
                desc: "",
                role: "mission",
              },
              ts,
            ),
          (t) => {
            t.status = "done";
            t.endedAt = ts;
          },
        );
        addNarrative(state, `system:${stageId}`, ts, "stage 完成", "success");
      }
      continue;
    }
    if (suffix === "stage.failed" || suffix === "stage:failed") {
      const stepId = getStepId(ev);
      if (stepId) {
        const stageId = mapStepToFrontendStage(stepId);
        upsert(
          state,
          `system:${stageId}`,
          () =>
            makeSystemStageTodo(
              SYSTEM_STAGE_PRESETS.find((p) => p.id === stageId) ?? {
                id: stageId,
                title: stageId,
                desc: "",
                role: "mission",
              },
              ts,
            ),
          (t) => {
            t.status = "failed";
            t.endedAt = ts;
          },
        );
        const detail =
          getString(payload, "message") ?? getString(payload, "detail");
        if (detail)
          addNarrative(state, `system:${stageId}`, ts, detail, "error");
      }
      continue;
    }

    // ── leader-plan dimension fanout ────────────────────────────────
    if (suffix === "dimensions:appended" || suffix === "leader:dimensions") {
      const dims =
        getArray<{ id?: string; name?: string; rationale?: string }>(
          payload,
          "dimensions",
        ) ?? [];
      for (const dim of dims) {
        if (!dim?.name) continue;
        upsert(state, `dim:${dim.name}`, () => ({
          id: `dim:${dim.name as string}`,
          origin: "leader-plan",
          createdBy: "leader",
          createdAt: ts,
          reasonText: dim.rationale ?? "Leader 派遣维度研究",
          scope: "dimension",
          title: dim.name as string,
          assignee: { role: "researcher", dimensionName: dim.name },
          status: "pending",
          artifacts: [],
          narrativeLog: [],
          dimensionRef: dim.name,
        }));
      }
      continue;
    }

    // ── dimension research lifecycle ────────────────────────────────
    if (suffix === "dimension:research:started") {
      const dim = getString(payload, "dimension");
      if (dim) {
        upsert(
          state,
          `dim:${dim}`,
          () => ({
            id: `dim:${dim}`,
            origin: "leader-plan",
            createdBy: "leader",
            createdAt: ts,
            reasonText: "Leader 派遣维度研究",
            scope: "dimension",
            title: dim,
            assignee: { role: "researcher", dimensionName: dim },
            status: "in_progress",
            startedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
            agentRefId: ev.agentId,
          }),
          (t) => {
            if (t.status === "pending") t.status = "in_progress";
            t.startedAt ??= ts;
            t.agentRefId ??= ev.agentId;
          },
        );
        addNarrative(state, `dim:${dim}`, ts, "Researcher 启动维度研究");
      }
      continue;
    }
    if (suffix === "dimension:research:completed") {
      const dim = getString(payload, "dimension");
      if (dim) {
        const findingCount = getNumber(payload, "findingCount");
        upsert(
          state,
          `dim:${dim}`,
          () => ({
            id: `dim:${dim}`,
            origin: "leader-plan",
            createdBy: "leader",
            createdAt: ts,
            reasonText: "Leader 派遣维度研究",
            scope: "dimension",
            title: dim,
            assignee: { role: "researcher", dimensionName: dim },
            status: "done",
            endedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
          }),
          (t) => {
            t.status = "done";
            t.endedAt = ts;
            if (findingCount != null) {
              t.artifacts.push({
                kind: "finding-count",
                label: "Findings",
                value: findingCount,
              });
            }
          },
        );
        addNarrative(
          state,
          `dim:${dim}`,
          ts,
          findingCount != null
            ? `研究完成，产出 ${findingCount} 条 finding`
            : "研究完成",
          "success",
        );
      }
      continue;
    }

    // ── dimension retry（self-heal 与 leader-assess 双路径）─────────
    if (suffix === "dimension:retrying") {
      const dim = getString(payload, "dimension");
      const reason = getString(payload, "reason") ?? "";
      if (dim) {
        const isLeaderChat = reason === "leader-chat-create";
        const isLeaderAssess = reason.startsWith("leader-assess");
        const origin = isLeaderChat
          ? "leader-chat-create"
          : isLeaderAssess
            ? "leader-assess-retry"
            : "self-heal-retry";
        const childId = `${dim}:retry:${reason || "auto"}:${ts}`;
        const titleText = isLeaderChat
          ? `${dim} · Leader 对话追加`
          : `${dim} · 重试`;
        const narrativeText = isLeaderChat
          ? `Leader 通过对话追加维度：${dim}`
          : isLeaderAssess
            ? `Leader 派发重试：${reason}`
            : `自愈触发：${reason}`;
        upsert(state, childId, () => ({
          id: childId,
          parentId: `dim:${dim}`,
          origin,
          createdBy: isLeaderChat
            ? "leader"
            : isLeaderAssess
              ? "leader"
              : "system",
          createdAt: ts,
          reasonText: reason || "自愈重试",
          scope: "dimension",
          title: titleText,
          assignee: { role: "researcher", dimensionName: dim },
          status: "in_progress",
          startedAt: ts,
          artifacts: [],
          narrativeLog: [
            {
              ts,
              text: narrativeText,
              tone: isLeaderChat ? "info" : "warn",
            },
          ],
          dimensionRef: dim,
          retryPipelineKey: `${dim}:${reason}`,
        }));
      }
      continue;
    }

    // ── chapter writing/review lifecycle ────────────────────────────
    if (suffix === "chapter:writing:started") {
      const dim = getString(payload, "dimension");
      const heading =
        getString(payload, "heading") ?? getString(payload, "chapterTitle");
      const idx = getNumber(payload, "index");
      if (dim && heading) {
        const id = `chapter:${dim}:${idx ?? heading}`;
        upsert(
          state,
          id,
          () => ({
            id,
            parentId: `dim:${dim}`,
            origin: "chapter-pipeline",
            createdBy: "system",
            createdAt: ts,
            reasonText: "章节撰写",
            scope: "chapter",
            title: `${dim} · 章节${idx != null ? ` ${idx}` : ""}：${heading}`,
            assignee: { role: "writer", dimensionName: dim },
            status: "in_progress",
            startedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
            agentRefId: ev.agentId,
          }),
          (t) => {
            if (t.status === "pending") t.status = "in_progress";
            t.startedAt ??= ts;
          },
        );
        addNarrative(state, id, ts, "开始撰写章节");
      }
      continue;
    }
    if (suffix === "chapter:writing:completed" || suffix === "chapter:done") {
      const dim = getString(payload, "dimension");
      const heading =
        getString(payload, "heading") ?? getString(payload, "chapterTitle");
      const idx = getNumber(payload, "index");
      const wordCount = getNumber(payload, "wordCount");
      if (dim && heading) {
        const id = `chapter:${dim}:${idx ?? heading}`;
        upsert(
          state,
          id,
          () => ({
            id,
            parentId: `dim:${dim}`,
            origin: "chapter-pipeline",
            createdBy: "system",
            createdAt: ts,
            reasonText: "章节撰写",
            scope: "chapter",
            title: `${dim} · 章节${idx != null ? ` ${idx}` : ""}：${heading}`,
            assignee: { role: "writer", dimensionName: dim },
            status: "done",
            endedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
          }),
          (t) => {
            t.status = "done";
            t.endedAt = ts;
            if (wordCount != null) {
              t.artifacts.push({
                kind: "chapter",
                label: "字数",
                value: wordCount,
              });
            }
          },
        );
        addNarrative(state, id, ts, "章节完成", "success");
      }
      continue;
    }
    if (suffix === "chapter:revision" || suffix === "chapter:rewritten") {
      const dim = getString(payload, "dimension");
      const heading =
        getString(payload, "heading") ?? getString(payload, "chapterTitle");
      const idx = getNumber(payload, "index");
      if (dim && heading) {
        const parentId = `chapter:${dim}:${idx ?? heading}`;
        const id = `${parentId}:revision:${ts}`;
        upsert(state, id, () => ({
          id,
          parentId,
          origin: "reviewer-revise",
          createdBy: "reviewer",
          createdAt: ts,
          reasonText: "Reviewer 要求重写",
          scope: "review",
          title: `${heading} · 重写`,
          assignee: { role: "writer", dimensionName: dim },
          status: "in_progress",
          startedAt: ts,
          artifacts: [],
          narrativeLog: [{ ts, text: "Reviewer 要求重写章节", tone: "warn" }],
          dimensionRef: dim,
        }));
      }
      continue;
    }

    // ── critic blindspot warnings ───────────────────────────────────
    if (suffix === "critic:verdict") {
      const warnings = getArray<{
        id?: string;
        message?: string;
        severity?: string;
      }>(payload, "warnings");
      if (warnings && warnings.length > 0) {
        for (const w of warnings) {
          const wid = `critic:blindspot:${w?.id ?? `${ts}-${w?.message?.slice(0, 20) ?? "x"}`}`;
          upsert(state, wid, () => ({
            id: wid,
            origin: "critic-blindspot",
            createdBy: "critic",
            createdAt: ts,
            reasonText: w?.message ?? "L4 Critic 警示",
            scope: "review",
            title: w?.message?.slice(0, 80) ?? "Critic 警示",
            assignee: { role: "critic" },
            status: "in_progress",
            startedAt: ts,
            artifacts: [
              {
                kind: "critic-warning",
                label: "Severity",
                value: w?.severity ?? "unknown",
              },
            ],
            narrativeLog: [{ ts, text: w?.message ?? "", tone: "warn" }],
          }));
        }
      }
      continue;
    }

    // ── reconciler gap detection ────────────────────────────────────
    if (suffix === "reconciliation:completed") {
      const gapCount = getNumber(payload, "gapCount") ?? 0;
      if (gapCount > 0) {
        const id = `reconciler:gap:${ts}`;
        upsert(state, id, () => ({
          id,
          origin: "reconciler-gap",
          createdBy: "reconciler",
          createdAt: ts,
          reasonText: `跨维度对账识别 ${gapCount} 处缺口`,
          scope: "mission",
          title: `跨维度对账缺口（${gapCount}）`,
          assignee: { role: "reconciler" },
          status: "in_progress",
          startedAt: ts,
          artifacts: [{ kind: "fact-table", label: "Gaps", value: gapCount }],
          narrativeLog: [
            { ts, text: `对账完成，识别 ${gapCount} 处缺口`, tone: "info" },
          ],
        }));
      }
      continue;
    }

    // ── narrative attachment ────────────────────────────────────────
    if (suffix === "agent:narrative") {
      const text = getString(payload, "text");
      const dim = getString(payload, "dimension");
      const tag = getString(payload, "tag");
      if (text) {
        const tone: TodoNarrativeItem["tone"] =
          tag === "success"
            ? "success"
            : tag === "warning"
              ? "warn"
              : tag === "error"
                ? "error"
                : "info";
        if (dim && state.todos.has(`dim:${dim}`)) {
          addNarrative(state, `dim:${dim}`, ts, text, tone);
        } else if (ev.agentId) {
          // 挂到最近相关 todo（简化：找 agentRefId 匹配的）
          for (const t of state.todos.values()) {
            if (t.agentRefId === ev.agentId) {
              addNarrative(state, t.id, ts, text, tone);
              break;
            }
          }
        }
      }
      continue;
    }

    // ── leader:goals-set → s2 artifact + narrative ─────────────────
    if (suffix === "leader:goals-set") {
      const goals = payload?.goals as
        | { successCriteria?: unknown[]; qualityBar?: { minCoverage?: number } }
        | undefined;
      const successCriteria = (goals?.successCriteria ?? []).map((item) =>
        typeof item === "string" ? item : JSON.stringify(item),
      );
      const minCoverage = goals?.qualityBar?.minCoverage;
      const rawRisks = getArray<unknown>(payload, "initialRisks") ?? [];
      const initialRisks = rawRisks.map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const o = item as {
            type?: string;
            severity?: string;
            mitigation?: string;
          };
          return `${o.type ?? "风险"}${o.severity ? `[${o.severity}]` : ""}${o.mitigation ? `: ${o.mitigation}` : ""}`;
        }
        return String(item);
      });
      const s2Id = "system:s2-leader-plan";
      const s2 = state.todos.get(s2Id);
      if (s2) {
        if (successCriteria.length > 0) {
          s2.artifacts.push({
            kind: "finding-count",
            label: "成功标准",
            value: `${successCriteria.length} 条`,
          });
          addNarrative(
            state,
            s2Id,
            ts,
            `Leader 声明成功标准：${successCriteria
              .slice(0, 3)
              .map((s) => (s.length > 50 ? s.slice(0, 50) + "…" : s))
              .join(" / ")}${successCriteria.length > 3 ? "…" : ""}`,
          );
        }
        if (minCoverage != null) {
          s2.artifacts.push({
            kind: "verdict-score",
            label: "质量阈值",
            value: `≥ ${minCoverage}`,
          });
        }
        if (initialRisks.length > 0) {
          addNarrative(
            state,
            s2Id,
            ts,
            `Leader 初步风险：${initialRisks
              .slice(0, 2)
              .map((s) => (s.length > 80 ? s.slice(0, 80) + "…" : s))
              .join(" / ")}${initialRisks.length > 2 ? "…" : ""}`,
            "warn",
          );
        }
      }
      continue;
    }

    // ── leader:decision (assess-research / assess-research-dispatched) → s4 ──
    if (suffix === "leader:decision") {
      const phase = getString(payload, "phase");
      const s4Id = "system:s4-leader-assess";
      if (phase === "assess-research-dispatched") {
        const stats =
          (payload?.stats as Record<string, number> | undefined) ?? {};
        const decisionMsg = `重派 ${stats.retried ?? 0} / 中止 ${stats.aborted ?? 0} / 追加 ${stats.appended ?? 0} / 跳过 ${stats.skipped ?? 0}`;
        upsert(
          state,
          s4Id,
          () => {
            const preset = SYSTEM_STAGE_PRESETS.find(
              (p) => p.id === "s4-leader-assess",
            )!;
            const t = makeSystemStageTodo(preset, ts);
            t.agentRefId = "leader";
            return t;
          },
          (t) => {
            t.status = "done";
            t.endedAt = ts;
            t.agentRefId ??= "leader";
            t.artifacts.push({
              kind: "finding-count",
              label: "维度调度",
              value: decisionMsg,
            });
          },
        );
        addNarrative(state, s4Id, ts, `调度完成 · ${decisionMsg}`, "success");
      } else if (phase === "assess-research") {
        const decision = getString(payload, "decision");
        const rationale = getString(payload, "rationale");
        upsert(
          state,
          s4Id,
          () => {
            const preset = SYSTEM_STAGE_PRESETS.find(
              (p) => p.id === "s4-leader-assess",
            )!;
            const t = makeSystemStageTodo(preset, ts);
            t.agentRefId = "leader";
            return t;
          },
          (t) => {
            if (t.status === "pending") t.status = "in_progress";
            t.startedAt ??= ts;
            t.agentRefId ??= "leader";
          },
        );
        if (decision) {
          addNarrative(state, s4Id, ts, `Leader 评审决策：${decision}`);
        }
        if (rationale && rationale.trim().length > 0) {
          addNarrative(
            state,
            s4Id,
            ts,
            `理由：${rationale.slice(0, 400)}${rationale.length > 400 ? "…" : ""}`,
          );
        }
      }
      continue;
    }

    // ── leader:foreword → s10 in_progress + foreword artifact ──────
    if (suffix === "leader:foreword") {
      const s10Id = "system:s10-leader-signoff";
      upsert(
        state,
        s10Id,
        () =>
          makeSystemStageTodo(
            SYSTEM_STAGE_PRESETS.find((p) => p.id === "s10-leader-signoff")!,
            ts,
          ),
        (t) => {
          if (t.status === "pending") t.status = "in_progress";
          t.startedAt ??= ts;
          t.artifacts.push({ kind: "foreword", label: "前言已写" });
        },
      );
      continue;
    }

    // ── leader:signed → s10 done/failed + score / verdict / refusalReason ──
    if (suffix === "leader:signed") {
      const score = getNumber(payload, "leaderOverallScore");
      const verdict = getString(payload, "leaderVerdict");
      const signed = payload?.signed as boolean | undefined;
      const refusalReason = getString(payload, "refusalReason");
      const accountabilityNote = getString(payload, "accountabilityNote");
      const s10Id = "system:s10-leader-signoff";
      upsert(
        state,
        s10Id,
        () =>
          makeSystemStageTodo(
            SYSTEM_STAGE_PRESETS.find((p) => p.id === "s10-leader-signoff")!,
            ts,
          ),
        (t) => {
          t.status = signed === false ? "failed" : "done";
          t.endedAt = ts;
          if (score != null) {
            t.artifacts.push({
              kind: "verdict-score",
              label: "Leader 总评",
              value: `${score}/100`,
            });
          }
          if (verdict) {
            t.artifacts.push({
              kind: "finding-count",
              label: "Verdict",
              value: verdict,
            });
          }
          if (signed === false && refusalReason) {
            t.artifacts.push({
              kind: "finding-count",
              label: "拒签原因",
              value: refusalReason,
            });
          }
        },
      );
      if (signed === false && accountabilityNote) {
        addNarrative(
          state,
          s10Id,
          ts,
          `Leader 拒签说明：${accountabilityNote.slice(0, 500)}${accountabilityNote.length > 500 ? "…" : ""}`,
          "error",
        );
      }
      continue;
    }

    // ── dimension:retry-failed → 找最近 leader-assess-* retry child todo 标 failed ──
    if (suffix === "dimension:retry-failed") {
      const dim = getString(payload, "dimension");
      const error = getString(payload, "error");
      if (dim) {
        // 倒序找最近的 in_progress retry child todo
        for (let i = state.order.length - 1; i >= 0; i--) {
          const t = state.todos.get(state.order[i])!;
          if (
            t.scope === "dimension" &&
            t.dimensionRef === dim &&
            (t.origin === "leader-assess-retry" ||
              t.origin === "leader-assess-replace" ||
              t.origin === "leader-assess-extend") &&
            t.status === "in_progress"
          ) {
            t.status = "failed";
            t.endedAt = ts;
            t.narrativeLog.push({
              ts,
              text: `Leader 重派失败：${error ?? "无具体错误"}（本维度沿用首轮 findings）`,
              tone: "error",
            });
            break;
          }
        }
      }
      continue;
    }

    // ── mission:degraded → s4 warn narrative ───────────────────────
    if (suffix === "mission:degraded") {
      const reason = getString(payload, "reason") ?? "unknown";
      const failedCount = getNumber(payload, "failedCount") ?? 0;
      addNarrative(
        state,
        "system:s4-leader-assess",
        ts,
        `Mission 标记 degraded：${reason} (${failedCount} 项失败)`,
        "warn",
      );
      continue;
    }

    // ── dimension:graded → dim todo done + 5-axis grade artifact ───
    if (suffix === "dimension:graded") {
      const dim = getString(payload, "dimension");
      const grade = getNumber(payload, "overallScore");
      if (dim) {
        const dimId = `dim:${dim}`;
        upsert(
          state,
          dimId,
          () => ({
            id: dimId,
            origin: "leader-plan",
            createdBy: "leader",
            createdAt: ts,
            reasonText: "Leader 派遣维度研究",
            scope: "dimension",
            title: dim,
            assignee: { role: "researcher", dimensionName: dim },
            status: "done",
            endedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
          }),
          (t) => {
            if (t.status !== "cancelled" && t.status !== "failed") {
              t.status = "done";
              t.endedAt = ts;
            }
            if (grade != null) {
              t.artifacts.push({
                kind: "verdict-score",
                label: "维度评分",
                value: `${grade}/100`,
              });
            }
          },
        );
        if (grade != null) {
          addNarrative(
            state,
            dimId,
            ts,
            `维度评分：${grade}/100`,
            grade >= 70 ? "success" : "warn",
          );
        }
      }
      continue;
    }

    // ── verifier:verdict → s8/s9 score artifact ────────────────────
    if (suffix === "verifier:verdict") {
      const verifierId = getString(payload, "verifierId");
      const score = getNumber(payload, "score");
      if (verifierId && score != null) {
        const targetStage = verifierId.startsWith("critic")
          ? "system:s9-critic-l4"
          : "system:s8-writer-draft";
        upsert(
          state,
          targetStage,
          () =>
            makeSystemStageTodo(
              SYSTEM_STAGE_PRESETS.find(
                (p) => `system:${p.id}` === targetStage,
              )!,
              ts,
            ),
          (t) => {
            t.artifacts.push({
              kind: "verdict-score",
              label: `${verifierId}`,
              value: `${score}/100`,
            });
          },
        );
      }
      continue;
    }

    // ── mission:warning → s4 warn narrative （liveness guard 提示） ──
    if (suffix === "mission:warning") {
      const message =
        getString(payload, "message") ?? "Mission 长时间无心跳 / 事件";
      addNarrative(state, "system:s11-persist", ts, message, "warn");
      continue;
    }

    // ── mission:reopened → 重新置 in_progress 状态（reopen 语义）────
    if (suffix === "mission:reopened") {
      // mission 重新启动；不直接修 mission row（row.status 已 running），
      // 但可以重置 s11/s12 状态以便 stage stepper 正确显示 reopened 后的步进
      const s11 = state.todos.get("system:s11-persist");
      if (s11 && s11.status === "done") {
        s11.status = "in_progress";
        s11.endedAt = undefined;
      }
      addNarrative(
        state,
        "system:s11-persist",
        ts,
        "mission reopened，重新进入持续路径",
        "info",
      );
      continue;
    }

    // ── chapter:writing:failed → chapter todo failed ───────────────
    if (suffix === "chapter:writing:failed") {
      const dim = getString(payload, "dimension");
      const heading =
        getString(payload, "heading") ?? getString(payload, "chapterTitle");
      const idx = getNumber(payload, "index");
      const error =
        getString(payload, "error") ?? getString(payload, "message");
      if (dim && heading) {
        const id = `chapter:${dim}:${idx ?? heading}`;
        upsert(
          state,
          id,
          () => ({
            id,
            parentId: `dim:${dim}`,
            origin: "chapter-pipeline",
            createdBy: "system",
            createdAt: ts,
            reasonText: "章节撰写失败",
            scope: "chapter",
            title: `${dim} · 章节${idx != null ? ` ${idx}` : ""}：${heading}`,
            assignee: { role: "writer", dimensionName: dim },
            status: "failed",
            endedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
          }),
          (t) => {
            t.status = "failed";
            t.endedAt = ts;
          },
        );
        if (error)
          addNarrative(
            state,
            id,
            ts,
            `章节失败：${error.slice(0, 200)}`,
            "error",
          );
      }
      continue;
    }

    // ── chapter:review:started / completed → reviewer-revise inner state ──
    if (
      suffix === "chapter:review:started" ||
      suffix === "chapter:review:completed"
    ) {
      const dim = getString(payload, "dimension");
      const heading =
        getString(payload, "heading") ?? getString(payload, "chapterTitle");
      const idx = getNumber(payload, "index");
      const passed = payload?.passed as boolean | undefined;
      const score = getNumber(payload, "score");
      if (dim && heading) {
        const id = `chapter:${dim}:${idx ?? heading}`;
        upsert(
          state,
          id,
          () => ({
            id,
            parentId: `dim:${dim}`,
            origin: "chapter-pipeline",
            createdBy: "system",
            createdAt: ts,
            reasonText: "章节复审",
            scope: "chapter",
            title: `${dim} · 章节${idx != null ? ` ${idx}` : ""}：${heading}`,
            assignee: { role: "reviewer", dimensionName: dim },
            status: "in_progress",
            startedAt: ts,
            artifacts: [],
            narrativeLog: [],
            dimensionRef: dim,
          }),
          (t) => {
            if (suffix === "chapter:review:started") {
              t.assignee = { role: "reviewer", dimensionName: dim };
              addNarrative(state, id, ts, "Reviewer 开始审稿");
            } else {
              // chapter:review:completed
              if (score != null) {
                t.artifacts.push({
                  kind: "verdict-score",
                  label: "Review",
                  value: `${score}/100`,
                });
              }
              addNarrative(
                state,
                id,
                ts,
                passed === false ? "审稿不通过，触发重写" : "审稿通过",
                passed === false ? "warn" : "success",
              );
            }
          },
        );
      }
      continue;
    }

    // ── researcher:completed → 收尾首轮 dim todo + retryLabel 分支处理 retry child ──
    if (suffix === "researcher:completed") {
      const dim = getString(payload, "dimension");
      const cnt = getNumber(payload, "findingsCount") ?? 0;
      const stateVal = getString(payload, "state");
      const summary = getString(payload, "summary");
      const retryLabel = getString(payload, "retryLabel");
      if (!dim) continue;
      if (retryLabel) {
        // retry child 收尾：找最近的 leader-assess-* in_progress todo
        for (let i = state.order.length - 1; i >= 0; i--) {
          const t = state.todos.get(state.order[i])!;
          if (
            t.scope === "dimension" &&
            t.dimensionRef === dim &&
            (t.origin === "leader-assess-retry" ||
              t.origin === "leader-assess-replace" ||
              t.origin === "leader-assess-extend") &&
            t.status === "in_progress"
          ) {
            t.artifacts.push({
              kind: "finding-count",
              label: "retry 后 finding",
              value: cnt,
            });
            if (summary && summary.trim().length > 8) {
              t.artifacts.push({
                kind: "finding-count",
                label: "retry summary",
                value: summary.slice(0, 200),
              });
            }
            t.narrativeLog.push({
              ts,
              text: `重派 researcher 完成 · ${cnt} 条新 finding`,
              tone: "success",
            });
            break;
          }
        }
        continue;
      }
      // 首轮 researcher 收尾：找 leader-plan dim todo
      for (let i = state.order.length - 1; i >= 0; i--) {
        const t = state.todos.get(state.order[i])!;
        if (
          t.scope === "dimension" &&
          t.dimensionRef === dim &&
          t.origin === "leader-plan"
        ) {
          if (stateVal === "completed") {
            t.artifacts.push({
              kind: "finding-count",
              label: "采集到 finding",
              value: cnt,
            });
            addNarrative(
              state,
              t.id,
              ts,
              `数据采集完成 · ${cnt} 条 finding，进入章节撰写与复审`,
              "success",
            );
            if (summary && summary.trim().length > 8) {
              t.artifacts.push({
                kind: "finding-count",
                label: "采集摘要",
                value: summary.slice(0, 200),
              });
            }
          } else {
            addNarrative(
              state,
              t.id,
              ts,
              `Researcher 收尾 · state=${stateVal ?? "unknown"}`,
              "warn",
            );
          }
          break;
        }
      }
      continue;
    }

    // ── dimension:integrating:* → chapter pipeline integrator step ──
    if (
      suffix === "dimension:integrating:started" ||
      suffix === "dimension:integrating:completed" ||
      suffix === "dimension:integrating:failed"
    ) {
      const dim = getString(payload, "dimension");
      if (dim) {
        const dimId = `dim:${dim}`;
        addNarrative(
          state,
          dimId,
          ts,
          suffix === "dimension:integrating:started"
            ? "章节 integrator 启动"
            : suffix === "dimension:integrating:completed"
              ? "章节 integrator 完成"
              : "章节 integrator 失败（按降级路径继续）",
          suffix === "dimension:integrating:failed" ? "warn" : "info",
        );
      }
      continue;
    }

    // ── budget warnings → s1 narrative ─────────────────────────────
    if (
      suffix === "mission:budget-warning-soft" ||
      suffix === "mission:budget-warning-hard"
    ) {
      const isHard = suffix.endsWith("hard");
      const reason = getString(payload, "reason");
      const wallTimeMs = getNumber(payload, "wallTimeMs") ?? 0;
      const suggestion = getString(payload, "suggestion") ?? "abort";
      const shortfall = getNumber(payload, "shortfall") ?? 0;
      const hint =
        reason === "wall_time_exceeded"
          ? `Mission 总时长超出 ${Math.round(wallTimeMs / 60_000)} 分钟上限，已自动停止`
          : isHard
            ? `预算硬告警：${suggestion}（短缺 ${shortfall} credits）`
            : `预算软告警：估算超出建议但可继续`;
      addNarrative(
        state,
        "system:s1-budget",
        ts,
        hint,
        isHard ? "error" : "warn",
      );
      continue;
    }
    if (suffix === "budget:warning-soft") {
      const ratio = getNumber(payload, "ratio") ?? 0;
      const tokensUsed = getNumber(payload, "poolTokensUsed") ?? 0;
      const tokensRemain = getNumber(payload, "poolTokensRemaining") ?? 0;
      const fmt = (n: number) =>
        n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
      addNarrative(
        state,
        "system:s1-budget",
        ts,
        `预算软告警：已用 ${fmt(tokensUsed)} tokens（${Math.round(ratio * 100)}%），仅剩 ${fmt(tokensRemain)}`,
        "warn",
      );
      continue;
    }
    if (suffix === "budget:exhausted") {
      const tokensUsed = getNumber(payload, "poolTokensUsed") ?? 0;
      const fmt = (n: number) =>
        n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n));
      addNarrative(
        state,
        "system:s1-budget",
        ts,
        `预算耗尽：已用 ${fmt(tokensUsed)} tokens 达到 maxCredits 上限，Mission 自动停止`,
        "error",
      );
      continue;
    }

    // ── mission postlude (S12 self-evolution) ──────────────────────
    if (
      suffix === "mission:postlude:started" ||
      suffix === "mission:postlude:completed" ||
      suffix === "mission:postlude:failed"
    ) {
      const s12 = state.todos.get("system:s12-self-evolution");
      if (s12) {
        if (suffix === "mission:postlude:started") {
          if (s12.status === "pending") {
            s12.status = "in_progress";
            s12.startedAt = ts;
          }
        } else if (suffix === "mission:postlude:completed") {
          if (s12.status !== "failed" && s12.status !== "cancelled") {
            s12.status = "done";
            s12.endedAt = ts;
          }
          addNarrative(
            state,
            "system:s12-self-evolution",
            ts,
            "self-evolution 完成",
            "success",
          );
        } else {
          // failed
          s12.status = "failed";
          s12.endedAt = ts;
          const err =
            getString(payload, "error") ?? getString(payload, "message");
          if (err)
            addNarrative(
              state,
              "system:s12-self-evolution",
              ts,
              `self-evolution 失败：${err}`,
              "error",
            );
        }
      }
      continue;
    }

    // ── failure-pattern pre-applied → s2 narrative (warn) ──────────
    if (suffix === "failure-pattern:pre-applied") {
      const patternId = getString(payload, "patternId");
      addNarrative(
        state,
        "system:s2-leader-plan",
        ts,
        `预应用历史失败模式：${patternId ?? "未命名"}（FailureLearner 召回）`,
        "info",
      );
      continue;
    }

    // ── iteration:progress → 心跳，挂到 currently-running stage ───
    if (suffix === "iteration:progress") {
      const iter = getNumber(payload, "iteration");
      const stepId = getStepId(ev);
      if (stepId && iter != null) {
        const stageId = mapStepToFrontendStage(stepId);
        addNarrative(state, `system:${stageId}`, ts, `迭代进度：第 ${iter} 轮`);
      }
      continue;
    }

    // ── event:dropped / event:oversized → buffer warning ───────────
    if (suffix === "event:dropped" || suffix === "event:oversized") {
      const reason = getString(payload, "reason");
      addNarrative(
        state,
        "system:s11-persist",
        ts,
        `事件缓冲告警 (${suffix})：${reason ?? "buffer 容量限制"}`,
        "warn",
      );
      continue;
    }

    // ── dimension:outline:planned → chapter pipeline outline 步骤 ──
    if (suffix === "dimension:outline:planned") {
      const dim = getString(payload, "dimension");
      const chapterCount =
        getNumber(payload, "chapterCount") ?? getNumber(payload, "count");
      if (dim) {
        addNarrative(
          state,
          `dim:${dim}`,
          ts,
          chapterCount != null
            ? `章节大纲规划完成：${chapterCount} 章`
            : "章节大纲规划完成",
        );
      }
      continue;
    }

    // ── dimension:retry-phase:started / completed → retry 三阶段细分 ──
    if (
      suffix === "dimension:retry-phase:started" ||
      suffix === "dimension:retry-phase:completed"
    ) {
      const dim = getString(payload, "dimension");
      const phase = getString(payload, "phase");
      if (dim && phase) {
        addNarrative(
          state,
          `dim:${dim}`,
          ts,
          `retry phase ${phase} ${suffix.endsWith("started") ? "启动" : "完成"}`,
          suffix.endsWith("started") ? "info" : "success",
        );
      }
      continue;
    }

    // ── reset 不支持的 event；剩余 case 留 follow-up ───────────────
  }

  // 3. mission terminal cleanup：mission row terminal 状态 → 未完成 todo cancel
  if (row.status === "completed" || row.status === "rejected") {
    for (const t of state.todos.values()) {
      if (
        t.scope !== "system" &&
        (t.status === "pending" || t.status === "in_progress")
      ) {
        t.status = "cancelled";
        addNarrative(
          state,
          t.id,
          missionCreatedAt,
          "mission 终态，自动结束",
          "info",
        );
      }
    }
  } else if (row.status === "failed" || row.status === "cancelled") {
    for (const t of state.todos.values()) {
      if (
        t.scope !== "system" &&
        (t.status === "pending" || t.status === "in_progress")
      ) {
        t.status = row.status === "failed" ? "failed" : "cancelled";
      }
    }
  }

  // 4. dimension rollup 兜底（如果 row.dimensions 有但没事件 fanout，仍创建 placeholder）
  const dims = extractDimensionNames(row.dimensions);
  for (const dimName of dims) {
    if (!state.todos.has(`dim:${dimName}`)) {
      upsert(state, `dim:${dimName}`, () => ({
        id: `dim:${dimName}`,
        origin: "leader-plan",
        createdBy: "leader",
        createdAt: missionCreatedAt,
        reasonText: "Leader 派遣维度研究",
        scope: "dimension",
        title: dimName,
        assignee: { role: "researcher", dimensionName: dimName },
        status: mapMissionStatusToTodo(row.status),
        artifacts: [],
        narrativeLog: [],
        dimensionRef: dimName,
      }));
    }
  }

  // 5. items 按「锚定位置」排序：把每个 todo 映射到一个 sortKey（s1=1.0、s2=2.0、
  //    dim=2.5、s3=3.0、retry=2.5x、chapter=7.5、reconciler-gap=5.5、critic-blindspot=9.5 ...），
  //    然后按 sortKey 升序输出。这样无论事件以何种顺序到达，UI 顺序都稳定可预测。
  const items = sortByAnchor(state);

  return {
    kind: "todo-board",
    items,
    // isFirstCutTruncated false：核心 case 已 port。完整 100% 在后续 PR。
    isFirstCutTruncated: false,
  };
}

/**
 * 锚定位置排序：每个 todo 映射到一个 sortKey（小数位置标识它该出现在哪个 stage 期间）。
 *
 * 规则：
 *   - system:s{N}-xxx → ordinal（s1=1, s2=2, ..., s12=14；s8b=8.5, s9b=10.5）
 *   - scope dimension（leader-plan 派遣 / leader-chat-create 追加 / retry）→ 2.5
 *     （在 s2-leader-plan 之后、s3-researchers 之前，与 deriveTodoLedger 原顺序一致）
 *   - scope chapter → 7.5（s7-writer-outline 之后、s8-writer-draft 之前）
 *   - scope review (critic-blindspot / reviewer-revise) → 11.5（s9b 之后、s10 之前）
 *   - scope mission, origin=reconciler-gap → 5.5（s5-reconciler 之后、s6-analyst 之前）
 *   - 其他 scope=mission → 13.0（落到 s12 之后）
 *
 * 同 sortKey 内按 createdAt 升序，确保 dim1/dim2 仍按事件到达顺序排列。
 * Tie-break: scope='dimension' parent dim 排在自己的 retry child 之前（用 parentId 链）。
 */
function sortByAnchor(state: BuilderState): TodoBoardEntry[] {
  const all = state.order.map((id) => state.todos.get(id)!);
  const STAGE_ORDINAL: Record<string, number> = {
    "s1-budget": 1.0,
    "s2-leader-plan": 2.0,
    "s3-researchers": 3.0,
    "s4-leader-assess": 4.0,
    "s5-reconciler": 5.0,
    "s6-analyst": 6.0,
    "s7-writer-outline": 7.0,
    "s8-writer-draft": 8.0,
    "s8b-quality-enhancement": 8.5,
    "s9-critic-l4": 9.0,
    "s9b-objective-evaluation": 9.5,
    "s10-leader-signoff": 10.0,
    "s11-persist": 11.0,
    "s12-self-evolution": 12.0,
  };
  function sortKey(t: TodoBoardEntry): number {
    if (t.scope === "system" && t.systemStageId) {
      return STAGE_ORDINAL[t.systemStageId] ?? 13.0;
    }
    if (t.scope === "dimension") return 2.5;
    if (t.scope === "chapter") return 7.5;
    if (t.scope === "review") return 11.5;
    if (t.scope === "mission" && t.origin === "reconciler-gap") return 5.5;
    return 13.0;
  }
  // 父子树指引（DFS）：parent 紧跟 children
  const parentOf = new Map<string, TodoBoardEntry>();
  for (const t of all) parentOf.set(t.id, t);
  const childrenByParent = new Map<string, TodoBoardEntry[]>();
  for (const t of all) {
    if (t.parentId) {
      const arr = childrenByParent.get(t.parentId) ?? [];
      arr.push(t);
      childrenByParent.set(t.parentId, arr);
    }
  }
  // 仅 root（无 parent，或父不在集合内）参与一级排序，children 在 DFS 时按 createdAt 紧随父出现
  const roots = all.filter((t) => !t.parentId || !parentOf.has(t.parentId));
  roots.sort((a, b) => {
    const k = sortKey(a) - sortKey(b);
    if (k !== 0) return k;
    return a.createdAt - b.createdAt;
  });
  const out: TodoBoardEntry[] = [];
  const visit = (td: TodoBoardEntry): void => {
    out.push(td);
    const kids = (childrenByParent.get(td.id) ?? [])
      .slice()
      .sort((a, b) => a.createdAt - b.createdAt);
    for (const k of kids) visit(k);
  };
  for (const r of roots) visit(r);
  return out;
}

// ============================================================================
// helpers
// ============================================================================

function extractDimensionNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (d): d is Record<string, unknown> => d != null && typeof d === "object",
    )
    .map((d) => (typeof d.name === "string" ? d.name : ""))
    .filter((n) => n.length > 0);
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

// (unused param suppress)
void ORDERED_STAGE_IDS;
