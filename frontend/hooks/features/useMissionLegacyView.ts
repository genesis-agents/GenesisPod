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
    cost: dvProjectCost(view),
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
  for (const s of view.stages) {
    stepStates.set(s.id, dvMapBackendStageStatusToStep(s.status));
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
  if (view.agents.length === 0) {
    return dvCollectAgentSummary(events, traceByAgent);
  }
  return view.agents
    .filter((a) => DV_KNOWN_AGENT_ROLES.has(a.role as AgentRole))
    .map(
      (a): AgentLiveState => ({
        agentId: a.id,
        role: a.role as AgentRole,
        phase: a.phase as AgentPhase,
        modelId: a.modelId,
        retryCount: a.retryCount,
        failureMessage: a.failureMessage,
        trace: traceByAgent.get(a.id) ?? [],
      })
    );
}

function dvProjectCost(view: MissionDetailView): CostState {
  const c = view.cost;
  return {
    tokensUsed: c?.tokensUsed != null ? Number(c.tokensUsed) : 0,
    costUsd: c?.costUsd ?? 0,
    byStage: [],
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

function dvDeriveMemoryFromEvents(
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
    const kind = dvTraceKindFromEventType(e.type);
    if (!kind) continue;
    const trace = out.get(e.agentId) ?? [];
    const p = e.payload ?? {};
    trace.push({
      kind,
      // Hydration safety: fallback 0 而非 Date.now()，避免 SSR/CSR 时戳 mismatch。
      ts: typeof e.timestamp === 'number' ? e.timestamp : 0,
      text: typeof p.text === 'string' ? p.text : undefined,
      toolId: typeof p.toolId === 'string' ? p.toolId : undefined,
      input: p.input,
      output: p.output,
      latencyMs: typeof p.latencyMs === 'number' ? p.latencyMs : undefined,
      tokensUsed: typeof p.tokensUsed === 'number' ? p.tokensUsed : undefined,
      error: typeof p.error === 'string' ? p.error : undefined,
    });
    out.set(e.agentId, trace);
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
    if (!e.agentId || !e.type) continue;
    const role = dvExtractRole(e);
    if (!role || !DV_KNOWN_AGENT_ROLES.has(role)) continue;
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
  if (type.endsWith('.thought') || type === 'agent.thought') return 'thought';
  if (type.endsWith('.action') || type === 'agent.action') return 'action';
  if (type.endsWith('.observation') || type === 'agent.observation')
    return 'observation';
  if (type.endsWith('.reflection') || type === 'agent.reflection')
    return 'reflection';
  if (type.endsWith('.error') || type === 'agent.error') return 'error';
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
