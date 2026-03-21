'use client';

import { useState, useEffect } from 'react';
import {
  Zap,
  Clock,
  Activity,
  DollarSign,
  BarChart3,
  Layers,
  Cpu,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n';
import { getProviderBrand } from '@/lib/ai-provider-logos';
import { logger } from '@/lib/utils/logger';
import { getComputeUsage } from '@/lib/api/topic-insights';

// ---- Type definitions ----

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

// ---- Helper functions ----

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

// ---- Sub-components ----

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subText?: string;
  colorClass: string;
}

function SummaryCard({
  icon,
  label,
  value,
  subText,
  colorClass,
}: SummaryCardProps) {
  return (
    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ${colorClass}`}
        >
          {icon}
        </div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold text-gray-900">{value}</p>
      {subText && <p className="mt-0.5 text-xs text-gray-400">{subText}</p>}
    </div>
  );
}

interface ModelNameProps {
  modelId: string;
}

function ModelName({ modelId }: ModelNameProps) {
  if (!modelId) return <span className="text-gray-400">—</span>;
  const brand = getProviderBrand(modelId);
  return (
    <span className="flex items-center gap-1.5">
      {brand.logo && (
        // eslint-disable-next-line @next/next/no-img-element
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

// ---- Main component ----

export function ComputeUsageTab({ topicId }: ComputeUsageTabProps) {
  const { t } = useI18n();
  const [data, setData] = useState<ComputeUsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = (await getComputeUsage(topicId)) as ComputeUsageData;
        setData(result);
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        logger.error('[ComputeUsageTab] fetch error:', err);
        setError((err as Error).message ?? 'Failed to load compute usage');
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
    return () => controller.abort();
  }, [topicId]);

  if (loading) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm text-gray-500">加载中...</p>
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

  // Build i18n-based subtext for Token card
  const tokenSubText = `${t('topicResearch.computeUsage.inputOutput', {
    input: formatNumber(summary.inputTokens),
    output: formatNumber(summary.outputTokens),
  })}`;

  return (
    <div className="space-y-6 p-4">
      {/* Section 1: Overview cards */}
      <section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            icon={<Zap className="h-4 w-4 text-indigo-600" />}
            label={t('topicResearch.computeUsage.totalTokens')}
            value={formatNumber(summary.totalTokens)}
            subText={tokenSubText}
            colorClass="bg-indigo-50"
          />
          <SummaryCard
            icon={<DollarSign className="h-4 w-4 text-emerald-600" />}
            label={t('topicResearch.computeUsage.creditsConsumed')}
            value={formatNumber(summary.totalCreditsConsumed)}
            colorClass="bg-emerald-50"
          />
          <SummaryCard
            icon={<Activity className="h-4 w-4 text-violet-600" />}
            label={t('topicResearch.computeUsage.llmCalls')}
            value={formatNumber(summary.totalLlmCalls)}
            colorClass="bg-violet-50"
          />
          <SummaryCard
            icon={<Clock className="h-4 w-4 text-orange-600" />}
            label={t('topicResearch.computeUsage.researchDuration')}
            value={formatDuration(summary.researchDurationMs)}
            colorClass="bg-orange-50"
          />
        </div>
      </section>

      {/* Section 2: Dimension breakdown */}
      {dimensions.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Layers className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.dimensionBreakdown')}
          </h3>
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    {t('topicResearch.computeUsage.dimension')}
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    {t('topicResearch.computeUsage.model')}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                    {t('topicResearch.computeUsage.tokens')}
                  </th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">
                    {t('topicResearch.computeUsage.sources')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 bg-white">
                {dimensions.map((dim, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-xs font-medium text-gray-800">
                      {dim.dimensionName}
                    </td>
                    <td className="px-4 py-3">
                      <ModelName modelId={dim.modelUsed ?? ''} />
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-gray-600">
                      {dim.tokensUsed != null
                        ? formatNumber(dim.tokensUsed)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-xs tabular-nums text-gray-600">
                      {dim.sourcesUsed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 3: Model distribution */}
      {modelDistribution.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <BarChart3 className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.modelDistribution')}
          </h3>
          <div className="space-y-3 rounded-lg border border-gray-100 bg-white p-4">
            {modelDistribution.map((item, idx) => {
              const brand = getProviderBrand(item.modelId);
              const barWidth = Math.max(item.percentage, 2);
              return (
                <div key={idx} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      {brand.logo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={brand.logo}
                          alt={brand.name}
                          className="h-4 w-4 flex-shrink-0"
                        />
                      )}
                      <span className="truncate text-xs text-gray-700">
                        {item.modelId}
                      </span>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-3 text-xs text-gray-500">
                      <span className="tabular-nums">
                        {item.callCount} {t('topicResearch.computeUsage.calls')}
                      </span>
                      <span className="tabular-nums text-gray-400">
                        {formatNumber(item.totalTokens)} tokens
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: brand.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Section 4: Mission info */}
      {mission && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Cpu className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.missionInfo')}
          </h3>
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-white p-4 sm:grid-cols-3">
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
              <p className="mt-1 text-xs font-medium text-gray-700">
                {mission.completedTasks} / {mission.totalTasks}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">开始时间</p>
              <p className="mt-1 text-xs text-gray-700">
                {formatTime(mission.startedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">结束时间</p>
              <p className="mt-1 text-xs text-gray-700">
                {formatTime(mission.completedAt)}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Section 5: Credit history */}
      {creditHistory.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Activity className="h-4 w-4 text-gray-400" />
            {t('topicResearch.computeUsage.creditHistory')}
          </h3>
          <div className="overflow-hidden rounded-lg border border-gray-100 bg-white">
            <ul className="divide-y divide-gray-50">
              {creditHistory.slice(0, 20).map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-3 px-4 py-3"
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
                    {item.tokenCount != null && (
                      <span className="tabular-nums text-gray-400">
                        {formatNumber(item.tokenCount)} tokens
                      </span>
                    )}
                    <span
                      className={`font-medium tabular-nums ${item.amount < 0 ? 'text-rose-600' : 'text-emerald-600'}`}
                    >
                      {item.amount > 0 ? '+' : ''}
                      {item.amount}
                    </span>
                    <span className="text-gray-400">
                      {formatTime(item.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
