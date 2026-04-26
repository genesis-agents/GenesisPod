/**
 * 事件 → UI state 的纯函数派生层
 *
 * 把扁平的 PlaygroundEvent[] 派生成各 widget 需要的结构化视图。
 * 所有派生应是 idempotent（重放任意 prefix 都能得到一致结果）。
 */

import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';

export type StageId =
  | 'leader'
  | 'researchers'
  | 'analyst'
  | 'writer'
  | 'reviewer';

export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

export interface StageState {
  id: StageId;
  status: StageStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  attempts?: number;
}

export type AgentRole =
  | 'leader'
  | 'researcher'
  | 'analyst'
  | 'writer'
  | 'reviewer';

export type AgentPhase = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentTraceItem {
  kind: 'thought' | 'action' | 'observation' | 'reflection' | 'error';
  ts: number;
  text?: string;
  toolId?: string;
  input?: unknown;
  output?: unknown;
  latencyMs?: number;
  tokensUsed?: number;
  error?: string;
}

export interface AgentLiveState {
  agentId: string;
  role: AgentRole;
  phase: AgentPhase;
  startedAt?: number;
  endedAt?: number;
  wallTimeMs?: number;
  iterations?: number;
  attempt?: number;
  dimension?: string;
  /** 该 agent 实际使用的 LLM 模型 id（来自 thought 事件的 payload.modelId） */
  modelId?: string;
  trace: AgentTraceItem[];
}

export interface VerifierVerdict {
  verifierId: string;
  score: number;
  critique?: string;
  criteria?: Record<string, number>;
  modelId?: string;
  attempt?: number;
}

export interface MemoryIndexState {
  chunks: number;
  namespace?: string;
  tags?: string[];
}

export interface CostState {
  tokensUsed: number;
  costUsd: number;
  byStage: { stage: string; tokensUsed: number; costUsd: number }[];
}

export interface ReportDraft {
  attempt: number;
  report: {
    title?: string;
    summary?: string;
    sections?: { heading: string; body: string; sources?: string[] }[];
    conclusion?: string;
    citations?: string[];
  };
}

export interface MissionState {
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  failedMessage?: string;
  rejectedAt?: number;
  rejectedReason?: string;
  rejectedMessage?: string;
  topic?: string;
  depth?: string;
  language?: string;
  themeSummary?: string;
  dimensions?: { id: string; name: string; rationale: string }[];
  finalScore?: number;
}

export interface DerivedView {
  mission: MissionState;
  stages: StageState[];
  agents: AgentLiveState[];
  cost: CostState;
  verdicts: VerifierVerdict[];
  memory: MemoryIndexState | null;
  reports: ReportDraft[];
  finalReport: ReportDraft['report'] | null;
}

const STAGE_ORDER: StageId[] = [
  'leader',
  'researchers',
  'analyst',
  'writer',
  'reviewer',
];

export function deriveView(events: PlaygroundEvent[]): DerivedView {
  const mission: MissionState = {};
  const stages: Map<StageId, StageState> = new Map(
    STAGE_ORDER.map((id) => [id, { id, status: 'pending' as StageStatus }])
  );
  const agents: Map<string, AgentLiveState> = new Map();
  const verdicts: VerifierVerdict[] = [];
  const reports: ReportDraft[] = [];
  let memory: MemoryIndexState | null = null;
  const costByStage = new Map<
    string,
    { tokensUsed: number; costUsd: number }
  >();
  let totalTokens = 0;
  let totalCost = 0;

  for (const ev of events) {
    const t = ev.type;
    const p = ev.payload as Record<string, unknown>;

    if (t === 'agent-playground.mission:started') {
      mission.startedAt = ev.timestamp;
      const input = p?.input as
        | { topic?: string; depth?: string; language?: string }
        | undefined;
      mission.topic = input?.topic;
      mission.depth = input?.depth;
      mission.language = input?.language;
    } else if (t === 'agent-playground.mission:completed') {
      mission.completedAt = ev.timestamp;
      mission.finalScore = p?.reviewScore as number | undefined;
    } else if (t === 'agent-playground.mission:failed') {
      mission.failedAt = ev.timestamp;
      mission.failedMessage = p?.message as string | undefined;
    } else if (t === 'agent-playground.mission:rejected') {
      mission.rejectedAt = ev.timestamp;
      mission.rejectedReason = p?.reason as string | undefined;
      mission.rejectedMessage = p?.userMessage as string | undefined;
    } else if (t === 'agent-playground.stage:started') {
      const stage = p?.stage as StageId | undefined;
      const cur = stage ? stages.get(stage) : undefined;
      if (cur) {
        cur.status = 'running';
        cur.startedAt = cur.startedAt ?? ev.timestamp;
        if (p?.attempt) cur.attempts = p.attempt as number;
      }
    } else if (t === 'agent-playground.stage:completed') {
      const stage = p?.stage as StageId | undefined;
      const cur = stage ? stages.get(stage) : undefined;
      if (cur) {
        cur.status = 'done';
        cur.endedAt = ev.timestamp;
        if (stage === 'leader') {
          mission.themeSummary = p?.themeSummary as string | undefined;
          mission.dimensions = p?.dimensions as MissionState['dimensions'];
        }
      }
    } else if (t === 'agent-playground.agent:lifecycle') {
      const agentId = (p?.agentId as string) ?? ev.agentId;
      const role = p?.role as AgentRole | undefined;
      const phase = p?.phase as 'started' | 'completed' | 'failed' | undefined;
      if (agentId && role && phase) {
        const cur =
          agents.get(agentId) ??
          ({
            agentId,
            role,
            phase: 'pending',
            trace: [],
          } as AgentLiveState);
        if (phase === 'started') {
          cur.phase = 'running';
          cur.startedAt = ev.timestamp;
          cur.attempt = (p?.attempt as number | undefined) ?? cur.attempt;
          cur.dimension = (p?.dimension as string | undefined) ?? cur.dimension;
        } else if (phase === 'completed' || phase === 'failed') {
          cur.phase = phase === 'completed' ? 'completed' : 'failed';
          cur.endedAt = ev.timestamp;
          cur.wallTimeMs =
            (p?.wallTimeMs as number | undefined) ??
            (cur.startedAt ? ev.timestamp - cur.startedAt : undefined);
          cur.iterations =
            (p?.iterations as number | undefined) ?? cur.iterations;
        }
        agents.set(agentId, cur);
      }
    } else if (
      t === 'agent-playground.agent:thought' ||
      t === 'agent-playground.agent:action' ||
      t === 'agent-playground.agent:observation' ||
      t === 'agent-playground.agent:reflection' ||
      t === 'agent-playground.agent:error'
    ) {
      const agentId = (p?.agentId as string) ?? ev.agentId;
      const role = p?.role as AgentRole | undefined;
      if (!agentId || !role) continue;
      const cur =
        agents.get(agentId) ??
        ({
          agentId,
          role,
          phase: 'pending',
          trace: [],
        } as AgentLiveState);
      const ts = (p?.originalTs as number | undefined) ?? ev.timestamp;
      let item: AgentTraceItem;
      if (t === 'agent-playground.agent:thought') {
        item = { kind: 'thought', ts, text: p?.text as string | undefined };
        // 捕获该 agent 当前使用的真实 LLM 模型
        const modelId = p?.modelId as string | undefined;
        if (modelId) cur.modelId = modelId;
      } else if (t === 'agent-playground.agent:action') {
        item = {
          kind: 'action',
          ts,
          toolId:
            (p?.toolId as string | undefined) ??
            (p?.skillId as string | undefined) ??
            (p?.subagentName as string | undefined) ??
            (p?.kind as string | undefined),
          input: p?.input,
        };
      } else if (t === 'agent-playground.agent:observation') {
        item = {
          kind: 'observation',
          ts,
          toolId: p?.toolId as string | undefined,
          output: p?.output,
          latencyMs: p?.latencyMs as number | undefined,
          tokensUsed: p?.tokensUsed as number | undefined,
          error: p?.error as string | undefined,
        };
      } else if (t === 'agent-playground.agent:reflection') {
        item = {
          kind: 'reflection',
          ts,
          text: p?.text as string | undefined,
        };
      } else {
        item = { kind: 'error', ts, error: p?.message as string | undefined };
      }
      cur.trace.push(item);
      cur.trace.sort((a, b) => a.ts - b.ts);
      agents.set(agentId, cur);
    } else if (t === 'agent-playground.cost:tick') {
      // Backend emits cumulative tokensUsed/costUsd + per-stage delta
      totalTokens = Math.max(totalTokens, (p?.tokensUsed as number) ?? 0);
      totalCost = Math.max(totalCost, (p?.costUsd as number) ?? 0);
      const stage = p?.stage as string | undefined;
      const deltaTokens = (p?.deltaTokens as number) ?? 0;
      const deltaCostUsd = (p?.deltaCostUsd as number) ?? 0;
      if (stage && (deltaTokens > 0 || deltaCostUsd > 0)) {
        // sum deltas per-stage（同 stage 多次 emit 例如 researchers × N 全部累加）
        const prev = costByStage.get(stage) ?? { tokensUsed: 0, costUsd: 0 };
        costByStage.set(stage, {
          tokensUsed: prev.tokensUsed + deltaTokens,
          costUsd: prev.costUsd + deltaCostUsd,
        });
      }
    } else if (t === 'agent-playground.verifier:verdict') {
      verdicts.push({
        verifierId: p?.verifierId as string,
        score: p?.score as number,
        critique: p?.critique as string | undefined,
        criteria: p?.criteria as Record<string, number> | undefined,
        modelId: p?.modelId as string | undefined,
        attempt: p?.attempt as number | undefined,
      });
    } else if (t === 'agent-playground.memory:indexed') {
      memory = {
        chunks: (p?.chunks as number) ?? 0,
        namespace: p?.namespace as string | undefined,
        tags: p?.tags as string[] | undefined,
      };
    } else if (t === 'agent-playground.report:draft') {
      reports.push({
        attempt: (p?.attempt as number) ?? 1,
        report: p?.report as ReportDraft['report'],
      });
    }
  }

  // 派生派生：把 attempts 信息 collapse 到最新一次
  const finalReport =
    reports.length > 0 ? reports[reports.length - 1].report : null;

  // 衍生 stage detail
  const stageList = STAGE_ORDER.map((id) => {
    const s = stages.get(id) ?? { id, status: 'pending' as StageStatus };
    if (id === 'researchers') {
      const researchers = [...agents.values()].filter(
        (a) => a.role === 'researcher'
      );
      const done = researchers.filter((r) => r.phase === 'completed').length;
      if (researchers.length > 0) {
        s.detail = `${done}/${researchers.length} dimensions complete`;
      }
    } else if (id === 'reviewer') {
      const lastVerdicts = verdicts.filter(
        (v) =>
          v.attempt ===
          (verdicts.length > 0
            ? Math.max(...verdicts.map((vv) => vv.attempt ?? 1))
            : 1)
      );
      if (lastVerdicts.length > 0) {
        const avg =
          Math.round(
            (lastVerdicts.reduce((sum, v) => sum + v.score, 0) /
              lastVerdicts.length) *
              10
          ) / 10;
        s.detail = `Consensus score: ${avg}`;
      }
    } else if (id === 'writer') {
      if (reports.length > 1) s.detail = `${reports.length} attempts`;
    }
    return s;
  });

  const cost: CostState = {
    tokensUsed: totalTokens,
    costUsd: totalCost,
    byStage: [...costByStage.entries()].map(([stage, v]) => ({
      stage,
      tokensUsed: v.tokensUsed,
      costUsd: v.costUsd,
    })),
  };

  // 排序 agents 用展示
  const agentList = [...agents.values()].sort((a, b) => {
    const order: Record<AgentRole, number> = {
      leader: 0,
      researcher: 1,
      analyst: 2,
      writer: 3,
      reviewer: 4,
    };
    if (order[a.role] !== order[b.role]) return order[a.role] - order[b.role];
    return a.agentId.localeCompare(b.agentId);
  });

  return {
    mission,
    stages: stageList,
    agents: agentList,
    cost,
    verdicts,
    memory,
    reports,
    finalReport,
  };
}
