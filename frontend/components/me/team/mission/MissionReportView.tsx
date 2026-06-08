'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, ListChecks, Layers, ExternalLink, Network } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { Tabs } from '@/components/ui/tabs';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table/Table';
import { createMarkdownComponents } from '@/lib/markdown/createMarkdownComponents';

/**
 * 深度研究 mission 的纯展示 UI（独立一套，参考 playground 但不绑其数据）。
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

/** 深度研究流水线固定 6 阶段（展示用 rail）。 */
const DEEPDIVE_STAGES = [
  { label: '规划', desc: '拆解研究维度' },
  { label: '研究', desc: '并发搜证' },
  { label: '对账', desc: '跨维事实核对' },
  { label: '综合', desc: '提炼洞察' },
  { label: '写作', desc: '结构化成稿' },
  { label: '评审', desc: '质量评分' },
] as const;

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

/** 阶段流水线 rail —— mission 完成态全绿。 */
function PipelineRail() {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-3">
      {DEEPDIVE_STAGES.map((s, i) => (
        <div key={s.label} className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 ring-1 ring-gray-200">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Check className="h-3.5 w-3.5" />
            </div>
            <div className="leading-tight">
              <div className="text-xs font-semibold text-gray-800">
                {s.label}
              </div>
              <div className="text-xs text-gray-400">{s.desc}</div>
            </div>
          </div>
          {i < DEEPDIVE_STAGES.length - 1 && (
            <span className="text-gray-300">→</span>
          )}
        </div>
      ))}
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
    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
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
    <ol className="max-h-[58vh] space-y-2 overflow-auto">
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
      <div className="max-h-[52vh] overflow-auto rounded-xl border border-gray-200">
        <Table className="border-collapse text-left text-xs">
          <THead className="sticky top-0 bg-gray-50 text-gray-500">
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

/** 执行步骤表：deepdive 每个 Agent 步骤一行（负责人/维度/状态）。 */
function StepTablePanel({ steps }: { steps: MissionStep[] }) {
  if (steps.length === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无执行步骤"
        description="该任务未记录逐步骤执行轨迹"
      />
    );
  }
  const meta = (s: MissionStep['status']) =>
    s === 'done'
      ? { label: '已完成', cls: 'bg-green-50 text-green-600' }
      : s === 'failed'
        ? { label: '失败', cls: 'bg-red-50 text-red-600' }
        : { label: '跳过', cls: 'bg-gray-100 text-gray-500' };
  return (
    <div className="max-h-[58vh] overflow-auto rounded-xl border border-gray-200">
      <Table className="text-left text-xs">
        <THead className="sticky top-0 bg-gray-50 text-gray-500">
          <Tr>
            <Th className="px-3 py-2 font-medium">#</Th>
            <Th className="px-3 py-2 font-medium">步骤</Th>
            <Th className="px-3 py-2 font-medium">负责人</Th>
            <Th className="px-3 py-2 font-medium">维度</Th>
            <Th className="px-3 py-2 font-medium">状态</Th>
          </Tr>
        </THead>
        <TBody>
          {steps.map((s, i) => {
            const m = meta(s.status);
            return (
              <Tr key={i} className="border-t border-gray-100">
                <Td className="px-3 py-2 text-gray-400">{i + 1}</Td>
                <Td className="px-3 py-2 font-medium text-gray-800">
                  {s.label}
                </Td>
                <Td className="px-3 py-2 text-gray-600">{s.role}</Td>
                <Td className="px-3 py-2 text-gray-500">
                  {s.dimension ?? '—'}
                </Td>
                <Td className="px-3 py-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-medium',
                      m.cls
                    )}
                  >
                    {m.label}
                  </span>
                </Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
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
      <div className="max-h-[48vh] overflow-auto rounded-xl border border-gray-200">
        <Table className="text-left text-xs">
          <THead className="sticky top-0 bg-gray-50 text-gray-500">
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

/** 团队流程 DAG：deepdive 6 个 Agent 的协作链路 + 真实数据标注。 */
function MissionFlowPanel({
  dimensionCount,
  referencesCount,
  factsCount,
  score,
}: {
  dimensionCount: number;
  referencesCount: number;
  factsCount: number;
  score?: number;
}) {
  const nodes: {
    role: string;
    agent: string;
    desc: string;
    stat: string;
    tools?: string[];
  }[] = [
    {
      role: '规划',
      agent: 'Leader',
      desc: '拆解研究维度，制定执行计划',
      stat: `${dimensionCount || '—'} 个维度`,
    },
    {
      role: '研究',
      agent: `Researcher ×${dimensionCount || 'N'}`,
      desc: '每维度并发，真实 web 搜证产出结构化 findings',
      stat: `${referencesCount} 条来源`,
      tools: ['web-search', 'rag-search', 'academic-search'],
    },
    {
      role: '对账',
      agent: 'Reconciler',
      desc: '跨维度事实核对、冲突消解',
      stat: `${factsCount} 条事实`,
    },
    {
      role: '综合',
      agent: 'Analyst',
      desc: '提炼跨维洞察、识别矛盾',
      stat: '洞察成形',
    },
    {
      role: '写作',
      agent: 'Writer',
      desc: '结构化成稿（ResearchReport）',
      stat: '报告成稿',
    },
    {
      role: '评审',
      agent: 'Reviewer',
      desc: '多维质量评分与结论',
      stat: score != null ? `评 ${score} 分` : '已评审',
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <ol>
        {nodes.map((node, i) => (
          <li key={node.role} className="flex gap-3">
            {/* 左侧 rail：序号 + 连接线 */}
            <div className="flex flex-col items-center">
              <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
                {i + 1}
              </span>
              {i < nodes.length - 1 && (
                <div className="my-1 w-px flex-1 bg-gray-200" />
              )}
            </div>
            {/* 节点卡 */}
            <div className="mb-3 flex-1 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {node.role}
                  </span>
                  <span className="text-xs text-gray-400">{node.agent}</span>
                </div>
                <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {node.stat}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{node.desc}</p>
              {node.tools && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {node.tools.map((t) => (
                    <span
                      key={t}
                      className="font-mono rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function MissionReportView({
  title,
  createdAt,
  result,
}: {
  title: string;
  createdAt?: number;
  result?: MissionReportResult;
}) {
  const mdComponents = useMemo(() => createMarkdownComponents((t) => t), []);
  const review = result?.review ?? null;
  const dimensions = result?.dimensions ?? [];
  const summary = result?.summary ?? '';
  const references = result?.references ?? [];
  const facts = result?.factTable ?? [];
  const steps = result?.steps ?? [];
  const [tab, setTab] = useState<
    'steps' | 'report' | 'references' | 'facts' | 'cost'
  >('steps');
  const tabItems = [
    { key: 'steps', label: '执行步骤', count: steps.length },
    { key: 'report', label: '研究报告' },
    { key: 'references', label: '引用', count: references.length },
    { key: 'facts', label: '事实表', count: facts.length },
    { key: 'cost', label: '算力消耗' },
  ];

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* 左：团队构成 + 评分 + 维度 + 评审（类 playground 左栏） */}
      <aside className="space-y-4 lg:col-span-1">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <p className="mt-1 text-xs text-gray-500">
            {result?.themeSummary || '深度研究报告'}
          </p>
          {typeof review?.score === 'number' && (
            <div className="mt-3 flex justify-center">
              <ScoreRing score={review.score} verdict={review.verdict} />
            </div>
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
          {createdAt ? (
            <div className="mt-2 text-center text-xs text-gray-400">
              完成于 {new Date(createdAt).toLocaleString()}
            </div>
          ) : null}
        </div>

        <div>
          <SectionHeader icon={<Network className="h-4 w-4 text-primary" />}>
            团队构成
          </SectionHeader>
          <MissionFlowPanel
            dimensionCount={dimensions.length}
            referencesCount={references.length}
            factsCount={facts.length}
            score={review?.score}
          />
        </div>

        {dimensions.length > 0 && (
          <div>
            <SectionHeader
              icon={<Layers className="h-4 w-4 text-violet-500" />}
            >
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
            <SectionHeader
              icon={<ListChecks className="h-4 w-4 text-amber-500" />}
            >
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
      </aside>

      {/* 右：阶段条 + tabs（类 playground 右栏） */}
      <div className="space-y-3 lg:col-span-2">
        <PipelineRail />
        <div>
          <Tabs
            items={tabItems}
            value={tab}
            onChange={(k) => setTab(k as typeof tab)}
          />
          <div className="mt-3">
            {tab === 'steps' && <StepTablePanel steps={steps} />}
            {tab === 'report' &&
              (summary.trim() ? (
                <div className="max-h-[64vh] overflow-auto rounded-xl border border-gray-200 bg-white p-6 text-sm leading-relaxed text-gray-800">
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
            {tab === 'references' && (
              <ReferencesPanel references={references} />
            )}
            {tab === 'facts' && (
              <FactTablePanel
                facts={facts}
                reconciliationReport={result?.reconciliationReport}
              />
            )}
            {tab === 'cost' && (
              <CostPanel steps={steps} usage={result?.usage} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MissionReportView;
