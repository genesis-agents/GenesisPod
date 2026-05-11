'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import { useProviderQuotas } from '@/hooks/domain/useProviderQuotas';
import QuotaCard from './QuotaCard';
import { formatDateSafe } from '@/lib/utils/date';

interface QuotaDashboardProps {
  /** 是否默认展开 */
  defaultExpanded?: boolean;
}

export default function QuotaDashboard({
  defaultExpanded = true,
}: QuotaDashboardProps) {
  const {
    quotas,
    loading,
    refreshing,
    error,
    lastUpdated,
    fetchQuotas,
    refreshQuotas,
    refreshProviderQuota,
  } = useProviderQuotas();

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(
    null
  );

  // 初始化加载
  useEffect(() => {
    fetchQuotas();
  }, [fetchQuotas]);

  // 刷新单个 Provider
  const handleRefreshProvider = async (provider: string) => {
    setRefreshingProvider(provider);
    await refreshProviderQuota(provider);
    setRefreshingProvider(null);
  };

  // 格式化最后更新时间
  const formatLastGlobalUpdate = () => {
    if (!lastUpdated) return '未知';
    return formatDateSafe(lastUpdated, 'datetime-short');
  };

  // 统计摘要
  const summary = {
    total: quotas.length,
    normal: quotas.filter((q) => q.status === 'normal').length,
    warning: quotas.filter((q) => q.status === 'warning').length,
    critical: quotas.filter((q) => q.status === 'critical').length,
    unavailable: quotas.filter((q) => q.status === 'unavailable').length,
    error: quotas.filter((q) => q.status === 'error').length,
  };

  return (
    <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-white shadow-sm">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              API 配额监控
            </h2>
            <p className="text-sm text-gray-500">
              {summary.total} 个提供商 · 最后更新: {formatLastGlobalUpdate()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Summary Stats */}
          <div className="hidden items-center gap-2 md:flex">
            {summary.normal > 0 && (
              <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                {summary.normal} 正常
              </span>
            )}
            {summary.warning > 0 && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-1 text-xs font-medium text-yellow-700">
                {summary.warning} 警告
              </span>
            )}
            {summary.critical > 0 && (
              <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700">
                {summary.critical} 紧急
              </span>
            )}
            {summary.unavailable > 0 && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                {summary.unavailable} 不可用
              </span>
            )}
          </div>

          {/* Refresh Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              refreshQuotas();
            }}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
            刷新全部
          </button>

          {/* Expand/Collapse */}
          <button className="text-gray-400 hover:text-gray-600">
            {expanded ? (
              <ChevronUp className="h-5 w-5" />
            ) : (
              <ChevronDown className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {expanded && (
        <div className="border-t border-gray-100 p-5">
          {/* Loading State */}
          {loading && quotas.length === 0 && (
            <div className="flex h-40 items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                <span className="text-sm text-gray-500">加载配额信息...</span>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Quota Cards Grid */}
          {quotas.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {quotas.map((quota) => (
                <QuotaCard
                  key={quota.provider}
                  quota={quota}
                  onRefresh={handleRefreshProvider}
                  refreshing={refreshingProvider === quota.provider}
                />
              ))}
            </div>
          )}

          {/* Empty State */}
          {!loading && quotas.length === 0 && !error && (
            <div className="flex h-40 items-center justify-center">
              <div className="text-center">
                <BarChart3 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                <p className="text-sm text-gray-500">暂无配额数据</p>
                <p className="text-xs text-gray-400">请先配置 AI 模型</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
