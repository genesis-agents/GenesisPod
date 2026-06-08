/**
 * Deep-Insight Mission UI — 归一化数据契约（DeepInsightMissionView）
 *
 * ★ 蓝本 = PLAYGROUND 真实实现（app/agent-playground/team/[missionId]/page.tsx）：
 *   左栏 TeamRosterPanel + 右侧 6 tab（tasks/collab/report/references/graph/cost）。
 *   本契约**忠实于 playground 的 MissionView 形状**：把 TeamRosterPanel 与各 tab
 *   面板真正吃的字段（agents / stages / taskProgress / finalScore / topic /
 *   dimensions / depth / language / maxCredits / missionStatus，以及 events /
 *   cost / dimensionPipelines / reportArtifact / memory / verdicts）摊平到一个 view。
 *
 * 这一层是「乐高的凸点」：把两种异构数据源归一成同一套 view，喂给 L4 详情壳：
 *   - PLAYGROUND：WebSocket 事件流派生的 MissionPresentationView + canonical
 *     MissionDetailView + raw events（live，全字段齐）。
 *   - COMPANY（deepdive 静态 result）：MissionReportResult，缺失字段按
 *     companyDataGap 降级（collab/graph 隐藏、tasks/report/cost 汇总/静态）。
 *
 * 设计约束（保持契约层可被任意页面接入）：
 * - 本文件**不 import** playground 私有运行态符号（WS hook / MissionDetailView /
 *   ReportArtifactV2 等）。playground 形状只在 adapter 内通过 `unknown` + 收窄消费。
 * - playground 侧 AgentLiveState / StageState / CostState / DimensionPipelineState
 *   等运行态 shape 在本文件**结构镜像**重声明（前缀 DI*），与 playground
 *   `lib/features/agent-playground/mission-presentation.types` 结构兼容 —— kit 接线时
 *   可把 `view.agents` / `view.stages` 等直接透传给 TeamRosterPanel，不引入反向依赖。
 * - 复用的纯渲染类型来自 canonical 壳层（team-topology），不重造。
 */

import { Crown, Search, PenLine, Gavel } from 'lucide-react';
import type {
  TeamTopologyNode,
  TeamTopologyConnection,
} from '@/components/common/team-topology';

// ── playground 运行态结构镜像（DI* 前缀，与 mission-presentation.types 结构兼容）──
//
// 这些是 TeamRosterPanel / MissionTodoBoard / ComputeUsagePanel 等面板真正吃的
// 形状。company 侧没有这些（无 trace / 无 WS）→ adapter 给空数组/兜底；playground
// 侧 kit 接线时把 view.agents / view.stages / view.cost 原样喂入（结构兼容）。

/** 5 个 frontend 高层 StageId（leader/researchers/analyst/writer/reviewer）。 */
export type DIStageId =
  | 'leader'
  | 'researchers'
  | 'analyst'
  | 'writer'
  | 'reviewer';

export type DIStageStatus = 'pending' | 'running' | 'done' | 'failed';

/** 喂给 TeamRosterPanel 的 stage（结构镜像 StageState 子集）。 */
export interface DIStageState {
  id: DIStageId;
  status: DIStageStatus;
  startedAt?: number;
  endedAt?: number;
  detail?: string;
  attempts?: number;
}

export type DIAgentRole =
  | 'leader'
  | 'researcher'
  | 'analyst'
  | 'writer'
  | 'reviewer';

export type DIAgentPhase = 'pending' | 'running' | 'completed' | 'failed';

/** 单条 react trace（latency/token 派生用；company 无 trace → 空数组）。 */
export interface DIAgentTraceItem {
  kind: 'thought' | 'action' | 'observation' | 'reflection' | 'error';
  ts: number;
  text?: string;
  toolId?: string;
  output?: unknown;
  latencyMs?: number;
  tokensUsed?: number;
  error?: string;
}

/** 喂给 TeamRosterPanel 拓扑 + AgentInspector 的 agent（结构镜像 AgentLiveState 子集）。 */
export interface DIAgentLiveState {
  agentId: string;
  role: DIAgentRole;
  phase: DIAgentPhase;
  startedAt?: number;
  endedAt?: number;
  wallTimeMs?: number;
  iterations?: number;
  attempt?: number;
  dimension?: string;
  modelId?: string;
  failureMessage?: string;
  retryCount?: number;
  trace: DIAgentTraceItem[];
  tokensUsed?: number;
  toolCallCount?: number;
  costUsd?: number;
}

/** 算力 by-stage 明细（ComputeUsagePanel 吃；company 无 → 空数组）。 */
export interface DICostState {
  tokensUsed: number;
  costUsd: number;
  byStage: { stage: string; tokensUsed: number; costUsd: number }[];
}

/** 维度章节子状态机（ArtifactReader / MissionTodoBoard / ComputeUsagePanel 吃）。 */
export interface DIDimensionPipelineState {
  dimension: string;
  chapters: {
    index: number;
    heading: string;
    status: string;
    attempts: number;
    wordCount?: number;
    score?: number;
  }[];
  totalWordCount?: number;
  grade?: {
    overall: number;
    grade: string;
    summary: string;
  };
}

/** 记忆索引（MemoryIndexPanel 吃；company 无 → undefined）。 */
export interface DIMemoryIndexState {
  chunks: number;
  namespace?: string;
  tags?: string[];
}

/** verifier 裁决（评分卡 / collab 吃；company 用 review 兜底单条）。 */
export interface DIVerifierVerdict {
  verifierId: string;
  score: number;
  critique?: string;
  criteria?: Record<string, number>;
  modelId?: string;
}

// ── 复用 / 归一的子类型 ────────────────────────────────────────────────

/**
 * 喂给 canonical TeamTopologyCanvas 的归一拓扑视图。
 * playground 侧 TeamRosterPanel 自带从 agents+stages 现算拓扑（不吃此字段）；
 * company 侧无 live agent → 用 buildDeepInsightTopology(dimensions,true) 造静态全
 * completed 拓扑，喂给静态左栏 / TeamTopologyCanvas 直渲。
 */
export interface TeamTopologyView {
  nodes: TeamTopologyNode[];
  rows: string[][];
  connections: TeamTopologyConnection[];
  viewBoxHeight: number;
  rowYPositions: number[];
  heightClass?: string;
  agentCount: number;
}

/** 喂给 canonical MissionTaskList / MissionTodoBoard 降级版的单步骤。 */
export interface MissionStep {
  label: string;
  role: string;
  dimension?: string;
  status: 'done' | 'failed' | 'skipped';
  tokens?: number;
  costCents?: number;
}

/** 算力消耗汇总归一（company cents / playground USD 在 adapter 内换算成 cents）。 */
export interface ComputeUsage {
  totalTokens?: number;
  totalCostCents?: number;
}

/** 底部操作按钮归一（onClick 由 adapter / L4 注入）。 */
export type MissionActionVariant = 'primary' | 'secondary' | 'danger';

export interface MissionAction {
  variant: MissionActionVariant;
  emoji?: string;
  label: string;
  title?: string;
  disabled?: boolean;
  emphasized?: boolean;
  onClick: () => void;
}

/** 参考文献归一（ReferencesPanel 吃）。 */
export interface Reference {
  source: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
  dimension?: string;
  claim?: string;
}

/** 事实表条目归一（FactTablePanel 吃）。 */
export interface Fact {
  id?: string;
  entity?: string;
  attribute?: string;
  value?: string;
  sources?: string[];
}

/** 评审裁决归一三态（开放 verdict 字符串在 adapter 内收窄）。 */
export type Verdict = 'approve' | 'revise' | 'reject';

// ── L2 契约：所有 mission 通用（详情壳吃）────────────────────────────────

export interface BaseMissionView {
  id: string;
  title: string;
  /** 归一三态。细分态（quality-failed / cancelled）若 UI 要显示走 statusDetail。 */
  status: 'running' | 'done' | 'failed';
  /** 丢失细分态的可选承载（如 'quality-failed' / 'cancelled'）。 */
  statusDetail?: string;
  /** epoch ms（playground 的 ISO startedAt 在 adapter 内转 ms）。 */
  createdAt?: number;
  team: TeamTopologyView;
  steps: MissionStep[];
  usage?: ComputeUsage;
  actions?: MissionAction[];
}

// ── L3 契约：深度洞察扩展（忠实 playground MissionView 形状）──────────────

/**
 * DeepInsightMissionView —— 忠实于 playground MissionView 的归一视图。
 *
 * 字段分组（对照 TeamRosterPanel props + page.tsx 6 tab dataNeeds）：
 *  ① 左栏 TeamRosterPanel：agents / stages / taskProgress / finalScore / topic /
 *     dimensionDetails / depth / language / maxCredits / missionStatus / isResumable。
 *  ② tasks（MissionTodoBoard）：steps（降级）/ dimensionPipelines / agents。
 *  ③ collab（MissionFlowView）：events（raw WS 流；company 无 → 空，tab 隐藏）。
 *  ④ report（ArtifactReader）：reportArtifact（富）/ report（markdown 兜底）/
 *     dimensionPipelines / reconciliationReport。
 *  ⑤ references（ReferencesPanel）：references。
 *  ⑥ graph（MissionGraphTab）：hasGraph（company 无 graph API → false，tab 隐藏）。
 *  ⑦ cost（ComputeUsagePanel）：cost / agents / dimensionPipelines / memory / usage。
 */
export interface DeepInsightMissionView extends BaseMissionView {
  // ── 左栏 TeamRosterPanel 直喂 ──
  /** live agent 状态（拓扑节点 + AgentInspector + per-agent token/latency）。 */
  agents: DIAgentLiveState[];
  /** 5 个高层 stage 状态（拓扑节点 status + 进度兜底）。 */
  stages: DIStageState[];
  /** 「任务进度」真实任务计数（与 tasks tab 的 workTodos 过滤同源）。 */
  taskProgress?: { completed: number; total: number };
  /** 共识质量分（底部「共识质量 N/100」）。 */
  finalScore?: number;
  /** 原始 topic（透传；title 是清洗后的展示名）。 */
  topic?: string;
  /** 维度名列表（subtitle「N 维度」+ 拓扑 fan-out 兜底）。 */
  dimensions: string[];
  /** 维度详情（researcher fan-out 节点 + 「研究维度 N 个」+ 任务列表）。 */
  dimensionDetails: { id?: string; name: string; rationale?: string }[];
  /** 研究深度（3 卡选择器 + tier 联动；company 无 → undefined）。 */
  depth?: 'quick' | 'standard' | 'deep' | string;
  /** 运行语言（运行配置卡）。 */
  language?: string;
  /** 预算上限 credits（运行配置卡）。 */
  maxCredits?: number;
  /** 6 态运行状态（状态 pill + 按钮 disabled + 拓扑 idle promote）。 */
  missionStatus: 'running' | 'completed' | 'failed' | 'cancelled' | 'idle';
  /** checkpoint 可续跑（「更新」→「继续上次」+ hint banner；company 无 → false）。 */
  isResumable?: boolean;

  // ── 右侧 tab 数据 ──
  /**
   * collab（MissionFlowView）原始 WS 事件流。company 无 → 空数组，tab 隐藏。
   * 契约层不约束元素形状（PlaygroundEvent 是 playground 私有），L4 决定消费。
   */
  events: unknown[];
  /**
   * report（ArtifactReader）富结构化 artifact（ReportArtifactV2|EmptyArtifactSentinel）。
   * company 只有 markdown → 留空走 report 兜底。契约层不约束形状。
   */
  reportArtifact?: unknown;
  /** report markdown 正文（company 裸 string / playground artifact.fullMarkdown 抽出）。 */
  report?: string;
  /** 维度章节子状态机（report live 旁路 + tasks 维度子状态 + cost 维度明细）。 */
  dimensionPipelines: DIDimensionPipelineState[];
  /** 对账报告（FactTablePanel / report 消费）。 */
  reconciliationReport?: string;
  /** references（ReferencesPanel）。 */
  references: Reference[];
  /** 事实表（FactTablePanel）。 */
  facts: Fact[];
  /** cost（ComputeUsagePanel）by-stage 明细。 */
  cost?: DICostState;
  /** 记忆索引（MemoryIndexPanel；company 无 → undefined）。 */
  memory?: DIMemoryIndexState;
  /** verifier 裁决列表（评分卡 / collab）。 */
  verdicts: DIVerifierVerdict[];
  /** graph（MissionGraphTab）是否可用（company 无 graph API → false，tab 隐藏）。 */
  hasGraph: boolean;

  // ── 旧契约可选承载（不再是主结构，仅兼容既有简版左栏 / 评审意见）──
  /** @deprecated 用 finalScore + verdicts。仍保留供简版评分环。 */
  score?: { value: number; verdict: Verdict };
  /** @deprecated 用 verdicts[].critique。company review.notes 兜底。 */
  reviewNotes: string[];
}

// ── 公共构造：归一拓扑（Leader → N Researcher → Writer / Reviewer DAG）──

/**
 * 由维度名列表构造 deep-insight 标准拓扑。company 用（playground 侧 TeamRosterPanel
 * 自带 live 拓扑）：传 dimensions / 兜底从 steps 推。
 * @param allCompleted 静态结果 → true（全节点 completed）；live → false（idle）。
 */
function buildDeepInsightTopology(
  dimensionNames: string[],
  allCompleted: boolean
): TeamTopologyView {
  const nodeStatus = allCompleted ? 'completed' : 'idle';
  const nodes: TeamTopologyNode[] = [
    {
      id: 'leader',
      name: 'Leader',
      role: 'leader',
      icon: Crown,
      status: nodeStatus,
      colorKey: 'purple',
      isLeader: true,
      avatarRole: 'leader',
    },
  ];
  const researcherIds: string[] = [];
  dimensionNames.forEach((d, i) => {
    const id = `researcher#${i}`;
    researcherIds.push(id);
    nodes.push({
      id,
      name: d.length > 8 ? d.slice(0, 7) + '…' : d,
      role: 'researcher',
      icon: Search,
      status: nodeStatus,
      statusLabel: allCompleted ? '研究完成' : undefined,
      colorKey: 'blue',
      avatarRole: 'researcher',
    });
  });
  nodes.push(
    {
      id: 'writer',
      name: 'Writer',
      role: 'writer',
      icon: PenLine,
      status: nodeStatus,
      colorKey: 'rose',
      avatarRole: 'writer',
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      role: 'reviewer',
      icon: Gavel,
      status: nodeStatus,
      colorKey: 'emerald',
      avatarRole: 'reviewer',
    }
  );
  const connections: TeamTopologyConnection[] = [
    ...researcherIds.map((id) => ({ from: 'leader', to: id })),
    { from: 'leader', to: 'writer' },
    { from: 'leader', to: 'reviewer' },
  ];
  const expanded = researcherIds.length > 1;
  return {
    nodes,
    connections,
    rows: [['leader'], researcherIds, ['writer', 'reviewer']],
    viewBoxHeight: expanded ? 240 : 200,
    rowYPositions: expanded ? [40, 130, 215] : [40, 110, 175],
    heightClass: expanded ? 'h-[240px]' : 'h-[200px]',
    agentCount: nodes.length,
  };
}

/** 由维度名构造 company 侧静态全 completed agents（喂 TeamRosterPanel 拓扑）。 */
function buildStaticAgents(dimensionNames: string[]): DIAgentLiveState[] {
  const agents: DIAgentLiveState[] = [
    { agentId: 'leader', role: 'leader', phase: 'completed', trace: [] },
  ];
  dimensionNames.forEach((d, i) => {
    agents.push({
      agentId: `researcher#${i}`,
      role: 'researcher',
      phase: 'completed',
      dimension: d,
      trace: [],
    });
  });
  agents.push(
    { agentId: 'writer', role: 'writer', phase: 'completed', trace: [] },
    { agentId: 'reviewer', role: 'reviewer', phase: 'completed', trace: [] }
  );
  return agents;
}

/** 5 个高层 stage 全 done（company 静态左栏进度兜底）。 */
function buildStaticStages(): DIStageState[] {
  const ids: DIStageId[] = [
    'leader',
    'researchers',
    'analyst',
    'writer',
    'reviewer',
  ];
  return ids.map((id) => ({ id, status: 'done' as const }));
}

/** 开放 verdict 字符串 → 归一三态（approve / reject / 其余→revise）。 */
function normalizeVerdict(verdict: string | undefined | null): Verdict {
  if (verdict === 'approve') return 'approve';
  if (verdict === 'reject') return 'reject';
  return 'revise';
}

// ── company adapter（静态结果）────────────────────────────────────────

/** company mission.result 形状（mirror MissionReportResult）。 */
export interface MissionReportResultLike {
  summary?: string;
  review?: { score?: number; verdict?: string; notes?: string[] } | null;
  dimensions?: string[];
  themeSummary?: string;
  references?: Reference[];
  factTable?: Fact[];
  reconciliationReport?: string;
  steps?: MissionStep[];
  usage?: ComputeUsage;
}

export interface CompanyMissionInput {
  id: string;
  title: string;
  /** company 原始 status；companyStatus 收敛到三态。 */
  status?: string;
  createdAt?: number;
  result?: MissionReportResultLike;
  /** 由 L4 / 应用页注入的运行态动作（不入纯渲染派生）。 */
  actions?: MissionAction[];
}

/** company 原始 status → 归一三态。 */
function companyStatus(status: string | undefined): BaseMissionView['status'] {
  switch (status) {
    case 'done':
      return 'done';
    case 'failed':
      return 'failed';
    // queued / running / review / 其余 → running
    default:
      return 'running';
  }
}

/** company status → TeamRosterPanel missionStatus（6 态子集）。 */
function companyMissionStatus(
  status: string | undefined
): DeepInsightMissionView['missionStatus'] {
  switch (status) {
    case 'done':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'queued':
    case 'running':
    case 'review':
      return 'running';
    default:
      return 'idle';
  }
}

/**
 * company deepdive 静态结果 → DeepInsightMissionView。
 *
 * 按 companyDataGap 降级：缺 live agent/stage/events/graph → 造静态全 completed
 * 拓扑、空 events（collab 隐藏）、hasGraph=false（graph 隐藏）；
 * cost.byStage / memory / dimensionPipelines 留空（cost tab 显汇总条）。
 */
export function fromCompanyMissionResult(
  input: CompanyMissionInput
): DeepInsightMissionView {
  const result = input.result ?? {};
  const review = result.review ?? null;
  const dimensions = result.dimensions ?? [];
  const steps = result.steps ?? [];
  const references = result.references ?? [];
  const facts = result.factTable ?? [];

  const dimNames =
    dimensions.length > 0
      ? dimensions
      : steps
          .filter((s) => s.role === 'Researcher')
          .map((s, i) => s.dimension ?? `维度 ${i + 1}`);

  const dimensionDetails = dimNames.map((name) => ({ name }));

  const score =
    typeof review?.score === 'number'
      ? { value: review.score, verdict: normalizeVerdict(review.verdict) }
      : undefined;

  const finalScore =
    typeof review?.score === 'number' ? review.score : undefined;

  // task 计数：用 steps 计 done / total（与降级 tasks 列表同源）。
  const completedSteps = steps.filter((s) => s.status === 'done').length;
  const taskProgress =
    steps.length > 0
      ? { completed: completedSteps, total: steps.length }
      : undefined;

  // verdicts：company 只有单条 review → 派生单条 verifier verdict 兜底。
  const verdicts: DIVerifierVerdict[] =
    typeof review?.score === 'number'
      ? [
          {
            verifierId: 'review',
            score: review.score,
            critique: review.notes?.join('\n'),
          },
        ]
      : [];

  // cost：company usage 只有汇总 → byStage 留空（cost tab 显总条）。
  const cost: DICostState | undefined = result.usage
    ? {
        tokensUsed: result.usage.totalTokens ?? 0,
        costUsd:
          result.usage.totalCostCents != null
            ? result.usage.totalCostCents / 100
            : 0,
        byStage: [],
      }
    : undefined;

  return {
    id: input.id,
    title: input.title,
    status: companyStatus(input.status),
    statusDetail: undefined,
    createdAt: input.createdAt,
    team: buildDeepInsightTopology(dimNames, true),
    steps,
    usage: result.usage,
    actions: input.actions,
    // 左栏 TeamRosterPanel
    agents: buildStaticAgents(dimNames),
    stages: buildStaticStages(),
    taskProgress,
    finalScore,
    topic: input.title,
    dimensions: dimNames,
    dimensionDetails,
    // 公司 deepdive 是深度洞察任务 —— 给左栏运行配置卡可显示的研究深度 + 语言。
    depth: 'deep',
    language: 'zh-CN',
    maxCredits: undefined,
    missionStatus: companyMissionStatus(input.status),
    isResumable: false,
    // 右侧 tab
    events: [],
    reportArtifact: undefined,
    report: result.summary,
    dimensionPipelines: [],
    reconciliationReport: result.reconciliationReport,
    references,
    facts,
    cost,
    memory: undefined,
    verdicts,
    hasGraph: false,
    // 旧契约兼容承载
    score,
    reviewNotes: review?.notes ?? [],
  };
}

// ── playground adapter（live MissionView）──────────────────────────────

/** 安全取对象属性（unknown 收窄基元，禁 any）。 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function getStr(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}
function getNum(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  return typeof v === 'number' ? v : undefined;
}
function getArr(obj: Record<string, unknown>, key: string): unknown[] {
  const v = obj[key];
  return Array.isArray(v) ? v : [];
}

/** playground persisted/mission status（6 态）→ 归一三态 + statusDetail。 */
function playgroundStatus(raw: string | undefined): {
  status: BaseMissionView['status'];
  statusDetail?: string;
} {
  switch (raw) {
    case 'completed':
    case 'quality-failed':
      return {
        status: 'done',
        statusDetail: raw === 'quality-failed' ? 'quality-failed' : undefined,
      };
    case 'failed':
    case 'rejected':
    case 'cancelled':
      return {
        status: 'failed',
        statusDetail: raw === 'cancelled' ? 'cancelled' : undefined,
      };
    default:
      return { status: 'running' };
  }
}

/** playground raw status → TeamRosterPanel missionStatus（6 态）。 */
function playgroundMissionStatus(
  raw: string | undefined
): DeepInsightMissionView['missionStatus'] {
  switch (raw) {
    case 'completed':
    case 'quality-failed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'failed':
    case 'rejected':
      return 'failed';
    case 'running':
    case 'starting':
      return 'running';
    default:
      return 'idle';
  }
}

/** narrow agent role string → DIAgentRole（未知 → researcher 兜底）。 */
function asAgentRole(role: string | undefined): DIAgentRole {
  switch (role) {
    case 'leader':
    case 'researcher':
    case 'analyst':
    case 'writer':
    case 'reviewer':
      return role;
    default:
      return 'researcher';
  }
}

/** narrow agent phase string → DIAgentPhase。 */
function asAgentPhase(phase: string | undefined): DIAgentPhase {
  switch (phase) {
    case 'running':
    case 'completed':
    case 'failed':
      return phase;
    default:
      return 'pending';
  }
}

/** narrow stage id string → DIStageId | null。 */
function asStageId(id: string | undefined): DIStageId | null {
  switch (id) {
    case 'leader':
    case 'researchers':
    case 'analyst':
    case 'writer':
    case 'reviewer':
      return id;
    default:
      return null;
  }
}

/** narrow stage status string → DIStageStatus。 */
function asStageStatus(s: string | undefined): DIStageStatus {
  switch (s) {
    case 'running':
    case 'done':
    case 'failed':
      return s;
    default:
      return 'pending';
  }
}

/**
 * playground MissionView（WS 事件流派生）→ DeepInsightMissionView。
 *
 * 从 `unknown` 安全收窄出 playground 两层数据（mission/agents/stages/cost/
 * reportArtifact/dimensionPipelines/...），保持契约层与 playground 私有类型解耦。
 *
 * 入参约定（kit 接线时传入归一过的对象，**键名对齐 playground 形状**）：
 *  - `view.mission`：MissionState（topic/depth/language/finalScore/dimensions/...）。
 *  - `view.agents`：AgentLiveState[]（结构兼容 DIAgentLiveState）。
 *  - `view.stages`：StageState[]（结构兼容 DIStageState）。
 *  - `view.cost`：CostState；`view.memory`/`view.verdicts`/`view.dimensionPipelines`。
 *  - `view.reportArtifact` / `view.events` / `view.taskProgress` / `view.missionStatus`。
 */
export function fromPlaygroundMissionView(
  view: unknown
): DeepInsightMissionView {
  const root = isRecord(view) ? view : {};
  const mission = isRecord(root.mission) ? root.mission : {};

  const id =
    getStr(mission, 'id') ??
    getStr(root, 'missionId') ??
    getStr(root, 'id') ??
    '';

  // topic / title：清洗 topic（去掉 \n 与 [Re-run focus] 之后的部分）。
  const rawTopic = getStr(mission, 'topic') ?? getStr(root, 'title') ?? '';
  const title = rawTopic.split('\n')[0].split('[Re-run focus]')[0].trim();

  const rawStatus = getStr(mission, 'status') ?? getStr(root, 'status');
  const { status, statusDetail } = playgroundStatus(rawStatus);
  const missionStatus = playgroundMissionStatus(
    getStr(root, 'missionStatus') ?? rawStatus
  );

  // createdAt：number ms 优先，否则 ISO startedAt → ms。
  const startedAtNum =
    getNum(mission, 'startedAt') ?? getNum(root, 'startedAt');
  const startedAtIso =
    getStr(mission, 'startedAt') ?? getStr(root, 'startedAt');
  let createdAt: number | undefined = startedAtNum;
  if (createdAt === undefined && startedAtIso) {
    const ms = Date.parse(startedAtIso);
    createdAt = Number.isNaN(ms) ? undefined : ms;
  }

  // dimensionDetails：playground {id;name;rationale?}[]。
  const dimensionDetails = getArr(mission, 'dimensions')
    .map((d): { id?: string; name: string; rationale?: string } | undefined => {
      if (!isRecord(d)) return undefined;
      const name = getStr(d, 'name');
      if (!name) return undefined;
      return {
        id: getStr(d, 'id'),
        name,
        rationale: getStr(d, 'rationale'),
      };
    })
    .filter(
      (d): d is { id?: string; name: string; rationale?: string } =>
        d !== undefined
    );
  const dimensions = dimensionDetails.map((d) => d.name);

  // agents：结构兼容收窄。
  const agents: DIAgentLiveState[] = getArr(root, 'agents')
    .map((a): DIAgentLiveState | undefined => {
      if (!isRecord(a)) return undefined;
      const agentId = getStr(a, 'agentId') ?? getStr(a, 'id');
      if (!agentId) return undefined;
      const traceRaw = getArr(a, 'trace');
      const trace: DIAgentTraceItem[] = traceRaw
        .map((t): DIAgentTraceItem | undefined => {
          if (!isRecord(t)) return undefined;
          const kindRaw = getStr(t, 'kind');
          const kind: DIAgentTraceItem['kind'] =
            kindRaw === 'action' ||
            kindRaw === 'observation' ||
            kindRaw === 'reflection' ||
            kindRaw === 'error'
              ? kindRaw
              : 'thought';
          return {
            kind,
            ts: getNum(t, 'ts') ?? 0,
            text: getStr(t, 'text'),
            toolId: getStr(t, 'toolId'),
            output: t.output,
            latencyMs: getNum(t, 'latencyMs'),
            tokensUsed: getNum(t, 'tokensUsed'),
            error: getStr(t, 'error'),
          };
        })
        .filter((t): t is DIAgentTraceItem => t !== undefined);
      return {
        agentId,
        role: asAgentRole(getStr(a, 'role')),
        phase: asAgentPhase(getStr(a, 'phase')),
        startedAt: getNum(a, 'startedAt'),
        endedAt: getNum(a, 'endedAt'),
        wallTimeMs: getNum(a, 'wallTimeMs'),
        iterations: getNum(a, 'iterations'),
        attempt: getNum(a, 'attempt'),
        dimension: getStr(a, 'dimension'),
        modelId: getStr(a, 'modelId'),
        failureMessage: getStr(a, 'failureMessage'),
        retryCount: getNum(a, 'retryCount'),
        trace,
        tokensUsed: getNum(a, 'tokensUsed'),
        toolCallCount: getNum(a, 'toolCallCount'),
        costUsd: getNum(a, 'costUsd'),
      };
    })
    .filter((a): a is DIAgentLiveState => a !== undefined);

  // stages：结构兼容收窄（只保留 5 个高层 stage）。
  const stages: DIStageState[] = getArr(root, 'stages')
    .map((s): DIStageState | undefined => {
      if (!isRecord(s)) return undefined;
      const sid = asStageId(getStr(s, 'id'));
      if (!sid) return undefined;
      return {
        id: sid,
        status: asStageStatus(getStr(s, 'status')),
        startedAt: getNum(s, 'startedAt'),
        endedAt: getNum(s, 'endedAt'),
        detail: getStr(s, 'detail'),
        attempts: getNum(s, 'attempts'),
      };
    })
    .filter((s): s is DIStageState => s !== undefined);

  // finalScore / score。
  const finalScore = getNum(mission, 'finalScore');
  const score =
    typeof finalScore === 'number'
      ? {
          value: finalScore,
          verdict: normalizeVerdict(getStr(mission, 'leaderVerdict')),
        }
      : undefined;

  // taskProgress：root 直传优先。
  const tpRaw = root.taskProgress;
  const taskProgress =
    isRecord(tpRaw) &&
    typeof tpRaw.completed === 'number' &&
    typeof tpRaw.total === 'number'
      ? { completed: tpRaw.completed, total: tpRaw.total }
      : undefined;

  // cost（CostState）→ DICostState + usage 汇总。
  const costRaw = isRecord(root.cost) ? root.cost : undefined;
  let cost: DICostState | undefined;
  if (costRaw) {
    const tokensRaw = costRaw.tokensUsed;
    const tokensUsed =
      typeof tokensRaw === 'number'
        ? tokensRaw
        : typeof tokensRaw === 'string' && tokensRaw.trim() !== ''
          ? Number(tokensRaw) || 0
          : 0;
    const byStage = getArr(costRaw, 'byStage')
      .map((b) => {
        if (!isRecord(b)) return undefined;
        return {
          stage: getStr(b, 'stage') ?? '',
          tokensUsed: getNum(b, 'tokensUsed') ?? 0,
          costUsd: getNum(b, 'costUsd') ?? 0,
        };
      })
      .filter(
        (b): b is { stage: string; tokensUsed: number; costUsd: number } =>
          b !== undefined
      );
    cost = {
      tokensUsed,
      costUsd: getNum(costRaw, 'costUsd') ?? 0,
      byStage,
    };
  }
  const usage: ComputeUsage | undefined = cost
    ? {
        totalTokens: cost.tokensUsed || undefined,
        totalCostCents: cost.costUsd
          ? Math.round(cost.costUsd * 100)
          : undefined,
      }
    : undefined;

  // report + reportArtifact：结构化 artifact 抽 fullMarkdown，富 artifact 旁路保留。
  const reportArtifact = root.reportArtifact ?? mission.reportArtifact;
  let report: string | undefined;
  if (isRecord(reportArtifact)) {
    const content = reportArtifact.content;
    if (isRecord(content)) report = getStr(content, 'fullMarkdown');
    if (report === undefined) report = getStr(reportArtifact, 'fullMarkdown');
  }
  if (report === undefined) {
    const finalReport = isRecord(root.finalReport)
      ? root.finalReport
      : undefined;
    if (finalReport) report = getStr(finalReport, 'fullMarkdown');
  }

  // references：reportArtifact.citations[] 富对象 → Reference[]，缺则 finalReport.citations 字符串兜底。
  const citationSrc = isRecord(reportArtifact)
    ? getArr(reportArtifact, 'citations')
    : [];
  let references: Reference[] = citationSrc
    .map((c): Reference | undefined => {
      if (!isRecord(c)) return undefined;
      const source =
        getStr(c, 'url') ?? getStr(c, 'source') ?? getStr(c, 'title');
      if (!source) return undefined;
      return {
        source,
        title: getStr(c, 'title'),
        snippet: getStr(c, 'snippet') ?? getStr(c, 'excerpt'),
        publishedAt: getStr(c, 'publishedAt'),
        dimension: getStr(c, 'dimension'),
        claim: getStr(c, 'claim'),
      };
    })
    .filter((r): r is Reference => r !== undefined);
  if (references.length === 0) {
    const finalReport = isRecord(root.finalReport) ? root.finalReport : {};
    references = getArr(finalReport, 'citations')
      .filter((s): s is string => typeof s === 'string')
      .map((s) => ({ source: s }));
  }

  // facts：reportArtifact.factTable → Fact[]。
  const facts: Fact[] = (
    isRecord(reportArtifact) ? getArr(reportArtifact, 'factTable') : []
  )
    .map((f): Fact | undefined => {
      if (!isRecord(f)) return undefined;
      const sourcesRaw = f.sources;
      return {
        id: getStr(f, 'id'),
        entity: getStr(f, 'entity'),
        attribute: getStr(f, 'attribute'),
        value: getStr(f, 'value'),
        sources: Array.isArray(sourcesRaw)
          ? sourcesRaw.filter((s): s is string => typeof s === 'string')
          : undefined,
      };
    })
    .filter((f): f is Fact => f !== undefined);

  // dimensionPipelines：Map | Record | Array → DIDimensionPipelineState[]。
  const dimensionPipelines = normalizeDimensionPipelines(
    root.dimensionPipelines
  );

  // memory（MemoryIndexState）。
  const memoryRaw = isRecord(root.memory) ? root.memory : undefined;
  const memory: DIMemoryIndexState | undefined = memoryRaw
    ? {
        chunks: getNum(memoryRaw, 'chunks') ?? 0,
        namespace: getStr(memoryRaw, 'namespace'),
        tags: Array.isArray(memoryRaw.tags)
          ? memoryRaw.tags.filter((t): t is string => typeof t === 'string')
          : undefined,
      }
    : undefined;

  // verdicts（VerifierVerdict[]）。
  const verdicts: DIVerifierVerdict[] = getArr(root, 'verdicts')
    .map((v): DIVerifierVerdict | undefined => {
      if (!isRecord(v)) return undefined;
      const verifierId = getStr(v, 'verifierId');
      const sc = getNum(v, 'score');
      if (!verifierId || sc === undefined) return undefined;
      const criteriaRaw = v.criteria;
      const criteria: Record<string, number> | undefined = isRecord(criteriaRaw)
        ? Object.fromEntries(
            Object.entries(criteriaRaw).filter(
              ([, val]) => typeof val === 'number'
            ) as [string, number][]
          )
        : undefined;
      return {
        verifierId,
        score: sc,
        critique: getStr(v, 'critique'),
        criteria,
        modelId: getStr(v, 'modelId'),
      };
    })
    .filter((v): v is DIVerifierVerdict => v !== undefined);

  // steps：todoBoard.items → MissionStep 降维（tasks 降级用）。
  const todoBoard = isRecord(root.todoBoard) ? root.todoBoard : {};
  const steps: MissionStep[] = getArr(todoBoard, 'items')
    .map((it): MissionStep | undefined => {
      if (!isRecord(it)) return undefined;
      const label = getStr(it, 'label') ?? getStr(it, 'title');
      if (!label) return undefined;
      const itStatus = getStr(it, 'status');
      const stepStatus: MissionStep['status'] =
        itStatus === 'failed'
          ? 'failed'
          : itStatus === 'skipped'
            ? 'skipped'
            : 'done';
      return {
        label,
        role: getStr(it, 'assignee') ?? getStr(it, 'role') ?? '—',
        dimension: getStr(it, 'dimension'),
        status: stepStatus,
      };
    })
    .filter((s): s is MissionStep => s !== undefined);

  const reconciliationReport = getStr(mission, 'reconciliationReport');

  // taskProgress 兜底：root 未传 → 用 steps 计数。
  const taskProgressResolved =
    taskProgress ??
    (steps.length > 0
      ? {
          completed: steps.filter((s) => s.status === 'done').length,
          total: steps.length,
        }
      : undefined);

  return {
    id,
    title,
    status,
    statusDetail,
    createdAt,
    team: buildDeepInsightTopology(dimensions, status === 'done'),
    steps,
    usage,
    actions: undefined,
    // 左栏
    agents,
    stages,
    taskProgress: taskProgressResolved,
    finalScore,
    topic: rawTopic || undefined,
    dimensions,
    dimensionDetails,
    depth: getStr(mission, 'depth'),
    language: getStr(mission, 'language'),
    maxCredits: getNum(mission, 'maxCredits'),
    missionStatus,
    isResumable:
      mission.resumable === true || root.isResumable === true || undefined,
    // 右侧 tab
    events: getArr(root, 'events'),
    reportArtifact: reportArtifact ?? undefined,
    report,
    dimensionPipelines,
    reconciliationReport,
    references,
    facts,
    cost,
    memory,
    verdicts,
    hasGraph: root.hasGraph === true,
    // 旧契约兼容
    score,
    reviewNotes: [],
  };
}

/** dimensionPipelines（Map | Record | Array）→ DIDimensionPipelineState[]。 */
function normalizeDimensionPipelines(raw: unknown): DIDimensionPipelineState[] {
  let entries: unknown[] = [];
  if (raw instanceof Map) {
    entries = Array.from(raw.values());
  } else if (Array.isArray(raw)) {
    entries = raw;
  } else if (isRecord(raw)) {
    entries = Object.values(raw);
  }
  return entries
    .map((p): DIDimensionPipelineState | undefined => {
      if (!isRecord(p)) return undefined;
      const dimension = getStr(p, 'dimension');
      if (!dimension) return undefined;
      type DIChapter = DIDimensionPipelineState['chapters'][number];
      const chapters: DIChapter[] = getArr(p, 'chapters')
        .map((c): DIChapter | undefined => {
          if (!isRecord(c)) return undefined;
          return {
            index: getNum(c, 'index') ?? 0,
            heading: getStr(c, 'heading') ?? '',
            status: getStr(c, 'status') ?? 'pending',
            attempts: getNum(c, 'attempts') ?? 0,
            wordCount: getNum(c, 'wordCount'),
            score: getNum(c, 'score'),
          };
        })
        .filter((c): c is DIChapter => c !== undefined);
      const gradeRaw = isRecord(p.grade) ? p.grade : undefined;
      const grade =
        gradeRaw &&
        typeof gradeRaw.overall === 'number' &&
        typeof gradeRaw.grade === 'string'
          ? {
              overall: gradeRaw.overall,
              grade: gradeRaw.grade,
              summary: getStr(gradeRaw, 'summary') ?? '',
            }
          : undefined;
      return {
        dimension,
        chapters,
        totalWordCount: getNum(p, 'totalWordCount'),
        grade,
      };
    })
    .filter((p): p is DIDimensionPipelineState => p !== undefined);
}
