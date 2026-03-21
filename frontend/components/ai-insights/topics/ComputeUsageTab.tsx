'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Zap,
  Clock,
  Activity,
  DollarSign,
  BarChart3,
  Layers,
  Cpu,
  TrendingUp,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useI18n } from '@/lib/i18n';
import { getProviderBrand } from '@/lib/ai-provider-logos';
import { logger } from '@/lib/utils/logger';
import { getComputeUsage } from '@/lib/api/topic-insights';

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface ComputeUsageSummary {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  totalCreditsConsumed: number;
  estimatedCostUsd: number;
  totalLlmCalls: number;
  totalDimensions: number;
  researchDurationMs: number;
  reportGenerationMs: number;
}

interface DimensionUsage {
  dimensionName: string;
  modelUsed: string | null;
  tokensUsed: number | null;
  sourcesUsed: number;
}

interface ModelDistributionItem {
  modelId: string;
  callCount: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  percentage: number;
}

interface CreditHistoryItem {
  operationType: string;
  amount: number;
  tokenCount: number | null;
  modelName: string | null;
  createdAt: string;
}

interface MissionInfo {
  leaderModel: string | null;
  researchDepth: string | null;
  startedAt: string | null;
  completedAt: string | null;
  totalTasks: number;
  completedTasks: number;
}

interface ComputeUsageData {
  summary: ComputeUsageSummary;
  dimensions: DimensionUsage[];
  modelDistribution: ModelDistributionItem[];
  creditHistory: CreditHistoryItem[];
  mission: MissionInfo | null;
}

interface ComputeUsageTabProps {
  topicId: string;
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString('en-US');
}

function formatNumberFull(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const CHART_COLORS = [
  '#6366f1',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#84cc16',
  '#f97316',
  '#14b8a6',
];

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon,
  label,
  value,
  subText,
  colorClass,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subText?: string;
  colorClass: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}
        >
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      {subText && <p className="mt-0.5 text-xs text-gray-400">{subText}</p>}
    </div>
  );
}

function ModelName({ modelId }: { modelId: string }) {
  if (!modelId) return <span className="text-gray-400">—</span>;
  const brand = getProviderBrand(modelId);
  return (
    <span className="flex items-center gap-1.5">
      {brand.logo && (
        <img
          src={brand.logo}
          alt={brand.name}
          className="h-3.5 w-3.5 flex-shrink-0"
        />
      )}
      <span className="truncate text-xs text-gray-700">{modelId}</span>
    </span>
  );
}

// ──────────────────────────────────────────────────────────────
// Main Component
// ──────────────────────────────────────────────────────────────

export function ComputeUsageTab({ topicId }: ComputeUsageTabProps) {
  const { t } = useI18n();
  const [data, setData] = useState<ComputeUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = (await getComputeUsage(topicId)) as ComputeUsageData;
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          logger.error('[ComputeUsageTab] fetch error:', err);
          setError((err as Error).message ?? 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [topicId]);

  // ── Derived chart data ──
  const tokenDonutData = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Input', value: data.summary.inputTokens, color: '#6366f1' },
      { name: 'Output', value: data.summary.outputTokens, color: '#10b981' },
    ].filter((d) => d.value > 0);
  }, [data]);

  const dimensionBarData = useMemo(() => {
    if (!data) return [];
    return data.dimensions
      .filter((d) => d.tokensUsed != null && d.tokensUsed > 0)
      .map((d) => ({
        name:
          d.dimensionName.length > 8
            ? d.dimensionName.substring(0, 8) + '...'
            : d.dimensionName,
        fullName: d.dimensionName,
        tokens: d.tokensUsed ?? 0,
        sources: d.sourcesUsed,
      }));
  }, [data]);

  const modelPieData = useMemo(() => {
    if (!data) return [];
    return data.modelDistribution.map((m, i) => ({
      name: m.modelId,
      value: m.callCount,
      tokens: m.totalTokens,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [data]);

  // ── Loading / Error states ──
  if (loading) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-500">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center px-8">
        <Zap className="h-10 w-10 text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          {t('topicResearch.computeUsage.noData')}
        </p>
      </div>
    );
  }

  const { summary, dimensions, modelDistribution, creditHistory, mission } =
    data;

  return (
    <div className="space-y-6 overflow-y-auto p-4">
      {/* ═══ Section 1: Summary Cards ═══ */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <SummaryCard
            icon={<Zap className="h-4 w-4 text-indigo-600" />}
            label={t('topicResearch.computeUsage.totalTokens')}
            value={formatNumber(summary.totalTokens)}
            subText={`${t('topicResearch.computeUsage.inputOutput', {
              input: formatNumber(summary.inputTokens),
              output: formatNumber(summary.outputTokens),
            })}`}
            colorClass="bg-indigo-50"
          />
          <SummaryCard
            icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
            label={t('topicResearch.computeUsage.creditsConsumed')}
            value={formatNumberFull(summary.totalCreditsConsumed)}
            subText={
              summary.estimatedCostUsd > 0
                ? `~$${summary.estimatedCostUsd.toFixed(2)} USD`
                : undefined
            }
            colorClass="bg-emerald-50"
          />
          <SummaryCard
            icon={<Activity className="h-4 w-4 text-violet-600" />}
            label={t('topicResearch.computeUsage.llmCalls')}
            value={formatNumberFull(summary.totalLlmCalls)}
            subText={`${summary.totalDimensions} ${t('topicResearch.computeUsage.dimension')}`}
            colorClass="bg-violet-50"
          />
          <SummaryCard
            icon={<Clock className="h-4 w-4 text-orange-600" />}
            label={t('topicResearch.computeUsage.researchDuration')}
            value={formatDuration(summary.researchDurationMs)}
            subText={
              summary.reportGenerationMs > 0
                ? `${t('topicResearch.computeUsage.reportGen')}: ${formatDuration(summary.reportGenerationMs)}`
                : undefined
            }
            colorClass="bg-orange-50"
          />
          <SummaryCard
            icon={<TrendingUp className="h-4 w-4 text-sky-600" />}
            label={t('topicResearch.computeUsage.avgTokenPerDim')}
            value={
              summary.totalDimensions > 0
                ? formatNumber(
                    Math.round(summary.totalTokens / summary.totalDimensions)
                  )
                : '—'
            }
            colorClass="bg-sky-50"
          />
        </div>
      </section>

      {/* ═══ Section 2: Token Distribution (Donut + Dimension Bar) ═══ */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Input/Output Donut */}
        {tokenDonutData.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Zap className="h-4 w-4 text-gray-400" />
              Input / Output Token
            </h3>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={tokenDonutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {tokenDonutData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatNumberFull(Number(value))}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {tokenDonutData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-xs text-gray-600">{entry.name}</span>
                    <span className="text-xs font-medium tabular-nums text-gray-900">
                      {formatNumber(entry.value)}
                    </span>
                    <span className="text-xs text-gray-400">
                      (
                      {summary.totalTokens > 0
                        ? Math.round((entry.value / summary.totalTokens) * 100)
                        : 0}
                      %)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Dimension Token Bar Chart */}
        {dimensionBarData.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Layers className="h-4 w-4 text-gray-400" />
              {t('topicResearch.computeUsage.dimensionBreakdown')}
            </h3>
            <ResponsiveContainer
              width="100%"
              height={dimensions.length * 36 + 30}
            >
              <BarChart
                data={dimensionBarData}
                layout="vertical"
                margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) => formatNumber(v)}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  width={80}
                />
                <Tooltip
                  formatter={(value) => [
                    formatNumberFull(Number(value)) + ' tokens',
                    'Token',
                  ]}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload as
                      | { fullName?: string }
                      | undefined;
                    return item?.fullName ?? String(label);
                  }}
                />
                <Bar dataKey="tokens" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* ═══ Section 3: Model Distribution (Pie + Table) ═══ */}
      {modelDistribution.length > 0 && (
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.modelDistribution')}
          </h3>
          <div className="flex flex-col items-start gap-6 lg:flex-row">
            {/* Pie Chart */}
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie
                  data={modelPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, percent }) => {
                    const n = String(name ?? '');
                    const p = Number(percent ?? 0);
                    return `${n.length > 10 ? n.substring(0, 10) + '..' : n} ${(p * 100).toFixed(0)}%`;
                  }}
                  labelLine={false}
                >
                  {modelPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [`${value} calls`, 'Calls']} />
              </PieChart>
            </ResponsiveContainer>

            {/* Model Table */}
            <div className="min-w-0 flex-1 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="pb-2 text-left text-xs font-medium text-gray-500">
                      {t('topicResearch.computeUsage.model')}
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500">
                      {t('topicResearch.computeUsage.calls')}
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500">
                      Input
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500">
                      Output
                    </th>
                    <th className="pb-2 text-right text-xs font-medium text-gray-500">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {modelDistribution.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="py-2.5 pr-4">
                        <ModelName modelId={item.modelId} />
                      </td>
                      <td className="py-2.5 text-right text-xs tabular-nums text-gray-600">
                        {formatNumberFull(item.callCount)}
                      </td>
                      <td className="py-2.5 text-right text-xs tabular-nums text-gray-400">
                        {formatNumber(item.inputTokens)}
                      </td>
                      <td className="py-2.5 text-right text-xs tabular-nums text-gray-400">
                        {formatNumber(item.outputTokens)}
                      </td>
                      <td className="py-2.5 text-right text-xs font-medium tabular-nums text-gray-700">
                        {formatNumber(item.totalTokens)}
                      </td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-medium">
                    <td className="py-2.5 pr-4 text-xs text-gray-700">Total</td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-gray-700">
                      {formatNumberFull(
                        modelDistribution.reduce((s, m) => s + m.callCount, 0)
                      )}
                    </td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-gray-500">
                      {formatNumber(
                        modelDistribution.reduce((s, m) => s + m.inputTokens, 0)
                      )}
                    </td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-gray-500">
                      {formatNumber(
                        modelDistribution.reduce(
                          (s, m) => s + m.outputTokens,
                          0
                        )
                      )}
                    </td>
                    <td className="py-2.5 text-right text-xs tabular-nums text-gray-900">
                      {formatNumber(
                        modelDistribution.reduce((s, m) => s + m.totalTokens, 0)
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Section 4: Mission Info ═══ */}
      {mission && (
        <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Cpu className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.missionInfo')}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <p className="text-xs text-gray-500">
                {t('topicResearch.computeUsage.leaderModel')}
              </p>
              <div className="mt-1">
                <ModelName modelId={mission.leaderModel ?? ''} />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">
                {t('topicResearch.computeUsage.depth')}
              </p>
              <p className="mt-1 text-xs font-medium text-gray-700">
                {mission.researchDepth ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">
                {t('topicResearch.computeUsage.tasks')}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{
                      width: `${mission.totalTasks > 0 ? (mission.completedTasks / mission.totalTasks) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs tabular-nums text-gray-600">
                  {mission.completedTasks}/{mission.totalTasks}
                </span>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">
                {t('topicResearch.computeUsage.startTime')}
              </p>
              <p className="mt-1 text-xs text-gray-700">
                {formatTime(mission.startedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">
                {t('topicResearch.computeUsage.endTime')}
              </p>
              <p className="mt-1 text-xs text-gray-700">
                {formatTime(mission.completedAt)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ═══ Section 5: Credit History ═══ */}
      {creditHistory.length > 0 && (
        <section className="rounded-xl border border-gray-100 bg-white shadow-sm">
          <h3 className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-700">
            <Activity className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.creditHistory')}
            <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-xs font-normal text-gray-500">
              {creditHistory.length}
            </span>
          </h3>
          <ul className="divide-y divide-gray-50">
            {creditHistory.slice(0, 20).map((item, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-gray-50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {item.operationType}
                  </span>
                  {item.modelName && (
                    <span className="truncate text-xs text-gray-500">
                      {item.modelName}
                    </span>
                  )}
                </div>
                <div className="flex flex-shrink-0 items-center gap-4 text-xs">
                  {item.tokenCount != null && item.tokenCount > 0 && (
                    <span className="tabular-nums text-gray-400">
                      {formatNumber(item.tokenCount)} tokens
                    </span>
                  )}
                  <span
                    className={`min-w-[60px] text-right font-medium tabular-nums ${item.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                  >
                    {item.amount > 0 ? '+' : ''}
                    {formatNumberFull(item.amount)}
                  </span>
                  <span className="w-[80px] text-right text-gray-400">
                    {formatTime(item.createdAt)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          {/* Totals Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-3">
            <span className="text-xs font-medium text-gray-700">
              {t('topicResearch.computeUsage.totalCredits')}
            </span>
            <span className="text-sm font-bold tabular-nums text-rose-600">
              {formatNumberFull(
                creditHistory.reduce((s, c) => s + c.amount, 0)
              )}
            </span>
          </div>
        </section>
      )}
    </div>
  );
}
