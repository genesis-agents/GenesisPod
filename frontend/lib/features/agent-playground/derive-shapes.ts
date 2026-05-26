/**
 * derive-shapes.ts — Frontend canonical shape types + pure mapping helpers
 *
 * 落地依据：thinning plan §B4-4 / §B5-1 / §3.4 / §7.2
 *
 * **2026-05-26 W7 cutover**: derive.ts 已删除，本文件成为唯一 type source。
 * 所有 component / page / hook / shim 都从此文件 import 类型。
 *
 * **§3.4 单轨约束**: 本文件只包含
 *   1. 形状类型（types / interfaces）
 *   2. 不携带 mission truth 的纯映射 helper（StAGE_STEPS / mapStepIdToStageId /
 *      aggregateStageStatus）
 * 不包含 deriveView 等 mission truth 派生函数（B5-1 删除后由 backend canonical
 * MissionDetailView 接管）。
 *
 * **DerivedView 形状保留原因**: viewToDerivedShim 与一些 page-internal helper
 * 仍以 DerivedView shape 协作（B5-2 follow-up 删除 shim 后此 type 一并退役）。
 */

// ============================================================================
// Stage / Step enums
// ============================================================================

export type StageId =
  | 'leader'
  | 'researchers'
  | 'analyst'
  | 'writer'
  | 'reviewer';

export type StepStatus = 'pending' | 'running' | 'done' | 'failed';
export type StageStatus = 'pending' | 'running' | 'done' | 'failed';

/**
 * 把 backend pipeline 内部 stepId 映射到 5 个高层 StageId。
 * 一个 StageId 可对应多个 stepId（如 leader = s1-budget + s2-leader-plan +
 * s4-leader-assess + s10-leader-foreword-signoff + s11-persist）。
 */
export function mapStepIdToStageId(stepId: string | undefined): StageId | null {
  if (!stepId) return null;
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
    stepId === 's8-writer' ||
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

/**
 * 每 stage 含的 step 列表（顺序敏感）。Stage 状态由所有 step 状态聚合：
 *   任意 failed → failed
 *   所有 done → done
 *   任意 running 或部分 done → running
 *   否则 → pending
 *
 * 不含 s12-self-evolution（fire-and-forget postlude）；不含 s8b（可选 audit）。
 */
export const STAGE_STEPS: Record<StageId, readonly string[]> = {
  leader: [
    's1-budget',
    's2-leader-plan',
    's4-leader-assess',
    's10-leader-foreword-signoff',
    's11-persist',
  ],
  researchers: ['s3-researcher-collect'],
  analyst: ['s5-reconciler', 's6-analyst'],
  writer: ['s7-writer-outline', 's8-writer'],
  reviewer: ['s9-critic', 's9b-objective-eval'],
};

/** 由 step 状态聚合 stage 状态：failed > running > pending > done */
export function aggregateStageStatus(
  stageId: StageId,
  stepStates: Map<string, StepStatus>
): StageStatus {
  const steps = STAGE_STEPS[stageId];
  let hasFailed = false;
  let hasRunning = false;
  let doneCount = 0;
  let knownCount = 0;
  for (const step of steps) {
    const s = stepStates.get(step);
    if (s == null) continue;
    knownCount++;
    if (s === 'failed') hasFailed = true;
    else if (s === 'running') hasRunning = true;
    else if (s === 'done') doneCount++;
  }
  if (hasFailed) return 'failed';
  if (knownCount === 0) return 'pending';
  if (doneCount === steps.length) return 'done';
  if (hasRunning || doneCount > 0) return 'running';
  return 'pending';
}

// ============================================================================
// Stage / Agent shapes
// ============================================================================

export interface PreflightRisk {
  severity: 'warn' | 'block';
  reasons: {
    code: string;
    message: string;
    current?: number;
    threshold?: number;
  }[];
}

export interface StageState {
  id: StageId;
  status: StageStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  attempts?: number;
  preflightRisk?: PreflightRisk;
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
  modelId?: string;
  failureMessage?: string;
  retryCount?: number;
  lastRetryReason?: string;
  trace: AgentTraceItem[];
}

// ============================================================================
// Verdict / Memory / Cost / Report / Mission shapes
// ============================================================================

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
  maxCredits?: number;
  wallTimeMs?: number;
  status?: string;
}

// ============================================================================
// Chapter / Dimension pipeline shapes
// ============================================================================

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
  chapters: ChapterState[];
  totalWordCount?: number;
  integrationDegraded?: boolean;
  grade?: {
    overall: number;
    grade: string;
    axes: Record<string, { score: number; comment: string }>;
    summary: string;
    failed?: boolean;
    skipped?: boolean;
    phase?: string;
  };
}

// ============================================================================
// Top-level DerivedView envelope
// ============================================================================

export interface DerivedView {
  mission: MissionState;
  stages: StageState[];
  agents: AgentLiveState[];
  cost: CostState;
  verdicts: VerifierVerdict[];
  memory: MemoryIndexState | null;
  reports: ReportDraft[];
  finalReport: ReportDraft['report'] | null;
  dimensionPipelines: Map<string, DimensionPipelineState>;
}
