/**
 * useMissionLegacyView.ts — canonical view -> frontend legacy DerivedView shape adapter
 *
 * 落地依据：thinning plan §B5-2 / §3.4 / §7.2
 *
 * 2026-05-26 收口：原 lib/features/agent-playground/view-to-derived.shim.ts 删除后
 * 这层适配从 page.tsx 抽出为独立 hook，与 useMissionDetailView 配套使用。
 * 命名含 "Legacy" 显式提示这是过渡 adapter；component-level cutover 完成
 * （ArtifactReader / TodoDetailDrawer / MissionTodoBoard 等改吃 canonical view）后此 hook 即可退役。
 *
 * canonical view -> DerivedView 形状适配规则：
 *   - mission.status -> legacy completedAt / failedAt / cancelledAt / rejectedAt (由 finishedAt 派生)
 *   - 14 backend canonical stage -> 5 frontend StageId (STAGE_STEPS 聚合)
 *   - agents trace 由 raw events 解析（§7.2 raw event timeline display 合规）
 *   - verdicts / memoryIndex / dimensionPipelines 优先 canonical view，缺则 events 派生
 *   - reportArtifact (ReportArtifactV2 | EmptyArtifactSentinel) -> ReportDraft 形状
 */

import { useMemo } from 'react';
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
} from '@/lib/features/agent-playground/mission-presentation.types';

const DV_STAGE_ORDER: StageId[] = [
  'leader',
  'researchers',
  'analyst',
  'writer',
  'reviewer',
];

const DV_KNOWN_AGENT_ROLES = new Set<AgentRole>([
  'leader',
  'researcher',
  'analyst',
  'writer',
  'reviewer',
]);

export function useMissionLegacyView(
  missionView: MissionDetailView | null | undefined,
  events: PlaygroundEvent[]
): DerivedView {
  return useMemo(
    () => buildLegacyDerivedView(missionView, events),
    [missionView, events]
  );
}

function buildLegacyDerivedView(
  view: MissionDetailView | null | undefined,
  events: PlaygroundEvent[]
): DerivedView {
  if (!view) return dvZeroView();
  return {
    mission: dvProjectMission(view),
    stages: dvProjectStages(view),
    agents: dvProjectAgents(view, events),
    cost: dvProjectCost(view, events),
    verdicts: dvProjectVerdicts(view, events),
    memory: dvProjectMemory(view, events),
    reports: dvProjectReports(view),
    finalReport: dvProjectFinalReport(view),
    dimensionPipelines: dvProjectDimensionPipelines(view),
  };
}

function dvProjectMission(view: MissionDetailView): MissionState {
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
  if (m.status === 'completed') {
    out.completedAt = finishedAt;
  } else if (m.status === 'failed') {
    out.failedAt = finishedAt;
    out.failedMessage = m.failureMessage;
  } else if (m.status === 'cancelled') {
    out.cancelledAt = finishedAt;
  } else if (m.status === 'quality-failed') {
    out.rejectedAt = finishedAt;
    out.rejectedReason = m.failureCode ?? undefined;
    out.rejectedMessage = m.failureMessage;
  }
  return out;
}

function dvProjectStages(view: MissionDetailView): StageState[] {
  const stepStates = new Map<string, StepStatus>();
  const startedAtByStage = new Map<StageId, number>();
  const endedAtByStage = new Map<StageId, number>();
  const attemptsByStage = new Map<StageId, number>();
  // ★ 2026-05-27 Screenshot_35 修复：mission 已终态 (completed / quality-failed
  //   / failed / cancelled) 仍残留个别 stage.status === 'running' 时，DAG 节点
  //   popup 会显示"运行中"。前端做 terminal sweep，让 status 与 mission 终态一致。
  // ★ 2026-05-27 强化 (Screenshot 66-69): 不只看 status 字段, 还看时间戳 — 后端
  //   有时把 completedAt/failedAt/cancelledAt 写完了 status 字段还没更新到 row
  //   (race window). 任何一个终态时间戳被设置, 都视为该方向的终态。
  const missionStatus = view.mission.status;
  const m = view.mission;
  const hasCompletedAt = !!(m as { completedAt?: string }).completedAt;
  const hasFailedAt = !!(m as { failedAt?: string }).failedAt;
  const hasCancelledAt = !!(m as { cancelledAt?: string }).cancelledAt;
  // canonical status 字段只暴露 starting/running/completed/quality-failed 四值;
  //   failure/cancel 通过 failedAt/cancelledAt 时间戳表达 (类型设计).
  const isTerminalSuccess =
    missionStatus === 'completed' ||
    missionStatus === 'quality-failed' ||
    hasCompletedAt;
  const isTerminalFailure = hasFailedAt || hasCancelledAt;
  for (const s of view.stages) {
    let effectiveStatus = s.status;
    if (effectiveStatus === 'running') {
      if (isTerminalSuccess) effectiveStatus = 'done';
      else if (isTerminalFailure) effectiveStatus = 'failed';
    }
    stepStates.set(s.id, dvMapBackendStageStatusToStep(effectiveStatus));
    const stageId = dvCanonicalStageToFrontendStage(s.id);
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
  return DV_STAGE_ORDER.map((stageId): StageState => {
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

function dvProjectAgents(
  view: MissionDetailView,
  events: PlaygroundEvent[]
): AgentLiveState[] {
  const traceByAgent = dvCollectAgentTraces(events);
  const out =
    view.agents.length === 0
      ? dvCollectAgentSummary(events, traceByAgent)
      : view.agents
          .filter((a) => DV_KNOWN_AGENT_ROLES.has(a.role as AgentRole))
          .map(
            (a): AgentLiveState => ({
              agentId: a.id,
              role: a.role as AgentRole,
              phase: a.phase as AgentPhase,
              modelId: a.modelId,
              retryCount: a.retryCount,
              failureMessage: a.failureMessage,
              // ★ 2026-05-27 (Screenshot_19)：透传 ComputeUsagePanel 需要的 4 字段
              attempt: (a as { attempt?: number }).attempt,
              dimension: (a as { dimension?: string }).dimension,
              iterations: (a as { iterations?: number }).iterations,
              wallTimeMs: (a as { wallTimeMs?: number }).wallTimeMs,
              startedAt: (a as { startedAt?: number }).startedAt,
              endedAt: (a as { endedAt?: number }).endedAt,
              trace: traceByAgent.get(a.id) ?? [],
              // ★ 2026-05-27 (#109): tokens / toolCallCount 从 trace 派生 fallback.
              //   backend agent-view.projector 暂未暴露 per-agent cost / token /
              //   tool 计数字段, 先在前端从 traceByAgent 算; costUsd 留 undefined.
              ...computeAgentTraceMetrics(traceByAgent.get(a.id) ?? []),
            })
          );

  // ★ 2026-05-27 (Screenshot_17 状态一致 mirror)：mission 已终态时，前端 fallback
  //   path 也 sweep 滞留 running/pending 的 agent，与 backend agent-view.projector
  //   行为对齐。让 view.agents 空（live mission 后 buffer evict）走 events 派生
  //   的路径也不会显示 "23 个 Agent 正在工作"假象。
  // ★ 2026-05-27 强化 (Screenshot 66-69 Leader/Writer 仍"运行中"): 同步 dvProjectStages
  //   的强化逻辑 — 不只 status 字段, 还看时间戳。
  const status = view.mission?.status;
  const m = view.mission;
  const hasCompletedAt = !!(m as { completedAt?: string } | undefined)
    ?.completedAt;
  const hasFailedAt = !!(m as { failedAt?: string } | undefined)?.failedAt;
  const hasCancelledAt = !!(m as { cancelledAt?: string } | undefined)
    ?.cancelledAt;
  const isTerminalSuccess =
    status === 'completed' || status === 'quality-failed' || hasCompletedAt;
  const isTerminalFailure = hasFailedAt || hasCancelledAt;
  const isTerminal = isTerminalSuccess || isTerminalFailure;
  if (isTerminal) {
    for (const a of out) {
      if (a.phase === 'running' || a.phase === 'pending') {
        a.phase = isTerminalSuccess ? 'completed' : 'failed';
      }
    }
  }
  return out;
}

/**
 * ★ 2026-05-27 (#109): 从 trace 派生 per-agent tokens / 工具调用次数, 给
 *   ComputeUsagePanel AgentInstanceTable 用。backend canonical view 暂未在
 *   agent 字段上暴露这些计数, 先在前端聚合。
 */
function computeAgentTraceMetrics(trace: AgentTraceItem[]): {
  tokensUsed?: number;
  toolCallCount?: number;
} {
  if (!trace || trace.length === 0) return {};
  let tokens = 0;
  let actionCount = 0;
  for (const t of trace) {
    if (typeof t.tokensUsed === 'number') tokens += t.tokensUsed;
    if (t.kind === 'action') actionCount += 1;
  }
  return {
    tokensUsed: tokens > 0 ? tokens : undefined,
    toolCallCount: actionCount > 0 ? actionCount : undefined,
  };
}

function dvProjectCost(
  view: MissionDetailView,
  events: PlaygroundEvent[]
): CostState {
  const c = view.cost;
  // ★ 2026-05-27 (回归恢复)：baseline 15d2e93ab 从 cost:tick 事件 deltaTokens /
  //   deltaCostUsd 按 stage 聚合 byStage。thinning shim 直接给 [] → ComputeUsagePanel /
  //   CostBreakdownPanel 永远显示空。这里从 events 派生回来。
  const byStageMap = new Map<string, { tokensUsed: number; costUsd: number }>();
  let summedTokens = 0;
  let summedCost = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; payload?: Record<string, unknown> };
    if (!e.type) continue;
    if (e.type.endsWith('cost:tick') || e.type === 'cost:tick') {
      const p = e.payload ?? {};
      const stage = typeof p.stage === 'string' ? p.stage : undefined;
      const dTok = typeof p.deltaTokens === 'number' ? p.deltaTokens : 0;
      const dCost = typeof p.deltaCostUsd === 'number' ? p.deltaCostUsd : 0;
      summedTokens += Math.max(0, dTok);
      summedCost += Math.max(0, dCost);
      if (stage && (dTok > 0 || dCost > 0)) {
        const prev = byStageMap.get(stage) ?? { tokensUsed: 0, costUsd: 0 };
        byStageMap.set(stage, {
          tokensUsed: prev.tokensUsed + dTok,
          costUsd: prev.costUsd + dCost,
        });
      }
    }
  }
  return {
    tokensUsed: c?.tokensUsed != null ? Number(c.tokensUsed) : summedTokens,
    costUsd: c?.costUsd ?? summedCost,
    byStage: Array.from(byStageMap.entries()).map(([stage, v]) => ({
      stage,
      tokensUsed: v.tokensUsed,
      costUsd: v.costUsd,
    })),
  };
}

function dvProjectReports(view: MissionDetailView): ReportDraft[] {
  const artifact = view.reportArtifact;
  if (!artifact || typeof artifact !== 'object') return [];
  const a = artifact as Record<string, unknown>;
  if (a.kind === 'empty-artifact') return [];
  const metadata = a.metadata as { topic?: string } | undefined;
  const sections = (a.sections as unknown[]) ?? [];
  const citations = (a.citations as { url?: string }[]) ?? [];
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

function dvProjectFinalReport(
  view: MissionDetailView
): ReportDraft['report'] | null {
  const reports = dvProjectReports(view);
  return reports.length > 0 ? reports[0].report : null;
}

function dvProjectVerdicts(
  view: MissionDetailView,
  events: PlaygroundEvent[]
): VerifierVerdict[] {
  const v = view.verdicts;
  if (Array.isArray(v) && v.length > 0) return v;
  return dvDeriveVerdictsFromEvents(events);
}

function dvProjectMemory(
  view: MissionDetailView,
  events: PlaygroundEvent[]
): MemoryIndexState | null {
  const mi = view.memoryIndex;
  if (mi) return mi;
  return dvDeriveMemoryFromEvents(events);
}

function dvProjectDimensionPipelines(
  view: MissionDetailView
): Map<string, DimensionPipelineState> {
  const dp = view.dimensionPipelines as
    | Record<string, DimensionPipelineState>
    | undefined;
  if (dp && Object.keys(dp).length > 0) {
    return new Map(Object.entries(dp));
  }
  return new Map();
}

function dvDeriveVerdictsFromEvents(
  events: PlaygroundEvent[]
): VerifierVerdict[] {
  const verdicts: VerifierVerdict[] = [];
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; payload?: Record<string, unknown> };
    // ★ 2026-05-27 #97 修复：backend 实际 emit COLON 形态（agent-playground.events.ts
    //   注册为 `verifier:verdict`，s8-writer-draft-report.stage.ts:327 实际发送）。
    //   前端旧代码用 DOT → 永远不匹配 → verdicts 永远空。同时容忍 legacy DOT 形态。
    if (
      (e.type === 'agent-playground.verifier:verdict' ||
        e.type === 'agent-playground.verifier.verdict') &&
      e.payload
    ) {
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

function dvDeriveMemoryFromEvents(
  events: PlaygroundEvent[]
): MemoryIndexState | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i];
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as { type?: string; payload?: Record<string, unknown> };
    // ★ 2026-05-27 修复 Screenshot_48：backend 实际 emit 的是 `memory:indexed`
    //   (COLON, 注册在 agent-playground.events.ts:175)；S8-writer 完成后由
    //   trajectory indexer 发出。旧版前端找 `memory.index` (DOT, 不存在) →
    //   memory panel 永远空 + 显示"backend 待补数据"假象。同时兼容 .index
    //   后缀以防有别处保留旧形态。
    if (
      e.type === 'agent-playground.memory:indexed' ||
      e.type === 'agent-playground.memory.index' ||
      e.type === 'agent-playground.memory.indexed'
    ) {
      if (!e.payload) continue;
      const p = e.payload;
      if (typeof p.chunks === 'number') {
        return {
          chunks: p.chunks,
          namespace: typeof p.namespace === 'string' ? p.namespace : undefined,
          tags: Array.isArray(p.tags)
            ? p.tags.filter((t): t is string => typeof t === 'string')
            : undefined,
        };
      }
    }
  }
  return null;
}

function dvCollectAgentTraces(
  events: PlaygroundEvent[]
): Map<string, AgentTraceItem[]> {
  // ★ 2026-05-27 (Screenshot_13/15/16 回归)：恢复 baseline 15d2e93ab derive.ts 的
  //   完整 trace 提取。Backend 发的是 `agent:thought` / `agent:action` /
  //   `agent:observation` / `agent:reflection` / `agent:error` (COLON)，
  //   thinning 期间 shim 误改成 `.thought` (DOT) → 永远不匹配 → 所有 trace 为空 →
  //   AgentInspector / TodoDetailDrawer 工具调用 / Tokens / 推理过程全部丢失。
  //   规则覆盖：
  //   - agent:thought  →  { kind: 'thought', text, (capture modelId on side) }
  //   - agent:action   →  { kind: 'action',  toolId, input } + parallel_tool_call 拍平
  //   - agent:observation → { kind: 'observation', toolId, output, latencyMs, tokensUsed, error }
  //   - agent:reflection → { kind: 'reflection', text or verdict }
  //   - agent:error    →  { kind: 'error', error }
  const out = new Map<string, AgentTraceItem[]>();
  for (const ev of events) {
    if (!ev || typeof ev !== 'object') continue;
    const e = ev as {
      type?: string;
      payload?: Record<string, unknown>;
      agentId?: string;
      timestamp?: number;
    };
    if (!e.type) continue;
    const kind = dvTraceKindFromEventType(e.type);
    if (!kind) continue;
    const p = e.payload ?? {};
    const agentId =
      (typeof p.agentId === 'string' ? p.agentId : undefined) ?? e.agentId;
    if (!agentId) continue;
    // Hydration safety: fallback 0 而非 Date.now()
    const ts =
      (typeof p.originalTs === 'number' ? p.originalTs : undefined) ??
      (typeof e.timestamp === 'number' ? e.timestamp : 0);
    const trace = out.get(agentId) ?? [];

    if (kind === 'action') {
      // parallel_tool_call 拍平：每个 calls[] 元素拆成独立 action trace
      const subKind = typeof p.kind === 'string' ? p.kind : undefined;
      if (subKind === 'parallel_tool_call' && Array.isArray(p.calls)) {
        (p.calls as unknown[]).forEach((sub, i) => {
          if (!sub || typeof sub !== 'object') return;
          const s = sub as Record<string, unknown>;
          trace.push({
            kind: 'action',
            ts: ts + i * 0.001,
            toolId:
              (typeof s.toolId === 'string' ? s.toolId : undefined) ??
              (typeof s.skillId === 'string' ? s.skillId : undefined) ??
              (typeof s.kind === 'string' ? s.kind : undefined),
            input: s.input,
          });
        });
        trace.sort((a, b) => a.ts - b.ts);
        out.set(agentId, trace);
        continue;
      }
      trace.push({
        kind: 'action',
        ts,
        toolId:
          (typeof p.toolId === 'string' ? p.toolId : undefined) ??
          (typeof p.skillId === 'string' ? p.skillId : undefined) ??
          (typeof p.subagentName === 'string' ? p.subagentName : undefined) ??
          (typeof p.kind === 'string' ? p.kind : undefined),
        input: p.input,
      });
    } else if (kind === 'observation') {
      trace.push({
        kind: 'observation',
        ts,
        toolId:
          (typeof p.toolId === 'string' ? p.toolId : undefined) ??
          (typeof p.kind === 'string' ? p.kind : undefined),
        output: p.output,
        latencyMs: typeof p.latencyMs === 'number' ? p.latencyMs : undefined,
        tokensUsed: typeof p.tokensUsed === 'number' ? p.tokensUsed : undefined,
        error: typeof p.error === 'string' ? p.error : undefined,
      });
    } else if (kind === 'thought') {
      trace.push({
        kind: 'thought',
        ts,
        text: typeof p.text === 'string' ? p.text : undefined,
      });
    } else if (kind === 'reflection') {
      const text = typeof p.text === 'string' ? p.text : undefined;
      const verdict = typeof p.verdict === 'string' ? p.verdict : undefined;
      trace.push({
        kind: 'reflection',
        ts,
        text: text ?? (verdict ? `[verdict: ${verdict}]` : undefined),
      });
    } else {
      trace.push({
        kind: 'error',
        ts,
        error:
          (typeof p.error === 'string' ? p.error : undefined) ??
          (typeof p.message === 'string' ? p.message : undefined),
      });
    }
    trace.sort((a, b) => a.ts - b.ts);
    out.set(agentId, trace);
  }
  return out;
}

function dvCollectAgentSummary(
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
    if (!e.type) continue;
    const agentId =
      (typeof e.payload?.agentId === 'string'
        ? e.payload.agentId
        : undefined) ?? e.agentId;
    if (!agentId) continue;
    const role = dvExtractRole(e) ?? dvDeriveRoleFromAgentId(agentId);
    if (!role || !DV_KNOWN_AGENT_ROLES.has(role)) continue;
    const a =
      out.get(agentId) ??
      ({
        agentId,
        role,
        phase: 'pending' as AgentPhase,
        trace: traceByAgent.get(agentId) ?? [],
      } as AgentLiveState);

    // ★ 2026-05-27 (回归恢复)：优先从 `agent:lifecycle` 单事件 + payload.phase
    //   读取生命周期（baseline 15d2e93ab 原本是这个路径）。这是 harness 发的
    //   单一 lifecycle 信号；business 派生（chapter:writing:completed 等）作为 fallback。
    if (
      e.type === 'agent-playground.agent:lifecycle' ||
      e.type === 'agent:lifecycle' ||
      e.type.endsWith('.agent:lifecycle')
    ) {
      const p = e.payload ?? {};
      const phase = p.phase;
      if (phase === 'started') {
        if (a.phase === 'pending') a.phase = 'running';
        a.startedAt ??= e.timestamp;
        if (typeof p.attempt === 'number') a.attempt = p.attempt;
        if (typeof p.dimension === 'string') a.dimension = p.dimension;
      } else if (phase === 'completed') {
        a.phase = 'completed';
        a.endedAt = e.timestamp;
        // baseline 还落 wallTimeMs / iterations 让 Inspector / 卡片显示真实耗时
        if (typeof p.wallTimeMs === 'number') {
          a.wallTimeMs = p.wallTimeMs;
        } else if (a.startedAt && typeof e.timestamp === 'number') {
          a.wallTimeMs = e.timestamp - a.startedAt;
        }
        if (typeof p.iterations === 'number') a.iterations = p.iterations;
      } else if (phase === 'failed') {
        a.phase = 'failed';
        a.endedAt = e.timestamp;
        const msg = p.error ?? p.message;
        if (typeof msg === 'string') a.failureMessage = msg;
        if (typeof p.wallTimeMs === 'number') {
          a.wallTimeMs = p.wallTimeMs;
        } else if (a.startedAt && typeof e.timestamp === 'number') {
          a.wallTimeMs = e.timestamp - a.startedAt;
        }
        if (typeof p.iterations === 'number') a.iterations = p.iterations;
      }
      if (typeof p.modelId === 'string') a.modelId = p.modelId;
      out.set(agentId, a);
      continue;
    }
    // dimension:retrying → 把 agent.retryCount + lastRetryReason 落上
    if (
      e.type === 'agent-playground.dimension:retrying' ||
      e.type.endsWith('.dimension:retrying')
    ) {
      const p = e.payload ?? {};
      a.retryCount = (a.retryCount ?? 0) + 1;
      if (typeof p.reason === 'string') a.lastRetryReason = p.reason;
      out.set(agentId, a);
      continue;
    }
    // ★ 2026-05-27 修复（Screenshot_5 "全是未启动"）：playground 不发独立 agent.X
    //   事件，agent 生命周期 derive 自 chapter / dim / leader 等业务事件。
    //   规则与后端 agent-view.projector.deriveVerbFromEventType 对齐。
    const verb =
      e.type === 'agent-playground.agent.started' || e.type === 'agent.started'
        ? 'started'
        : e.type === 'agent-playground.agent.completed' ||
            e.type === 'agent.completed'
          ? 'completed'
          : e.type === 'agent-playground.agent.failed' ||
              e.type === 'agent.failed'
            ? 'failed'
            : dvDeriveAgentVerbFromEventType(e.type);
    if (verb === 'started') {
      if (a.phase === 'pending') a.phase = 'running';
      a.startedAt ??= e.timestamp;
    } else if (verb === 'completed') {
      a.phase = 'completed';
      a.endedAt = e.timestamp;
    } else if (verb === 'failed') {
      a.phase = 'failed';
      a.endedAt = e.timestamp;
      a.failureMessage =
        typeof e.payload?.message === 'string'
          ? e.payload.message
          : a.failureMessage;
    } else {
      // 任何带 agentId 的事件，没有显式 verb 也至少标 running
      if (a.phase === 'pending') a.phase = 'running';
    }
    if (e.payload && typeof e.payload.modelId === 'string') {
      a.modelId = e.payload.modelId;
    }
    out.set(agentId, a);
  }
  return [...out.values()];
}

function dvDeriveRoleFromAgentId(agentId: string): AgentRole | null {
  const prefix = agentId.split(/[#.]/)[0]?.toLowerCase();
  if (!prefix) return null;
  // 收口到 AgentRole 5 个值；prefix 在外延上更细（critic/reconciler/steward/verifier）
  // 视觉上归到最贴近的 5 个 canonical role：
  //   critic / verifier → reviewer（同 reviewer 一类，看产出 quality）
  //   reconciler → analyst（综合多源、聚合视角）
  //   steward → leader（leader 的辅助管理职责）
  if (prefix.includes('writer')) return 'writer';
  if (
    prefix.includes('reviewer') ||
    prefix === 'quality-judge' ||
    prefix === 'critic' ||
    prefix.includes('critic') ||
    prefix === 'verifier'
  )
    return 'reviewer';
  if (prefix === 'researcher') return 'researcher';
  if (prefix === 'leader' || prefix === 'steward') return 'leader';
  if (prefix === 'reconciler' || prefix === 'analyst') return 'analyst';
  return null;
}

function dvDeriveAgentVerbFromEventType(
  eventType: string
): 'started' | 'completed' | 'failed' | null {
  if (
    eventType.endsWith('chapter:writing:completed') ||
    eventType.endsWith('chapter:done') ||
    eventType.endsWith('chapter:review:completed') ||
    eventType.endsWith('dimension:research:completed') ||
    eventType.endsWith('dimension:graded') ||
    eventType.endsWith('dimension:integrating:completed') ||
    eventType.endsWith('leader:signed') ||
    eventType.endsWith('leader:decision') ||
    eventType.endsWith('critic:verdict')
  ) {
    return 'completed';
  }
  if (
    eventType.endsWith('chapter:writing:failed') ||
    eventType.endsWith('dimension:retry-failed') ||
    eventType.endsWith('dimension:integrating:failed')
  ) {
    return 'failed';
  }
  if (
    eventType.endsWith('chapter:writing:started') ||
    eventType.endsWith('chapter:review:started') ||
    eventType.endsWith('dimension:research:started') ||
    eventType.endsWith('dimension:integrating:started') ||
    eventType.endsWith('dimension:outline:planned')
  ) {
    return 'started';
  }
  return null;
}

function dvMapBackendStageStatusToStep(
  status: 'pending' | 'running' | 'done' | 'failed' | 'skipped'
): StepStatus {
  if (status === 'skipped') return 'done';
  return status;
}

function dvCanonicalStageToFrontendStage(canonicalId: string): StageId | null {
  for (const stageId of DV_STAGE_ORDER) {
    if (STAGE_STEPS[stageId].includes(canonicalId)) {
      return stageId;
    }
  }
  return null;
}

function dvTraceKindFromEventType(type: string): AgentTraceItem['kind'] | null {
  // ★ 2026-05-27 (Screenshot_13 回归)：backend harness 用 `agent:thought` (COLON) 而非
  //   `agent.thought` (DOT)。thinning shim 误改 → 永远不匹配。这里保留 COLON 主格式
  //   + DOT 兼容（防 fixture / 旧 stream 退化用）。
  if (type.endsWith(':thought') || type.endsWith('.thought')) return 'thought';
  if (type.endsWith(':action') || type.endsWith('.action')) return 'action';
  if (type.endsWith(':observation') || type.endsWith('.observation'))
    return 'observation';
  if (type.endsWith(':reflection') || type.endsWith('.reflection'))
    return 'reflection';
  if (type.endsWith(':error') || type.endsWith('.error')) return 'error';
  return null;
}

function dvExtractRole(ev: {
  payload?: Record<string, unknown>;
}): AgentRole | null {
  const p = ev.payload;
  if (!p) return null;
  if (typeof p.role === 'string') return p.role as AgentRole;
  return null;
}

function dvZeroView(): DerivedView {
  return {
    mission: {},
    stages: DV_STAGE_ORDER.map((id) => ({
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
