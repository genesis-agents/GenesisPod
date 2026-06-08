/**
 * Deep-Insight Mission UI — 归一化数据契约（L2 BaseMissionView + L3 DeepInsightMissionView）
 *
 * 规范：docs/architecture/frontend/mission-ui-capability-architecture.md §3。
 *
 * 这一层是「乐高的凸点」：把两种异构数据源（公司 deepdive 静态 result /
 * playground WebSocket 事件流派生的 MissionView）归一成同一套 view，喂给 L4
 * <DeepInsightMissionDetail data />。
 *
 * 设计约束：
 * - 本文件**零** playground 私有运行态依赖（不 import WS hook / MissionDetailView /
 *   ReportArtifactV2 等）。playground 形状只在 adapter 内通过 `unknown` + 收窄消费，
 *   保持契约层可被任意页面接入。
 * - 复用的类型来自 canonical 壳层（team-topology / mission-detail），不重造。
 */

import { Crown, Search, PenLine, Gavel } from 'lucide-react';
import type {
  TeamTopologyNode,
  TeamTopologyConnection,
} from '@/components/common/team-topology';

// ── 复用 / 归一的子类型 ────────────────────────────────────────────────

/**
 * 喂给 canonical TeamTopologyCanvas 的归一拓扑视图。
 * 两端拓扑构造逻辑不同（company 由 dimensions+steps 现算；playground 由 roster
 * 派生），契约层只暴露归一后的结果。
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

/** 喂给 canonical MissionTaskList 的单步骤（已是 MissionReportView 导出形状）。 */
export interface MissionStep {
  label: string;
  role: string;
  dimension?: string;
  status: 'done' | 'failed' | 'skipped';
  tokens?: number;
  costCents?: number;
}

/** 算力消耗归一（company cents / playground USD 在 adapter 内换算成 cents）。 */
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

/** 参考文献归一（复用 MissionReportView 的 MissionReference 形状）。 */
export interface Reference {
  source: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
  dimension?: string;
  claim?: string;
}

/** 事实表条目归一（复用 MissionReportView 的 MissionFact 形状）。 */
export interface Fact {
  id?: string;
  entity?: string;
  attribute?: string;
  value?: string;
  sources?: string[];
}

/** 评审裁决归一三态（开放 verdict 字符串在 adapter 内收窄）。 */
export type Verdict = 'approve' | 'revise' | 'reject';

// ── L2 契约：所有 mission 通用（壳层吃）────────────────────────────────

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

// ── L3 契约：深度洞察扩展（深度洞察面板吃）────────────────────────────

export interface DeepInsightMissionView extends BaseMissionView {
  score?: { value: number; verdict: Verdict };
  dimensions: string[];
  /** markdown 正文（company 裸 string / playground 由 artifact.fullMarkdown 抽出）。 */
  report?: string;
  /**
   * 富 artifact 旁路（规范 playgroundWire §③ 路 b）：playground 注入结构化
   * ReportArtifactV2 以保留三视图/版本切换，company 留空走 report markdown。
   * 契约层不约束其形状，L4 报告 tab 决定是否消费。
   */
  reportArtifact?: unknown;
  references: Reference[];
  facts: Fact[];
  reviewNotes: string[];
  /** 对账报告（两端都有，FactTablePanel 消费）。 */
  reconciliationReport?: string;
}

// ── 公共构造：归一拓扑（Leader → N Researcher → Writer / Reviewer DAG）──

/**
 * 由维度名列表构造 deep-insight 标准拓扑。两端共用：company 传 dimensions /
 * 兜底从 steps 推；playground adapter 传归一后的 dimension 名。
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

/** 开放 verdict 字符串 → 归一三态（approve / reject / 其余→revise，对齐 verdictTheme）。 */
function normalizeVerdict(verdict: string | undefined | null): Verdict {
  if (verdict === 'approve') return 'approve';
  if (verdict === 'reject') return 'reject';
  return 'revise';
}

// ── company adapter（静态结果）────────────────────────────────────────

/** company mission.result 形状（mirror MissionReportView.MissionReportResult）。 */
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
  /** company 原始 status；STATUS_MAP 收敛到三态。 */
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

/**
 * company deepdive 静态结果 → DeepInsightMissionView。
 * 拓扑、verdict 收窄、维度兜底全部对齐 MissionReportView 既有逻辑。
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

  const score =
    typeof review?.score === 'number'
      ? { value: review.score, verdict: normalizeVerdict(review.verdict) }
      : undefined;

  return {
    id: input.id,
    title: input.title,
    status: companyStatus(input.status),
    createdAt: input.createdAt,
    team: buildDeepInsightTopology(dimNames, true),
    steps,
    usage: result.usage,
    actions: input.actions,
    score,
    dimensions,
    report: result.summary,
    references,
    facts,
    reviewNotes: review?.notes ?? [],
    reconciliationReport: result.reconciliationReport,
  };
}

// ── playground adapter（live，最小可用映射）──────────────────────────

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

/**
 * playground MissionView（WS 事件流派生）→ DeepInsightMissionView。
 *
 * 最小可用映射：从 `unknown` 安全收窄出 mission/dimensions/cost/citations/
 * factTable/report 等字段，缺失即兜底。**不** import playground 私有类型，
 * 形状通过 isRecord/getX 收窄消费，保持契约层解耦。
 *
 * 完整 live 接线（reportArtifact 三视图旁路、todoBoard→steps 降维、
 * citationNavigation 锚点）留 P2/P3 下沉面板时补强。
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

  // title：清洗 topic（去掉 \n 与 [Re-run focus] 之后的部分）。
  const rawTopic = getStr(mission, 'topic') ?? getStr(root, 'title') ?? '';
  const title = rawTopic.split('\n')[0].split('[Re-run focus]')[0].trim();

  const { status, statusDetail } = playgroundStatus(
    getStr(mission, 'status') ?? getStr(root, 'status')
  );

  // createdAt：ISO startedAt → ms。
  const startedAt = getStr(mission, 'startedAt') ?? getStr(root, 'startedAt');
  const createdAtMs = startedAt ? Date.parse(startedAt) : NaN;
  const createdAt = Number.isNaN(createdAtMs) ? undefined : createdAtMs;

  // dimensions：playground 为 {id;name;rationale?}[] → map(name)。
  const dimensions = getArr(mission, 'dimensions')
    .map((d) => (isRecord(d) ? getStr(d, 'name') : undefined))
    .filter((n): n is string => typeof n === 'string' && n.length > 0);

  // score：finalScore + leaderVerdict。
  const finalScore = getNum(mission, 'finalScore');
  const score =
    typeof finalScore === 'number'
      ? {
          value: finalScore,
          verdict: normalizeVerdict(getStr(mission, 'leaderVerdict')),
        }
      : undefined;

  // usage：cost.tokensUsed(string|null) / costUsd(USD) → cents。
  const cost = isRecord(root.cost) ? root.cost : {};
  const tokensRaw = cost.tokensUsed;
  const totalTokens =
    typeof tokensRaw === 'number'
      ? tokensRaw
      : typeof tokensRaw === 'string' && tokensRaw.trim() !== ''
        ? Number(tokensRaw) || undefined
        : undefined;
  const costUsd = getNum(cost, 'costUsd');
  const usage: ComputeUsage | undefined =
    totalTokens !== undefined || costUsd !== undefined
      ? {
          totalTokens,
          totalCostCents:
            costUsd !== undefined ? Math.round(costUsd * 100) : undefined,
        }
      : undefined;

  // report + reportArtifact：结构化 artifact 抽 fullMarkdown，富 artifact 旁路保留。
  const reportArtifact = root.reportArtifact ?? mission.reportArtifact;
  let report: string | undefined;
  if (isRecord(reportArtifact)) {
    const content = reportArtifact.content;
    if (isRecord(content)) report = getStr(content, 'fullMarkdown');
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

  // steps：todoBoard.items → MissionStep 降维（最小映射，富字段 P2 补）。
  const todoBoard = isRecord(root.todoBoard) ? root.todoBoard : {};
  const steps: MissionStep[] = getArr(todoBoard, 'items')
    .map((it): MissionStep | undefined => {
      if (!isRecord(it)) return undefined;
      const label = getStr(it, 'label') ?? getStr(it, 'title');
      if (!label) return undefined;
      const rawStatus = getStr(it, 'status');
      const stepStatus: MissionStep['status'] =
        rawStatus === 'failed'
          ? 'failed'
          : rawStatus === 'skipped'
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
    score,
    dimensions,
    report,
    reportArtifact: reportArtifact ?? undefined,
    references,
    facts,
    reviewNotes: [],
    reconciliationReport,
  };
}
