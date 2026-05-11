'use client';

/**
 * SystemModelInventoryPanel — 系统模型全景面板
 *
 * 挂在 /admin/ai/models 顶部。仿 StorageInventoryPanel 模式：
 * - 顶部 4 卡片：总模型数 / 启用模型数 / 活跃 provider 数 / 用户配置数
 * - 按 type 分布表 (CHAT / EMBEDDING / ...)
 * - 按 provider 分布表 (OpenAI / Anthropic / ...)
 * - 热门模型 Top 10 (用户配置数 / 24h 调用量 / 错误数)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Package,
  RefreshCw,
  Users,
} from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import ResponsiveCard, {
  ResponsiveCardContent,
  ResponsiveCardHeader,
  ResponsiveCardTitle,
} from '@/components/ui/ResponsiveCard';

interface SystemModelInventory {
  summary: {
    totalModels: number;
    enabledModels: number;
    distinctProviders: number;
    userConfiguredModels: number;
  };
  byType: Array<{
    modelType: string;
    total: number;
    enabled: number;
    providers: string[];
  }>;
  byProvider: Array<{
    provider: string;
    total: number;
    enabled: number;
    types: string[];
  }>;
  topModels: Array<{
    modelId: string;
    provider: string;
    modelType: string;
    userConfigCount: number;
    callsLast24h: number;
    errorsLast24h: number;
  }>;
  generatedAt: string;
}

type TabKey = 'summary' | 'distribution' | 'top';

export default function SystemModelInventoryPanel() {
  const [data, setData] = useState<SystemModelInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('summary');
  const [collapsed, setCollapsed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${config.apiUrl}/admin/ai-models/overview`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | SystemModelInventory
        | { data?: SystemModelInventory };
      const payload =
        (raw as { data?: SystemModelInventory }).data ??
        (raw as SystemModelInventory);
      setData(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <div className="animate-pulse text-sm text-gray-500">
            加载系统模型清单...
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  if (error) {
    return (
      <ResponsiveCard>
        <ResponsiveCardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-red-700 ">加载失败：{error}</div>
            <button
              onClick={() => void load()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs hover:bg-gray-50"
            >
              <RefreshCw className="h-3 w-3" />
              重试
            </button>
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>
    );
  }

  if (!data) return null;

  const summary = data.summary ?? {
    totalModels: 0,
    enabledModels: 0,
    distinctProviders: 0,
    userConfiguredModels: 0,
  };
  const byType = data.byType ?? [];
  const byProvider = data.byProvider ?? [];
  const topModels = data.topModels ?? [];

  return (
    <ResponsiveCard>
      <ResponsiveCardHeader>
        <div className="flex items-center justify-between">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex items-center gap-2 rounded text-left transition-colors hover:text-blue-600 "
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            )}
            <ResponsiveCardTitle>系统模型</ResponsiveCardTitle>
            <span className="text-xs font-normal text-gray-500">
              {summary.totalModels} 总 · {summary.enabledModels} 启用 ·{' '}
              {summary.distinctProviders} provider
            </span>
          </button>
          {!collapsed && (
            <button
              onClick={() => void load()}
              aria-label="刷新"
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 "
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          )}
        </div>
        {!collapsed && (
          <div className="mt-3 flex gap-1 border-b border-gray-200 ">
            {(
              [
                { k: 'summary', label: '概览' },
                { k: 'distribution', label: '分布' },
                { k: 'top', label: 'Top 10' },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                onClick={() => setTab(t.k)}
                className={`border-b-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === t.k
                    ? 'border-blue-500 text-blue-600 '
                    : 'border-transparent text-gray-500 hover:text-gray-700 '
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </ResponsiveCardHeader>
      {!collapsed && (
        <ResponsiveCardContent>
          {tab === 'summary' && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                icon={<Bot className="h-4 w-4" />}
                label="总模型数"
                value={summary.totalModels}
                tone="blue"
              />
              <Stat
                icon={<CheckCircle className="h-4 w-4" />}
                label="启用中"
                value={summary.enabledModels}
                tone="green"
              />
              <Stat
                icon={<Package className="h-4 w-4" />}
                label="Provider 数"
                value={summary.distinctProviders}
                tone="purple"
              />
              <Stat
                icon={<Users className="h-4 w-4" />}
                label="用户配置数"
                value={summary.userConfiguredModels}
                tone="amber"
              />
            </div>
          )}

          {tab === 'distribution' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <DistributionTable
                title="按模型类型分布"
                firstCol="类型"
                lastCol="Providers"
                rows={byType.map((t) => ({
                  key: t.modelType,
                  label: t.modelType,
                  total: t.total,
                  enabled: t.enabled,
                  extra: t.providers.join(', '),
                  extraTooltip: t.providers.join(', '),
                }))}
              />
              <DistributionTable
                title="按 Provider 分布"
                firstCol="Provider"
                lastCol="覆盖类型"
                rows={byProvider.map((p) => ({
                  key: p.provider,
                  label: p.provider,
                  total: p.total,
                  enabled: p.enabled,
                  extra: String(p.types.length),
                  extraTooltip: p.types.join(', '),
                }))}
              />
            </div>
          )}

          {tab === 'top' && topModels.length > 0 && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900 ">
                <Activity className="h-4 w-4" />
                Top 10 热门模型（按用户配置数）
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left uppercase text-gray-500 ">
                      <th className="py-2 pr-4">Model</th>
                      <th className="hidden py-2 pr-4 md:table-cell">
                        Provider
                      </th>
                      <th className="hidden py-2 pr-4 md:table-cell">Type</th>
                      <th className="py-2 pr-4 text-right">配置用户</th>
                      <th className="py-2 pr-4 text-right">24h 调用</th>
                      <th className="py-2 text-right">错误率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topModels.map((m) => {
                      const rate =
                        m.callsLast24h > 0
                          ? Math.round((m.errorsLast24h * 100) / m.callsLast24h)
                          : 0;
                      return (
                        <tr
                          key={`${m.provider}/${m.modelId}`}
                          className="border-b border-gray-100 "
                        >
                          <td className="font-mono py-2 pr-4">{m.modelId}</td>
                          <td className="hidden py-2 pr-4 text-gray-500 md:table-cell">
                            {m.provider}
                          </td>
                          <td className="hidden py-2 pr-4 text-gray-500 md:table-cell">
                            {m.modelType}
                          </td>
                          <td className="py-2 pr-4 text-right font-medium">
                            {m.userConfigCount}
                          </td>
                          <td className="py-2 pr-4 text-right">
                            {m.callsLast24h}
                          </td>
                          <td
                            className={`py-2 text-right ${rate > 10 ? 'text-red-600' : rate > 0 ? 'text-amber-600' : 'text-gray-500'}`}
                          >
                            {rate}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-4 text-right text-[11px] text-gray-400">
            生成于 {new Date(data.generatedAt).toLocaleString()}
          </div>
        </ResponsiveCardContent>
      )}
    </ResponsiveCard>
  );
}

function DistributionTable({
  title,
  firstCol,
  lastCol,
  rows,
}: {
  title: string;
  firstCol: string;
  lastCol: string;
  rows: Array<{
    key: string;
    label: string;
    total: number;
    enabled: number;
    extra: string;
    extraTooltip?: string;
  }>;
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-900 ">{title}</h4>
      <div className="overflow-hidden rounded-md border border-gray-200 ">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 ">
            <tr className="border-b border-gray-200 text-left uppercase text-gray-500 ">
              <th className="whitespace-nowrap px-3 py-2">{firstCol}</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">总</th>
              <th className="whitespace-nowrap px-3 py-2 text-right">启用</th>
              <th className="whitespace-nowrap px-3 py-2">{lastCol}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.key}
                className="border-b border-gray-100 last:border-0 "
              >
                <td className="font-mono whitespace-nowrap px-3 py-1.5">
                  {r.label}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {r.total}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-emerald-600 ">
                  {r.enabled}
                </td>
                <td
                  className="max-w-[200px] truncate px-3 py-1.5 text-gray-500"
                  title={r.extraTooltip}
                >
                  {r.extra}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200 ',
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200 ',
    purple: 'bg-violet-50 text-violet-700 border-violet-200 ',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 ',
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${tones[tone]}`}>
      <div className="flex items-center gap-1.5 text-xs font-medium opacity-80">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold">{value.toLocaleString()}</div>
    </div>
  );
}
