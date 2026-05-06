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

/**
 * 把 backend pipeline 内部 stepId 映射到 5 个高层 StageId。
 * 一个 StageId 可对应多个 stepId（如 leader = s1-budget + s2-leader-plan +
 * s4-leader-assess + s10-leader-foreword-signoff + s11-persist）。
 *
 * 来源：backend/src/modules/ai-app/agent-playground/playground.config.ts 的 13 step。
 *
 * 未知 stepId 返 null，让调用方决定如何处理（不要默默映射到错的 stage）。
 */
export function mapStepIdToStageId(stepId: string | undefined): StageId | null {
  if (!stepId) return null;
  // 直接传旧 StageId（兼容 pre-单轨化 fixture / 显式调用）
  if (
    stepId === 'leader' ||
    stepId === 'researchers' ||
    stepId === 'analyst' ||
    stepId === 'writer' ||
    stepId === 'reviewer'
  ) {
    return stepId;
  }
  if (
    stepId === 's1-budget' ||
    stepId === 's2-leader-plan' ||
    stepId === 's4-leader-assess' ||
    stepId === 's10-leader-foreword-signoff' ||
    stepId === 's11-persist' ||
    stepId === 's12-self-evolution'
  ) {
    return 'leader';
  }
  if (stepId === 's3-researchers' || stepId === 's3-researcher-collect') {
    return 'researchers';
  }
  if (stepId === 's5-reconciler' || stepId === 's6-analyst') {
    return 'analyst';
  }
  if (
    stepId === 's7-writer-outline' ||
    stepId === 's8-writer-draft' ||
    stepId === 's8b-section-quality-enhancement' ||
    stepId === 's8b-quality-enhancement'
  ) {
    return 'writer';
  }
  if (
    stepId === 's9-critic' ||
    stepId === 's9-reviewer-critic-l4' ||
    stepId === 's9b-objective-evaluation' ||
    stepId === 's9b-objective-eval'
  ) {
    return 'reviewer';
  }
  return null;
}

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

/** 顶层 Agent 卡片可见的角色集合 —— sub-agent (chapter-writer / outline / integrator /
 *  quality-judge) 不在此列：它们的轨迹只进入 dimensionPipelines，不进入 agents grid */
const KNOWN_AGENT_ROLES = new Set<AgentRole>([
  'leader',
  'researcher',
  'analyst',
  'writer',
  'reviewer',
]);

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
  /** lifecycle:failed 携带的失败消息（orchestrator 已用 extractFailureMessage 提取） */
  failureMessage?: string;
  /** 自愈重试次数（dimension:retrying 事件累加） */
  retryCount?: number;
  /** 最近一次重试的原因 code（如 RUNNER_OUTPUT_SCHEMA_MISMATCH） */
  lastRetryReason?: string;
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
  cancelledAt?: number;
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

export interface ChapterState {
  index: number;
  heading: string;
  thesis?: string;
  status:
    | 'pending'
    | 'writing'
    | 'reviewing'
    | 'revising'
    | 'passed'
    | 'done'
    | 'failed-finalized'
    | 'failed';
  attempts: number;
  wordCount?: number;
  score?: number;
  critique?: string;
}

export interface DimensionPipelineState {
  dimension: string;
  /** outline 已规划的章节列表 */
  chapters: ChapterState[];
  /** Integrator 完成后的 totalWordCount */
  totalWordCount?: number;
  /** integrator state=degraded 走通过路径的标记（次优产物）*/
  integrationDegraded?: boolean;
  /** Quality judge 5-axis 评分 */
  grade?: {
    overall: number;
    grade: string;
    axes: Record<string, { score: number; comment: string }>;
    summary: string;
    /** 评分失败标记（backend INVARIANT 兜底事件携带）*/
    failed?: boolean;
    /** 跳过评分（research/integrator 上游失败）*/
    skipped?: boolean;
    /** 失败 phase（no-findings / outline-failed / no-chapters / integrator-failed / grade-failed / pipeline-exception / research-failed / fallback-finally）*/
    phase?: string;
  };
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
  /** TI-style per-dimension pipeline state，按 dimension name 索引 */
  dimensionPipelines: Map<string, DimensionPipelineState>;
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
  const dimensionPipelines = new Map<string, DimensionPipelineState>();
  // ★ 2026-04-30 REDESIGN (task #61): retry 双路径 pipelineKey 路由
  //   activeFreshRetry: dim → retryLabel，仅 strategy=fresh-collect 才进入
  //   后续所有 chapter:* / dimension:* 事件按当前 active retry 决定写哪个 pipelineKey：
  //     fresh-collect 进行中 → key = `${dim}:${retryLabel}`，独立 pipeline
  //     无 active retry / strategy=reuse-recompute → key = dim，就地更新原 pipeline
  //   dimension:graded with retryLabel → 关闭该 dim 的 active fresh retry 状态
  const activeFreshRetry = new Map<string, string>();
  const resolvePipelineKey = (dim: string): string => {
    const retryLabel = activeFreshRetry.get(dim);
    return retryLabel ? `${dim}:${retryLabel}` : dim;
  };
  const ensurePipeline = (dim: string): DimensionPipelineState => {
    const key = resolvePipelineKey(dim);
    let p = dimensionPipelines.get(key);
    if (!p) {
      p = { dimension: dim, chapters: [] };
      dimensionPipelines.set(key, p);
    }
    return p;
  };

  // ★ 2026-05-01 治同毫秒事件 race（mission 8a55cc93 prod 实测）：
  //   chapter:* 事件可能比 outline:planned 先到，find by idx 失败 → status 永
  //   不更新（卡 pending）。lazy upsert 让任何 chapter:* 事件都能创建/找到 chapter，
  //   后续 outline:planned 通过 merge 修正 heading/thesis（不覆盖 status）。
  const upsertChapter = (
    pipeline: DimensionPipelineState,
    index: number
  ): DimensionPipelineState['chapters'][number] => {
    let ch = pipeline.chapters.find((c) => c.index === index);
    if (!ch) {
      ch = {
        index,
        heading: `Chapter ${index}`,
        thesis: undefined,
        status: 'pending',
        attempts: 0,
      };
      pipeline.chapters.push(ch);
      pipeline.chapters.sort((a, b) => a.index - b.index);
    }
    return ch;
  };
  let memory: MemoryIndexState | null = null;
  const costByStage = new Map<
    string,
    { tokensUsed: number; costUsd: number }
  >();
  let totalTokens = 0;
  let totalCost = 0;
  let summedDeltaTokens = 0;
  let summedDeltaCost = 0;

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
    } else if (t === 'agent-playground.mission:cancelled') {
      mission.cancelledAt = ev.timestamp;
      mission.failedMessage = (p?.message as string | undefined) ?? '用户取消';
    } else if (t === 'agent-playground.stage:lifecycle') {
      // ★ 2026-05-06 真治：backend 单轨化后只 emit stage:lifecycle（删了
      //   stage:started/completed），derive.ts 之前没跟进 → mission stages
      //   永远卡 pending。stepId 是 backend pipeline 内部 ID，需要映射到 5
      //   个高层 StageId（leader / researchers / analyst / writer / reviewer）。
      const stepId = (p?.stepId ?? p?.stage) as string | undefined;
      const status = p?.status as
        | 'started'
        | 'completed'
        | 'failed'
        | 'degraded'
        | undefined;
      const mapped = mapStepIdToStageId(stepId);
      if (mapped) {
        const cur = stages.get(mapped);
        if (cur) {
          if (status === 'started') {
            // 不要把已 done 的 stage 回滚到 running（多 stepId 映射同一 stageId
            // 时只取首个 started + 最后 completed）
            if (cur.status !== 'done' && cur.status !== 'failed') {
              cur.status = 'running';
              cur.startedAt = cur.startedAt ?? ev.timestamp;
            }
          } else if (status === 'completed') {
            cur.status = 'done';
            cur.endedAt = ev.timestamp;
            // 保留旧 stage:completed 时的 leader.dimensions / themeSummary 提取，
            // 让 mission rerun 也能 hydrate 这些字段
            if (mapped === 'leader' && stepId === 's2-leader-plan') {
              const out = p?.output as Record<string, unknown> | undefined;
              const raw = out?.raw as Record<string, unknown> | undefined;
              const themeSummary = raw?.themeSummary as string | undefined;
              if (themeSummary) mission.themeSummary = themeSummary;
              const rawDims = raw?.dimensions;
              if (Array.isArray(rawDims)) {
                mission.dimensions = rawDims.map((d, i) => {
                  if (d && typeof d === 'object') {
                    const o = d as Record<string, unknown>;
                    return {
                      id: typeof o.id === 'string' ? o.id : `dim-${i}`,
                      name:
                        typeof o.name === 'string'
                          ? o.name
                          : String(o.name ?? `Dimension ${i + 1}`),
                      rationale:
                        typeof o.rationale === 'string' ? o.rationale : '',
                    };
                  }
                  return {
                    id: `dim-${i}`,
                    name: String(d ?? `Dimension ${i + 1}`),
                    rationale: '',
                  };
                });
              }
            }
          } else if (status === 'failed') {
            cur.status = 'failed';
            cur.endedAt = ev.timestamp;
          }
        }
      }
    } else if (t === 'agent-playground.stage:started') {
      // 兼容历史 fixture（pre-单轨化 mission），新 mission 走 stage:lifecycle
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
          // Defensive normalization: backend emits ReadonlyArray<{name}> from S2
          // but MissionState['dimensions'] requires {id, name, rationale}[].
          // Older payloads may lack id/rationale — fill them in rather than crash
          // downstream code that calls existing.map((d) => d.id).
          const rawDims = p?.dimensions;
          if (Array.isArray(rawDims)) {
            mission.dimensions = rawDims.map((d, i) => {
              if (d && typeof d === 'object') {
                const o = d as Record<string, unknown>;
                return {
                  id: typeof o.id === 'string' ? o.id : `dim-${i}`,
                  name:
                    typeof o.name === 'string'
                      ? o.name
                      : String(o.name ?? `Dimension ${i + 1}`),
                  rationale: typeof o.rationale === 'string' ? o.rationale : '',
                };
              }
              return {
                id: `dim-${i}`,
                name: String(d ?? `Dimension ${i + 1}`),
                rationale: '',
              };
            });
          }
        }
      }
    } else if (t === 'agent-playground.dimension:retrying') {
      // Researcher self-heal 重试：标记当前 agent retryCount 自增 + 记录 reason
      const agentId = (p?.agentId as string | undefined) ?? ev.agentId;
      if (agentId) {
        const cur =
          agents.get(agentId) ??
          ({
            agentId,
            role: 'researcher' as AgentRole,
            phase: 'pending' as AgentPhase,
            trace: [],
          } as AgentLiveState);
        cur.retryCount = (cur.retryCount ?? 0) + 1;
        cur.lastRetryReason = p?.reason as string | undefined;
        agents.set(agentId, cur);
      }
      // ★ 2026-04-30 REDESIGN (task #61): fresh-collect 路径开启 dim 的 retry pipeline 路由
      //   reuse-recompute 路径不切，让后续事件继续写入原 dim pipeline（grade 就地更新）
      const strategy = p?.strategy as
        | 'fresh-collect'
        | 'reuse-recompute'
        | undefined;
      const retryLabel = p?.retryLabel as string | undefined;
      const dim = p?.dimension as string | undefined;
      if (
        dim &&
        retryLabel &&
        (strategy === 'fresh-collect' || strategy === undefined) // 默认 fresh-collect
      ) {
        activeFreshRetry.set(dim, retryLabel);
      }
    } else if (t === 'agent-playground.dimensions:appended') {
      // Leader chat 触发的动态追加：把新 dim 拼到 mission.dimensions 末尾
      // Defensive normalization: Array.isArray guard prevents crash if payload
      // arrives as non-array; each element normalized to {id,name,rationale} shape.
      const rawItems = p?.items;
      const items: { id: string; name: string; rationale: string }[] =
        Array.isArray(rawItems)
          ? rawItems
              .filter(
                (x): x is Record<string, unknown> =>
                  x != null && typeof x === 'object'
              )
              .map((d, i) => ({
                id: typeof d.id === 'string' ? d.id : `dim-${i}`,
                name:
                  typeof d.name === 'string'
                    ? d.name
                    : String(d.name ?? `Dimension ${i + 1}`),
                rationale: typeof d.rationale === 'string' ? d.rationale : '',
              }))
          : [];
      if (items.length > 0) {
        const existing = mission.dimensions ?? [];
        const existingIds = new Set(existing.map((d) => d.id));
        const fresh = items.filter((it) => !existingIds.has(it.id));
        if (fresh.length > 0) {
          mission.dimensions = [...existing, ...fresh];
        }
      }
    } else if (t === 'agent-playground.agent:lifecycle') {
      const agentId = (p?.agentId as string) ?? ev.agentId;
      const role = p?.role as AgentRole | undefined;
      const phase = p?.phase as 'started' | 'completed' | 'failed' | undefined;
      // 跳过 sub-agent role（chapter-writer/outline/integrator/quality-judge 等）—
      // 这些只属于 dimensionPipelines，不应进 agents grid（否则 ROLE_META[role] = undefined 崩溃）
      if (role && !KNOWN_AGENT_ROLES.has(role)) continue;
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
          // 失败消息：lifecycle.payload.error（由 orchestrator extractFailureMessage 写入）
          const failMsg =
            (p?.error as string | undefined) ??
            (p?.message as string | undefined);
          if (failMsg && phase === 'failed') {
            cur.failureMessage = failMsg;
          }
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
      // 跳过 sub-agent role —— 同 lifecycle 处理理由
      if (!KNOWN_AGENT_ROLES.has(role)) continue;
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
        // ★ parallel_tool_call 拍平：把 calls[] 数组每条作为独立 action trace 推入
        //   这样 ComputeUsagePanel 的 buildToolStats 能按 toolId 正确聚合，
        //   不再出现 90% 工具调用统计丢失的问题（BUG-B）
        const kind = p?.kind as string | undefined;
        if (kind === 'parallel_tool_call' && Array.isArray(p?.calls)) {
          for (let i = 0; i < p.calls.length; i++) {
            const sub = p.calls[i] as Record<string, unknown> | undefined;
            cur.trace.push({
              kind: 'action',
              ts: ts + i * 0.001, // 微小偏移避免完全相同 ts 引起的排序错乱
              toolId:
                (sub?.toolId as string | undefined) ??
                (sub?.skillId as string | undefined) ??
                (sub?.kind as string | undefined),
              input: sub?.input,
            });
          }
          cur.trace.sort((a, b) => a.ts - b.ts);
          agents.set(agentId, cur);
          continue;
        }
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
          // toolId 后端只在用 tool 时设；对 finalize/reasoning 等内置动作回退到 kind
          // 不然 finalOutput 提取失败 — observation.toolId === 'finalize' 永远不成立
          toolId:
            (p?.toolId as string | undefined) ??
            (p?.kind as string | undefined),
          output: p?.output,
          latencyMs: p?.latencyMs as number | undefined,
          tokensUsed: p?.tokensUsed as number | undefined,
          error: p?.error as string | undefined,
        };
      } else if (t === 'agent-playground.agent:reflection') {
        // 优先 text；如果只有 verdict（pass/needs-revision/...）也展示出来
        const text = p?.text as string | undefined;
        const verdict = p?.verdict as string | undefined;
        item = {
          kind: 'reflection',
          ts,
          text: text ?? (verdict ? `[verdict: ${verdict}]` : undefined),
        };
      } else {
        item = { kind: 'error', ts, error: p?.message as string | undefined };
      }
      cur.trace.push(item);
      cur.trace.sort((a, b) => a.ts - b.ts);
      agents.set(agentId, cur);
    } else if (t === 'agent-playground.cost:tick') {
      const stage = p?.stage as string | undefined;
      const deltaTokens = (p?.deltaTokens as number) ?? 0;
      const deltaCostUsd = (p?.deltaCostUsd as number) ?? 0;
      // Some live missions only emit delta tokens/cost during streaming.
      // Others also include cumulative totals. Keep whichever path reports
      // the larger value so the UI does not stay at zero.
      summedDeltaTokens += Math.max(0, deltaTokens);
      summedDeltaCost += Math.max(0, deltaCostUsd);
      totalTokens = Math.max(
        totalTokens,
        (p?.tokensUsed as number) ?? 0,
        summedDeltaTokens
      );
      totalCost = Math.max(
        totalCost,
        (p?.costUsd as number) ?? 0,
        summedDeltaCost
      );
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
      // Normalize tags: backend emits [depth, topic] string tuple; guard against
      // any non-string element arriving from an older payload shape.
      const rawTags = p?.tags;
      const normalizedTags = Array.isArray(rawTags)
        ? rawTags.map((t) => (typeof t === 'string' ? t : String(t ?? '')))
        : undefined;
      memory = {
        chunks: (p?.chunks as number) ?? 0,
        namespace: p?.namespace as string | undefined,
        tags: normalizedTags,
      };
    } else if (t === 'agent-playground.report:draft') {
      reports.push({
        attempt: (p?.attempt as number) ?? 1,
        report: p?.report as ReportDraft['report'],
      });
    } else if (t === 'agent-playground.dimension:outline:planned') {
      const dim = p?.dimension as string | undefined;
      const chapters =
        (p?.chapters as
          | { index: number; heading: string; thesis?: string }[]
          | undefined) ?? [];
      if (dim) {
        const pipeline = ensurePipeline(dim);
        // ★ 2026-05-01 修：merge 而非"只建一次" — 杠杆 1 维度并行后，多 dim 可能
        //   先后命中同一 pipelineKey；旧 guard "length === 0 才填" 让后续 dim
        //   的 chapters 永远空，下游所有 chapter:* 事件 find by index 失败 →
        //   chapter.status 永远卡 pending（截图 42 的真因）。
        //   改为：按 chapter.index 增量 upsert，已有则保留 status，新增则 pending。
        for (const c of chapters) {
          const existing = pipeline.chapters.find((x) => x.index === c.index);
          if (existing) {
            // 保留 live status，只更新 heading/thesis（outline 重新规划场景）
            existing.heading = c.heading;
            existing.thesis = c.thesis;
          } else {
            pipeline.chapters.push({
              index: c.index,
              heading: c.heading,
              thesis: c.thesis,
              status: 'pending',
              attempts: 0,
            });
          }
        }
        // 按 index 排序保持显示顺序稳定
        pipeline.chapters.sort((a, b) => a.index - b.index);
      }
    } else if (t === 'agent-playground.chapter:writing:started') {
      const dim = p?.dimension as string | undefined;
      const idx = p?.chapterIndex as number | undefined;
      const attempt = (p?.attempt as number | undefined) ?? 1;
      if (dim && idx != null) {
        const pipeline = ensurePipeline(dim);
        let ch = pipeline.chapters.find((c) => c.index === idx);
        // ★ 2026-05-01 治 prod race（mission 8a55cc93）：
        //   chapter:writing:started 与 outline:planned 同毫秒到达时 DB INSERT
        //   顺序不保证，前端可能先收到 writing:started → ensurePipeline 建空
        //   chapters[] → find idx 失败 → status 永不更新（卡 pending）。
        //   解：找不到就 lazy upsert chapter（heading 暂用 idx 占位），
        //   后续 outline:planned 到达时 merge 修正 heading（line 478 merge 逻辑）。
        if (!ch) {
          ch = {
            index: idx,
            heading: `Chapter ${idx}`,
            thesis: undefined,
            status: 'pending',
            attempts: 0,
          };
          pipeline.chapters.push(ch);
          pipeline.chapters.sort((a, b) => a.index - b.index);
        }
        ch.status = attempt > 1 ? 'revising' : 'writing';
        ch.attempts = attempt;
      }
    } else if (t === 'agent-playground.chapter:writing:completed') {
      const dim = p?.dimension as string | undefined;
      const idx = p?.chapterIndex as number | undefined;
      if (dim && idx != null) {
        const pipeline = ensurePipeline(dim);
        const ch = upsertChapter(pipeline, idx);
        ch.wordCount = (p?.wordCount as number | undefined) ?? ch.wordCount;
        ch.status = 'reviewing';
      }
    } else if (t === 'agent-playground.chapter:review:completed') {
      const dim = p?.dimension as string | undefined;
      const idx = p?.chapterIndex as number | undefined;
      if (dim && idx != null) {
        const pipeline = ensurePipeline(dim);
        const ch = upsertChapter(pipeline, idx);
        ch.score = p?.score as number | undefined;
        ch.critique = p?.critique as string | undefined;
        ch.status =
          p?.decision === 'pass' ||
          ((p?.score as number | undefined) ?? 0) >= 75
            ? 'passed'
            : 'revising';
      }
    } else if (t === 'agent-playground.chapter:revision') {
      // 已在 writing:started 重置 attempts，这里仅作为补充信号
    } else if (t === 'agent-playground.chapter:done') {
      // ★ 治 mission "假完成" 根因（2026-05-01）：chapter 终态事件 — 把 status 切到
      //   'done'（qualified=true）或 'failed-finalized'（兜底落地），
      //   让 ArtifactReader banner 不再把已完成章节误判为"修订中"。
      const dim = p?.dimension as string | undefined;
      const idx = p?.chapterIndex as number | undefined;
      const qualified = p?.qualified as boolean | undefined;
      if (dim && idx != null) {
        const pipeline = ensurePipeline(dim);
        const ch = upsertChapter(pipeline, idx);
        ch.status = qualified ? 'done' : 'failed-finalized';
        ch.wordCount = (p?.wordCount as number | undefined) ?? ch.wordCount;
      }
    } else if (t === 'agent-playground.dimension:integrating:completed') {
      const dim = p?.dimension as string | undefined;
      if (dim) {
        const pipeline = ensurePipeline(dim);
        pipeline.totalWordCount = p?.totalWordCount as number | undefined;
        // ★ 2026-05-01: backend integrator state=degraded 走通过路径时携 degraded:true
        if (p?.degraded === true) {
          pipeline.integrationDegraded = true;
        }
      }
    } else if (t === 'agent-playground.dimension:integrating:failed') {
      // ★ 2026-05-01 真因可见性：integrator 真失败（无 output）也设 degraded 标志
      const dim = p?.dimension as string | undefined;
      if (dim) {
        const pipeline = ensurePipeline(dim);
        pipeline.integrationDegraded = true;
      }
    } else if (t === 'agent-playground.dimension:graded') {
      const dim = p?.dimension as string | undefined;
      if (dim) {
        const pipeline = ensurePipeline(dim);
        pipeline.grade = {
          overall: (p?.overall as number | undefined) ?? 0,
          grade: (p?.grade as string | undefined) ?? '',
          axes:
            (p?.axes as
              | Record<string, { score: number; comment: string }>
              | undefined) ?? {},
          summary: (p?.summary as string | undefined) ?? '',
          // ★ 2026-05-01 真因可见性：捕获 backend INVARIANT 兜底事件的 failed/
          //   skipped/phase 标记，前端可区分"真评分 0 分"vs"评分失败 sentinel"
          failed: (p?.failed as boolean | undefined) ?? false,
          skipped: (p?.skipped as boolean | undefined) ?? false,
          phase: p?.phase as string | undefined,
        };
        // ★ 2026-04-30 REDESIGN (task #61): retryLabel 在 payload 表示 fresh-collect retry 完成
        //   关闭该 dim 的 active fresh retry 路由，让后续事件回到原 dim pipeline
        const retryLabel = p?.retryLabel as string | undefined;
        if (retryLabel && activeFreshRetry.get(dim) === retryLabel) {
          activeFreshRetry.delete(dim);
        }
      }
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
    dimensionPipelines,
  };
}
