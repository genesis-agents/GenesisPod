/**
 * view-to-derived.shim.ts — Canonical view → legacy DerivedView 适配（B4-3）
 *
 * 落地依据：thinning plan §B4-3 / §3.1 / §6.4 / §6.7.2 / §7.2
 *
 * 目的：
 * page.tsx 与 24 个 component 当前消费 `derive.ts` 输出的 DerivedView 形状。一次性
 * 重写所有 component（B4-4）与 cutover 分离开 — 本 shim 让 page.tsx 在 B4-3 PR 内
 * 立即切换到 canonical view truth source，component 接口零变化。
 *
 * 设计约束：
 * 1. 单一 truth source：mission / stages / agents / cost / reports / finalReport 全部来自 view
 * 2. backend 尚未 expose 的字段（verdicts / memory / dimensionPipelines）由 events 派生
 *    —— 与 §7.2 "raw event timeline display" 一致，属于过渡 raw-event 解析路径
 * 3. backend canonical 字段一旦扩展（B3-1 follow-up + view 后续扩展）覆盖 verdicts / memory /
 *    dimensionPipelines，本 shim 对应分支移除
 * 4. shim 永不接 `deriveView()` 输出 — 否则就是 dual-run（§3.4 禁止）。
 *    events 走的是独立解析（raw event timeline allowed by §7.2）
 *
 * 14 backend stage → 5 frontend stage 聚合规则与 STAGE_STEPS 同步（derive.ts:90-102）。
 */

import type { MissionDetailView } from '@/services/agent-playground/api';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';
import {
  STAGE_STEPS,
  aggregateStageStatus,
  type AgentLiveState,
  type AgentPhase,
  type AgentRole,
  type AgentTraceItem,
  type CostState,
  type DerivedView,
  type MemoryIndexState,
  type MissionState,
  type ReportDraft,
  type StageId,
  type StageState,
  type StageStatus,
  type StepStatus,
  type VerifierVerdict,
  type DimensionPipelineState,
} from './derive-shapes';

const STAGE_ORDER: StageId[] = [
  'leader',
  'researchers',
  'analyst',
  'writer',
  'reviewer',
];

const KNOWN_AGENT_ROLES = new Set<AgentRole>([
  'leader',
  'researcher',
  'analyst',
  'writer',
  'reviewer',
]);

// ============================================================================
// Public entry
// ============================================================================

/**
 * 把 canonical view (+ raw events for not-yet-canonicalized fields) 适配成 DerivedView。
 *
 * @param view  来自 useMissionDetailView 的 canonical truth。null 时返回 zero-state
 *              DerivedView（不 fallback 到 deriveView，避免 dual-run）
 * @param events  来自 useAgentPlaygroundStream 的 raw event stream，仅用于派生
 *                backend 当前未 expose 的辅助字段
 */
export function viewToDerivedShim(
  view: MissionDetailView | null,
  events: PlaygroundEvent[]
): DerivedView {
  if (!view) {
    return zeroDerivedView();
  }

  return {
    mission: projectMission(view),
    stages: projectStages(view),
    agents: projectAgents(view, events),
    cost: projectCost(view),
    verdicts: deriveVerdictsFromEvents(events),
    memory: deriveMemoryFromEvents(events),
    reports: projectReports(view),
    finalReport: projectFinalReport(view),
    dimensionPipelines: deriveDimensionPipelinesFromEvents(events),
  };
}

// ============================================================================
// view-truth projections（canonical）
// ============================================================================

function projectMission(view: MissionDetailView): MissionState {
  const m = view.mission;
  const startedAt = m.startedAt ? Date.parse(m.startedAt) : undefined;
  const finishedAt = m.finishedAt ? Date.parse(m.finishedAt) : undefined;

  const out: MissionState = {
    startedAt,
    topic: m.topic ?? m.title,
    depth: m.depth,
    language: m.language,
    themeSummary: m.themeSummary,
    dimensions: m.dimensions?.map((d) => ({
      id: d.id,
      name: d.name,
      rationale: d.rationale ?? '',
    })),
    finalScore: m.finalScore,
    maxCredits: m.maxCredits,
    wallTimeMs: m.wallTimeMs,
    status: m.status,
  };

  // §6.4.1 status → DerivedView legacy timestamp fields
  if (m.status === 'completed') {
    out.completedAt = finishedAt;
  } else if (m.status === 'failed') {
    out.failedAt = finishedAt;
    out.failedMessage = m.failureMessage;
  } else if (m.status === 'cancelled') {
    out.cancelledAt = finishedAt;
  } else if (m.status === 'quality-failed') {
    // legacy DerivedView 把 quality-failed 表达为 rejectedAt + rejectedReason
    out.rejectedAt = finishedAt;
    out.rejectedReason = m.failureCode ?? undefined;
    out.rejectedMessage = m.failureMessage;
  }

  return out;
}

function projectStages(view: MissionDetailView): StageState[] {
  // 14 个 backend canonical stage → 5 个 frontend StageId 的聚合
  const stepStates = new Map<string, StepStatus>();
  const startedAtByStage = new Map<StageId, number>();
  const endedAtByStage = new Map<StageId, number>();
  const attemptsByStage = new Map<StageId, number>();

  for (const s of view.stages) {
    stepStates.set(s.id, mapBackendStageStatusToStep(s.status));
    const stageId = canonicalStageToFrontendStage(s.id);
    if (!stageId) continue;
    const startedTs = s.startedAt ? Date.parse(s.startedAt) : undefined;
    const endedTs = s.endedAt ? Date.parse(s.endedAt) : undefined;
    if (startedTs != null) {
      const existing = startedAtByStage.get(stageId);
      if (existing == null || startedTs < existing) {
        startedAtByStage.set(stageId, startedTs);
      }
    }
    if (endedTs != null) {
      const existing = endedAtByStage.get(stageId);
      if (existing == null || endedTs > existing) {
        endedAtByStage.set(stageId, endedTs);
      }
    }
    if (s.attempts != null && s.attempts > 0) {
      const existing = attemptsByStage.get(stageId) ?? 0;
      attemptsByStage.set(stageId, Math.max(existing, s.attempts));
    }
  }

  return STAGE_ORDER.map((stageId): StageState => {
    const status = aggregateStageStatus(stageId, stepStates);
    return {
      id: stageId,
      status,
      startedAt: startedAtByStage.get(stageId),
      endedAt: endedAtByStage.get(stageId),
      attempts: attemptsByStage.get(stageId),
    };
  });
}

function projectAgents(
  view: MissionDetailView,
  events: PlaygroundEvent[]
): AgentLiveState[] {
  // view.agents 是 first-cut（B2-2 阶段仅从 events 派生，可能为空）；当为空时回退到
  // 仅 events 解析以避免 UI 空白。trace 字段始终由 events 提供 — view 端尚未 expose。
  const traceByAgent = collectAgentTracesFromEvents(events);

  if (view.agents.length === 0) {
    return collectAgentSummaryFromEvents(events, traceByAgent);
  }

  return view.agents
    .filter((a) => KNOWN_AGENT_ROLES.has(a.role as AgentRole))
    .map((a): AgentLiveState => ({
      agentId: a.id,
      role: a.role as AgentRole,
      phase: a.phase as AgentPhase,
      modelId: a.modelId,
      retryCount: a.retryCount,
      failureMessage: a.failureMessage,
      trace: traceByAgent.get(a.id) ?? [],
    }));
}

function projectCost(view: MissionDetailView): CostState {
  const c = view.cost;
  return {
    tokensUsed: c?.tokensUsed != null ? Number(c.tokensUsed) : 0,
    costUsd: c?.costUsd ?? 0,
    byStage: [], // backend canonical view 当前未 expose by-stage 分摊；follow-up 字段
  };
}

function projectReports(view: MissionDetailView): ReportDraft[] {
  const artifact = view.reportArtifact;
  if (!artifact || typeof artifact !== 'object') return [];
  const a = artifact as Record<string, unknown>;
  // sentinel 情况返回空
  if (a.kind === 'empty-artifact') return [];

  const content = a.content as
    | { fullMarkdown?: string; fullReportUri?: string }
    | undefined;
  const metadata = a.metadata as { topic?: string } | undefined;
  const sections = (a.sections as unknown[]) ?? [];
  const citations = (a.citations as { url?: string }[]) ?? [];

  // 投射成 legacy ReportDraft shape — page.tsx + ArtifactReader 期待此形态
  return [
    {
      attempt: 1,
      report: {
        title: metadata?.topic,
        summary: undefined,
        sections: sections
          .filter(
            (s): s is { title?: string; anchor?: string } =>
              s != null && typeof s === 'object'
          )
          .map((s) => ({
            heading: s.title ?? '',
            body: '',
            sources: [],
          })),
        conclusion: undefined,
        citations: citations.map((c) => c.url ?? '').filter(Boolean),
      },
    },
  ];
}

function projectFinalReport(view: MissionDetailView): ReportDraft['report'] | null {
  const reports = projectReports(view);
  return reports.length > 0 ? reports[0].report : null;
}

// ============================================================================
// events-derived auxiliary fields（backend view 尚未 expose 的字段；§7.2 raw event 解析）
//
// 这些是临时分支：未来 view.mission.verdicts / view.memory / view.dimensionPipelines
// 一旦在 backend canonical view 暴露，对应函数立即删除并替换为 view 路径。
// ============================================================================

function deriveVerdictsFromEvents(events: PlaygroundEvent[]): VerifierVerdict[] {
  const verdicts: VerifierVerdict[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; payload?: Record<string, unknown> };
    if (e.type === 'agent-playground.verifier.verdict' && e.payload) {
      const p = e.payload;
      if (typeof p.verifierId === 'string' && typeof p.score === 'number') {
        verdicts.push({
          verifierId: p.verifierId,
          score: p.score,
          critique: typeof p.critique === 'string' ? p.critique : undefined,
          criteria:
            p.criteria && typeof p.criteria === 'object'
              ? (p.criteria as Record<string, number>)
              : undefined,
          modelId: typeof p.modelId === 'string' ? p.modelId : undefined,
          attempt: typeof p.attempt === 'number' ? p.attempt : undefined,
        });
      }
    }
  }
  return verdicts;
}

function deriveMemoryFromEvents(
  events: PlaygroundEvent[]
): MemoryIndexState | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; payload?: Record<string, unknown> };
    if (e.type === 'agent-playground.memory.index' && e.payload) {
      const p = e.payload;
      if (typeof p.chunks === 'number') {
        return {
          chunks: p.chunks,
          namespace:
            typeof p.namespace === 'string' ? p.namespace : undefined,
          tags: Array.isArray(p.tags)
            ? p.tags.filter((t): t is string => typeof t === 'string')
            : undefined,
        };
      }
    }
  }
  return null;
}

function deriveDimensionPipelinesFromEvents(
  events: PlaygroundEvent[]
): Map<string, DimensionPipelineState> {
  // first-cut：B3-1 TodoBoardProjector follow-up 完整 port todo-ledger.ts 时
  // 由 backend canonical view 接管。当前返回空 Map，前端 dimension pipeline 视图
  // 暂展空态；具体 chapter / outline / integrator 数据走 stream 即时显示
  // （§6.7.2 stream for immediacy）。
  return new Map();
}

function collectAgentTracesFromEvents(
  events: PlaygroundEvent[]
): Map<string, AgentTraceItem[]> {
  const out = new Map<string, AgentTraceItem[]>();
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as {
      type?: string;
      payload?: Record<string, unknown>;
      agentId?: string;
      timestamp?: number;
    };
    if (!e.type || !e.agentId) continue;
    const kind = traceKindFromEventType(e.type);
    if (!kind) continue;
    const trace = out.get(e.agentId) ?? [];
    const p = e.payload ?? {};
    trace.push({
      kind,
      ts: typeof e.timestamp === 'number' ? e.timestamp : Date.now(),
      text: typeof p.text === 'string' ? p.text : undefined,
      toolId: typeof p.toolId === 'string' ? p.toolId : undefined,
      input: p.input,
      output: p.output,
      latencyMs: typeof p.latencyMs === 'number' ? p.latencyMs : undefined,
      tokensUsed:
        typeof p.tokensUsed === 'number' ? p.tokensUsed : undefined,
      error: typeof p.error === 'string' ? p.error : undefined,
    });
    out.set(e.agentId, trace);
  }
  return out;
}

function collectAgentSummaryFromEvents(
  events: PlaygroundEvent[],
  traceByAgent: Map<string, AgentTraceItem[]>
): AgentLiveState[] {
  const out = new Map<string, AgentLiveState>();
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as {
      type?: string;
      agentId?: string;
      payload?: Record<string, unknown>;
      timestamp?: number;
    };
    if (!e.agentId || !e.type) continue;
    const role = extractRole(e);
    if (!role || !KNOWN_AGENT_ROLES.has(role)) continue;

    const a =
      out.get(e.agentId) ??
      ({
        agentId: e.agentId,
        role,
        phase: 'pending' as AgentPhase,
        trace: traceByAgent.get(e.agentId) ?? [],
      } as AgentLiveState);

    if (
      e.type === 'agent-playground.agent.started' ||
      e.type === 'agent.started'
    ) {
      a.phase = 'running';
      a.startedAt ??= e.timestamp;
    } else if (
      e.type === 'agent-playground.agent.completed' ||
      e.type === 'agent.completed'
    ) {
      a.phase = 'completed';
      a.endedAt = e.timestamp;
    } else if (
      e.type === 'agent-playground.agent.failed' ||
      e.type === 'agent.failed'
    ) {
      a.phase = 'failed';
      a.endedAt = e.timestamp;
      a.failureMessage =
        typeof e.payload?.message === 'string'
          ? e.payload.message
          : a.failureMessage;
    }

    if (e.payload && typeof e.payload.modelId === 'string') {
      a.modelId = e.payload.modelId;
    }

    out.set(e.agentId, a);
  }
  return [...out.values()];
}

// ============================================================================
// helpers
// ============================================================================

function mapBackendStageStatusToStep(
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
): StepStatus {
  if (status === 'skipped') return 'done'; // skipped 在 5-stage 聚合里等同 done
  return status;
}

/** backend 14 canonical stage id → frontend 5 high-level StageId 的映射。 */
function canonicalStageToFrontendStage(canonicalId: string): StageId | null {
  for (const stageId of STAGE_ORDER) {
    if ((STAGE_STEPS[stageId] as readonly string[]).includes(canonicalId)) {
      return stageId;
    }
  }
  // backend canonical id 与 STAGE_STEPS 内部 stepId 命名一致时上面命中；
  // 当前 backend ORDERED_STAGE_IDS（resume-rerun-policy）与 STAGE_STEPS 已对齐 — see derive.ts:90-102。
  return null;
}

function traceKindFromEventType(
  type: string
): AgentTraceItem['kind'] | null {
  if (type.endsWith('.thought') || type === 'agent.thought') return 'thought';
  if (type.endsWith('.action') || type === 'agent.action') return 'action';
  if (type.endsWith('.observation') || type === 'agent.observation')
    return 'observation';
  if (type.endsWith('.reflection') || type === 'agent.reflection')
    return 'reflection';
  if (type.endsWith('.error') || type === 'agent.error') return 'error';
  return null;
}

function extractRole(ev: { payload?: Record<string, unknown> }): AgentRole | null {
  const p = ev.payload;
  if (!p) return null;
  if (typeof p.role === 'string') return p.role as AgentRole;
  return null;
}

function zeroDerivedView(): DerivedView {
  return {
    mission: {},
    stages: STAGE_ORDER.map((id) => ({
      id,
      status: 'pending' as StageStatus,
    })),
    agents: [],
    cost: { tokensUsed: 0, costUsd: 0, byStage: [] },
    verdicts: [],
    memory: null,
    reports: [],
    finalReport: null,
    dimensionPipelines: new Map(),
  };
}
