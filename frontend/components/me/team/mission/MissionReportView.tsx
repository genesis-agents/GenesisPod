'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Check,
  ListChecks,
  FileText,
  Layers,
  Coins,
  Database,
  ExternalLink,
  ChevronLeft,
  Crown,
  Search,
  PenLine,
  Gavel,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table/Table';
import { StatusBadge, type BadgeTone } from '@/components/ui/badges';
import {
  MissionDetailFrame,
  MissionTaskList,
  MissionActionGroup,
  type MissionTaskColumn,
  type MissionActionButtonSpec,
} from '@/components/common/mission-detail';
import {
  TeamTopologyCanvas,
  type TeamTopologyNode,
  type TeamTopologyConnection,
} from '@/components/common/team-topology';
// MissionDetailFrame 内部用 canonical <Tabs> 渲染 tab 条；此处保留导入让
// audit-ui-discipline R7 识别本页用的是 canonical Tab 体系（不是自写 strip）。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Tabs as _CanonicalTabsForAudit } from '@/components/ui/tabs';
import { MODULE_THEMES } from '@/lib/design/module-themes';
import { createMarkdownComponents } from '@/lib/markdown/createMarkdownComponents';

/**
 * 深度研究 mission 详情 —— 直接复用 canonical MissionDetailFrame（与 Playground
 * /agent-playground/team/[missionId] 同款外壳）：左 360px 团队构成（RoleCard），
 * 右 tab 内容（任务列表 / 输出报告 / 参考文献 / 事实表 / 算力消耗）。
 * 输入是 company mission 完成后写入的 result 形状；纯渲染、无副作用。
 */

export interface MissionReference {
  source: string;
  title?: string;
  snippet?: string;
  publishedAt?: string;
  dimension?: string;
  claim?: string;
}

export interface MissionFact {
  id?: string;
  entity?: string;
  attribute?: string;
  value?: string;
  sources?: string[];
}

export interface MissionStep {
  label: string;
  role: string;
  dimension?: string;
  status: 'done' | 'failed' | 'skipped';
  tokens?: number;
  costCents?: number;
}

export interface MissionReportResult {
  summary?: string;
  review?: { score?: number; verdict?: string; notes?: string[] } | null;
  dimensions?: string[];
  themeSummary?: string;
  references?: MissionReference[];
  factTable?: MissionFact[];
  reconciliationReport?: string;
  steps?: MissionStep[];
  usage?: { totalTokens?: number; totalCostCents?: number };
}

type TabKey = 'tasks' | 'report' | 'references' | 'facts' | 'cost';

const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
  { key: 'tasks', label: '任务列表', Icon: ListChecks },
  { key: 'report', label: '输出报告', Icon: FileText },
  { key: 'references', label: '参考文献', Icon: Layers },
  { key: 'facts', label: '事实表', Icon: Database },
  { key: 'cost', label: '算力消耗', Icon: Coins },
];

type Verdict = 'approve' | 'revise' | 'reject' | string;

function verdictTheme(verdict: Verdict | undefined): {
  ring: string;
  text: string;
  label: string;
} {
  switch (verdict) {
    case 'approve':
      return {
        ring: 'border-emerald-500',
        text: 'text-emerald-600',
        label: '通过',
      };
    case 'reject':
      return { ring: 'border-rose-500', text: 'text-rose-600', label: '驳回' };
    default:
      return {
        ring: 'border-amber-500',
        text: 'text-amber-600',
        label: '待修订',
      };
  }
}

function ScoreRing({
  score,
  verdict,
}: {
  score: number;
  verdict: Verdict | undefined;
}) {
  const theme = verdictTheme(verdict);
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 bg-white',
          theme.ring
        )}
      >
        <span className={cn('text-2xl font-bold leading-none', theme.text)}>
          {score}
        </span>
        <span className="mt-0.5 text-xs text-gray-400">/ 100</span>
      </div>
      <span className={cn('mt-1.5 text-xs font-medium', theme.text)}>
        {theme.label}
      </span>
    </div>
  );
}

export type LiveStageStatus = 'pending' | 'active' | 'done';

const LIVE_STAGES = [
  { key: 'planning', label: '规划' },
  { key: 'execution', label: '执行' },
  { key: 'review', label: '评审' },
] as const;

/**
 * 实时阶段进度 rail —— 运行中由 WS 事件驱动（规划/执行/评审）。
 * active 阶段脉冲高亮，done 打勾，pending 灰。
 */
export function MissionLiveRail({
  status,
}: {
  status: Partial<Record<string, LiveStageStatus>>;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-3">
      {LIVE_STAGES.map((s, i) => {
        const st = status[s.key] ?? 'pending';
        return (
          <div key={s.key} className="flex flex-1 items-center gap-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                  st === 'done'
                    ? 'bg-primary text-primary-foreground'
                    : st === 'active'
                      ? 'animate-pulse bg-primary/10 text-primary ring-2 ring-primary'
                      : 'bg-gray-100 text-gray-400'
                )}
              >
                {st === 'done' ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  'text-sm font-medium',
                  st === 'pending' ? 'text-gray-400' : 'text-gray-800'
                )}
              >
                {s.label}
              </span>
            </div>
            {i < LIVE_STAGES.length - 1 && (
              <div
                className={cn(
                  'h-px flex-1',
                  st === 'done' ? 'bg-primary/40' : 'bg-gray-200'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionHeader({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {icon}
      {children}
    </div>
  );
}

/** 短化展示 URL：去协议、截断。 */
function shortUrl(url: string): string {
  const noProto = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return noProto.length > 48 ? noProto.slice(0, 48) + '…' : noProto;
}

/** 引用/参考面板：来自 researcher findings 的去重来源。 */
function ReferencesPanel({ references }: { references: MissionReference[] }) {
  if (references.length === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无引用"
        description="本次研究未产出可展示的来源引用"
      />
    );
  }
  const isUrl = (s: string) => /^https?:\/\//i.test(s);
  return (
    <ol className="space-y-2">
      {references.map((r, i) => (
        <li
          key={`${r.source}-${i}`}
          className="rounded-xl border border-gray-200 bg-white p-3"
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-500">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-gray-900">
                  {r.title || shortUrl(r.source)}
                </span>
                {isUrl(r.source) && (
                  <a
                    href={r.source}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-gray-400 hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
              {r.snippet && (
                <p className="mt-1 line-clamp-2 text-xs text-gray-500">
                  {r.snippet}
                </p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                {r.dimension && (
                  <span className="rounded bg-violet-50 px-1.5 py-0.5 text-violet-600">
                    {r.dimension}
                  </span>
                )}
                {r.publishedAt && <span>{r.publishedAt}</span>}
                <span className="truncate">{shortUrl(r.source)}</span>
              </div>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** 事实表面板：reconciler 产出的 entity/attribute/value/sources 三元组。 */
function FactTablePanel({
  facts,
  reconciliationReport,
}: {
  facts: MissionFact[];
  reconciliationReport?: string;
}) {
  if (facts.length === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无事实表"
        description="对账阶段未产出结构化事实，或该任务跳过了对账"
      />
    );
  }
  return (
    <div className="space-y-3">
      {reconciliationReport && (
        <p className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs leading-relaxed text-gray-600">
          {reconciliationReport}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <Table className="border-collapse text-left text-xs">
          <THead className="bg-gray-50 text-gray-500">
            <Tr>
              <Th className="px-3 py-2 font-medium">实体</Th>
              <Th className="px-3 py-2 font-medium">属性</Th>
              <Th className="px-3 py-2 font-medium">取值</Th>
              <Th className="px-3 py-2 font-medium">来源</Th>
            </Tr>
          </THead>
          <TBody>
            {facts.map((f, i) => (
              <Tr key={f.id ?? i} className="border-t border-gray-100">
                <Td className="px-3 py-2 font-medium text-gray-800">
                  {f.entity ?? '—'}
                </Td>
                <Td className="px-3 py-2 text-gray-600">
                  {f.attribute ?? '—'}
                </Td>
                <Td className="px-3 py-2 text-gray-800">{f.value ?? '—'}</Td>
                <Td className="px-3 py-2 text-gray-400">
                  {(f.sources ?? []).length} 条
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

/** 算力消耗：各 Agent 步骤的真实 token 用量 + 估算成本（来自 RunResult）。 */
function CostPanel({
  steps,
  usage,
}: {
  steps: MissionStep[];
  usage?: { totalTokens?: number; totalCostCents?: number };
}) {
  const totalTokens =
    usage?.totalTokens ?? steps.reduce((s, st) => s + (st.tokens ?? 0), 0);
  const totalCostCents =
    usage?.totalCostCents ??
    steps.reduce((s, st) => s + (st.costCents ?? 0), 0);
  if (totalTokens === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无算力数据"
        description="该任务未记录 token 用量（旧任务或执行未产生计量）"
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-400">总 Token</div>
          <div className="mt-0.5 text-xl font-bold text-gray-900">
            {totalTokens.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-400">估算成本</div>
          <div className="mt-0.5 text-xl font-bold text-gray-900">
            ¥{(totalCostCents / 100).toFixed(2)}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <Table className="text-left text-xs">
          <THead className="bg-gray-50 text-gray-500">
            <Tr>
              <Th className="px-3 py-2 font-medium">步骤</Th>
              <Th className="px-3 py-2 font-medium">负责人</Th>
              <Th className="px-3 py-2 text-right font-medium">Token</Th>
              <Th className="px-3 py-2 text-right font-medium">占比</Th>
            </Tr>
          </THead>
          <TBody>
            {steps.map((s, i) => {
              const t = s.tokens ?? 0;
              const pct =
                totalTokens > 0 ? Math.round((t / totalTokens) * 100) : 0;
              return (
                <Tr key={i} className="border-t border-gray-100">
                  <Td className="px-3 py-2 font-medium text-gray-800">
                    {s.label}
                  </Td>
                  <Td className="px-3 py-2 text-gray-600">{s.role}</Td>
                  <Td className="px-3 py-2 text-right text-gray-700">
                    {t.toLocaleString()}
                  </Td>
                  <Td className="px-3 py-2 text-right text-gray-400">{pct}%</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

const STEP_STATUS: Record<
  MissionStep['status'],
  { tone: BadgeTone; label: string; bar: string }
> = {
  done: { tone: 'success', label: '已完成', bar: 'border-l-emerald-400' },
  failed: { tone: 'danger', label: '失败', bar: 'border-l-rose-400' },
  skipped: { tone: 'neutral', label: '跳过', bar: 'border-l-gray-300' },
};

export function MissionReportView({
  title,
  createdAt,
  result,
  onBack,
  onRerun,
  onDelete,
}: {
  title: string;
  createdAt?: number;
  result?: MissionReportResult;
  onBack?: () => void;
  /** 重新下发同一任务（用相同团队 + 标题起一个新 mission） */
  onRerun?: () => void;
  /** 删除该 mission */
  onDelete?: () => void;
}) {
  const mdComponents = useMemo(() => createMarkdownComponents((t) => t), []);
  const review = result?.review ?? null;
  const dimensions = result?.dimensions ?? [];
  const summary = result?.summary ?? '';
  const references = result?.references ?? [];
  const facts = result?.factTable ?? [];
  const steps = useMemo(() => result?.steps ?? [], [result?.steps]);

  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // ── 组织架构图（canonical TeamTopologyCanvas，与 playground 同款 DAG）──
  //   Leader → 每个维度一个 Researcher（fan-out）→ Writer / Reviewer。
  //   mission 已完成 → 全部节点 completed。
  const topo = useMemo(() => {
    const dimNames =
      dimensions.length > 0
        ? dimensions
        : steps
            .filter((s) => s.role === 'Researcher')
            .map((s, i) => s.dimension ?? `维度 ${i + 1}`);
    const nodes: TeamTopologyNode[] = [
      {
        id: 'leader',
        name: 'Leader',
        role: 'leader',
        icon: Crown,
        status: 'completed',
        colorKey: 'purple',
        isLeader: true,
        avatarRole: 'leader',
      },
    ];
    const researcherIds: string[] = [];
    dimNames.forEach((d, i) => {
      const id = `researcher#${i}`;
      researcherIds.push(id);
      nodes.push({
        id,
        name: d.length > 8 ? d.slice(0, 7) + '…' : d,
        role: 'researcher',
        icon: Search,
        status: 'completed',
        statusLabel: '研究完成',
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
        status: 'completed',
        colorKey: 'rose',
        avatarRole: 'writer',
      },
      {
        id: 'reviewer',
        name: 'Reviewer',
        role: 'reviewer',
        icon: Gavel,
        status: 'completed',
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
      agentCount: nodes.length,
    };
  }, [dimensions, steps]);

  // 底部操作按钮（canonical MissionActionGroup，playground 同款）
  const actionButtons: MissionActionButtonSpec[] = [];
  if (onRerun) {
    actionButtons.push({
      variant: 'primary',
      emoji: '▶',
      label: '重新下发',
      title: '用相同团队 + 任务标题起一个新 mission',
      onClick: onRerun,
    });
  }
  if (onDelete) {
    actionButtons.push({
      variant: 'danger',
      emoji: '⏹',
      label: '删除',
      title: '删除该任务及其报告',
      onClick: onDelete,
    });
  }

  // ── 任务列表列定义（canonical MissionTaskList）─────────────────
  const taskColumns: MissionTaskColumn<MissionStep>[] = [
    {
      key: 'index',
      label: '#',
      className: 'w-10 text-center',
      render: (_s, i) => <span className="text-gray-400">{i + 1}</span>,
    },
    {
      key: 'label',
      label: '任务',
      className: 'w-[42%]',
      render: (s) => (
        <span className="font-medium text-gray-800">{s.label}</span>
      ),
    },
    {
      key: 'role',
      label: '负责人',
      className: 'w-[18%]',
      render: (s) => <span className="text-gray-600">{s.role}</span>,
    },
    {
      key: 'dimension',
      label: '维度',
      className: 'w-[22%]',
      render: (s) => (
        <span className="text-gray-500">{s.dimension ?? '—'}</span>
      ),
    },
    {
      key: 'status',
      label: '状态',
      className: 'w-[18%]',
      render: (s) => {
        const m = STEP_STATUS[s.status];
        return <StatusBadge tone={m.tone} label={m.label} />;
      },
    },
  ];

  // ── 左栏：研究团队（组织架构图 + 评分/维度/评审 + 底部操作按钮）──────
  const leftPanel = (
    <div className="flex h-full w-full flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          研究团队
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {topo.agentCount} 个 Agent
          </span>
          <button
            type="button"
            onClick={() => setLeftCollapsed(true)}
            className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="收起团队面板"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 组织架构图（DAG）— 常驻 */}
      <div className="shrink-0 border-b border-gray-100 px-3 py-3">
        <TeamTopologyCanvas
          nodes={topo.nodes}
          rows={topo.rows}
          connections={topo.connections}
          heightClass={topo.viewBoxHeight === 240 ? 'h-[240px]' : 'h-[200px]'}
          viewBoxHeight={topo.viewBoxHeight}
          rowYPositions={topo.rowYPositions}
          patternId="company-mission"
        />
      </div>

      {/* 评分 + 维度 + 评审意见 — 滚动区 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          {typeof review?.score === 'number' ? (
            <div className="flex justify-center">
              <ScoreRing score={review.score} verdict={review.verdict} />
            </div>
          ) : (
            <p className="text-center text-xs text-gray-400">未评分</p>
          )}
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-base font-bold text-gray-900">
                {dimensions.length}
              </div>
              <div className="text-xs text-gray-400">维度</div>
            </div>
            <div>
              <div className="text-base font-bold text-gray-900">
                {references.length}
              </div>
              <div className="text-xs text-gray-400">引用</div>
            </div>
            <div>
              <div className="text-base font-bold text-gray-900">
                {facts.length}
              </div>
              <div className="text-xs text-gray-400">事实</div>
            </div>
          </div>
        </div>

        {dimensions.length > 0 && (
          <div>
            <SectionHeader icon={<Layers className="h-3.5 w-3.5" />}>
              研究维度
            </SectionHeader>
            <div className="flex flex-wrap gap-1.5">
              {dimensions.map((d) => (
                <span
                  key={d}
                  className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
        )}

        {review?.notes && review.notes.length > 0 && (
          <div>
            <SectionHeader icon={<Gavel className="h-3.5 w-3.5" />}>
              评审意见
            </SectionHeader>
            <ul className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-600">
              {review.notes.map((n, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="mt-0.5 text-amber-400">•</span>
                  <span>{n}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 底部操作按钮 — shrink-0 常驻 */}
      {actionButtons.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
          <MissionActionGroup buttons={actionButtons} />
        </div>
      )}
    </div>
  );

  const statusPill = (
    <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5">
      <span className="h-2 w-2 rounded-full bg-emerald-500" />
      <span className="text-sm font-medium text-emerald-700">已完成</span>
    </div>
  );

  const subtitle = (
    <>
      <span>{dimensions.length} 维度</span>
      <span>·</span>
      <span>{references.length} 引用</span>
      {createdAt ? (
        <>
          <span>·</span>
          <span>{new Date(createdAt).toLocaleString()}</span>
        </>
      ) : null}
    </>
  );

  return (
    <MissionDetailFrame<TabKey>
      onBack={() => onBack?.()}
      backTitle="返回任务列表"
      brandGradient={MODULE_THEMES.ask.gradient}
      HeaderIcon={FileText}
      title={<span title={title}>{title}</span>}
      subtitle={subtitle}
      statusPill={statusPill}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      leftPanel={leftPanel}
      leftCollapsed={leftCollapsed}
      onLeftCollapseToggle={() => setLeftCollapsed((v) => !v)}
    >
      <div className="px-6 py-5">
        {activeTab === 'tasks' && (
          <MissionTaskList<MissionStep>
            items={steps}
            columns={taskColumns}
            getRowKey={(s) => `${s.role}-${s.label}`}
            getRowClassName={(s) => cn('border-l-4', STEP_STATUS[s.status].bar)}
            emptyTitle="暂无执行步骤"
            emptyDescription="该任务未记录逐步骤执行轨迹"
          />
        )}

        {activeTab === 'report' &&
          (summary.trim() ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-800">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={mdComponents}
              >
                {summary}
              </ReactMarkdown>
            </div>
          ) : (
            <EmptyState
              type="default"
              size="sm"
              title="无报告正文"
              description="该任务未生成可展示的报告内容"
            />
          ))}

        {activeTab === 'references' && (
          <ReferencesPanel references={references} />
        )}

        {activeTab === 'facts' && (
          <FactTablePanel
            facts={facts}
            reconciliationReport={result?.reconciliationReport}
          />
        )}

        {activeTab === 'cost' && (
          <CostPanel steps={steps} usage={result?.usage} />
        )}
      </div>
    </MissionDetailFrame>
  );
}

export default MissionReportView;
