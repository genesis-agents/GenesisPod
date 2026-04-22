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

export default function SystemModelInventoryPanel() {
  const [data, setData] = useState<SystemModelInventory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            <div className="text-sm text-red-700 dark:text-red-400">
              加载失败：{error}
            </div>
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
          <ResponsiveCardTitle>系统模型</ResponsiveCardTitle>
          <button
            onClick={() => void load()}
            aria-label="刷新"
            className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          所有启用/禁用模型、provider 分布、用户配置情况与 24h 调用指标
        </p>
      </ResponsiveCardHeader>
      <ResponsiveCardContent>
        {/* 顶部 4 卡片 */}
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

        {/* 按类型分布 */}
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              按模型类型分布
            </h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left uppercase text-gray-500 dark:border-gray-700">
                  <th className="py-2 pr-4">类型</th>
                  <th className="py-2 pr-4 text-right">总 / 启用</th>
                  <th className="py-2">Providers</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((t) => (
                  <tr
                    key={t.modelType}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <td className="font-mono py-2 pr-4">{t.modelType}</td>
                    <td className="py-2 pr-4 text-right">
                      {t.total} /{' '}
                      <span className="text-green-600">{t.enabled}</span>
                    </td>
                    <td className="truncate py-2 text-gray-500">
                      {t.providers.join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              按 Provider 分布
            </h4>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-left uppercase text-gray-500 dark:border-gray-700">
                  <th className="py-2 pr-4">Provider</th>
                  <th className="py-2 pr-4 text-right">总 / 启用</th>
                  <th className="py-2">覆盖类型数</th>
                </tr>
              </thead>
              <tbody>
                {byProvider.map((p) => (
                  <tr
                    key={p.provider}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    <td className="font-mono py-2 pr-4">{p.provider}</td>
                    <td className="py-2 pr-4 text-right">
                      {p.total} /{' '}
                      <span className="text-green-600">{p.enabled}</span>
                    </td>
                    <td className="py-2 text-gray-500">{p.types.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 热门模型 Top 10 */}
        {topModels.length > 0 && (
          <div className="mt-6">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Activity className="h-4 w-4" />
              Top 10 热门模型（按用户配置数）
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-left uppercase text-gray-500 dark:border-gray-700">
                    <th className="py-2 pr-4">Model</th>
                    <th className="hidden py-2 pr-4 md:table-cell">Provider</th>
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
                        className="border-b border-gray-100 dark:border-gray-800"
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
    </ResponsiveCard>
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
    blue: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-900',
    green:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900',
    purple:
      'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/30 dark:text-violet-300 dark:border-violet-900',
    amber:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-900',
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
