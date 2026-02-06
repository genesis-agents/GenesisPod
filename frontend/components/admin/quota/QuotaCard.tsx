'use client';

import {
  ExternalLink,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
} from 'lucide-react';
import type {
  ProviderQuota,
  QuotaStatus,
} from '@/hooks/domain/useProviderQuotas';

interface QuotaCardProps {
  quota: ProviderQuota;
  onRefresh?: (provider: string) => void;
  refreshing?: boolean;
}

// 状态颜色映射
const STATUS_COLORS: Record<
  QuotaStatus,
  { bg: string; text: string; border: string; progress: string }
> = {
  normal: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    progress: 'bg-green-500',
  },
  warning: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    progress: 'bg-yellow-500',
  },
  critical: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    progress: 'bg-red-500',
  },
  unavailable: {
    bg: 'bg-gray-50',
    text: 'text-gray-500',
    border: 'border-gray-200',
    progress: 'bg-gray-300',
  },
  error: {
    bg: 'bg-red-50',
    text: 'text-red-600',
    border: 'border-red-200',
    progress: 'bg-red-400',
  },
};

// 状态图标映射
function StatusIcon({ status }: { status: QuotaStatus }) {
  const iconClass = 'h-4 w-4';
  switch (status) {
    case 'normal':
      return <CheckCircle className={`${iconClass} text-green-500`} />;
    case 'warning':
      return <AlertTriangle className={`${iconClass} text-yellow-500`} />;
    case 'critical':
      return <AlertCircle className={`${iconClass} text-red-500`} />;
    case 'error':
      return <AlertCircle className={`${iconClass} text-red-500`} />;
    default:
      return <HelpCircle className={`${iconClass} text-gray-400`} />;
  }
}

// 格式化数字
function formatNumber(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

// 格式化周期
function formatPeriod(period: string): string {
  const periods: Record<string, string> = {
    daily: '每日',
    monthly: '每月',
    unlimited: '无限制',
  };
  return periods[period] || period;
}

// 格式化时间
function formatLastUpdated(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} 小时前`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} 天前`;
}

export default function QuotaCard({
  quota,
  onRefresh,
  refreshing,
}: QuotaCardProps) {
  const colors = STATUS_COLORS[quota.status];
  const hasQuotaData = quota.status !== 'unavailable' && quota.limit !== null;

  return (
    <div
      className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-5 transition-all hover:shadow-md`}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* Provider Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm">
            <img
              src={quota.providerIcon}
              alt={quota.providerDisplayName}
              className="h-8 w-8"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                if (!img.src.endsWith('/icons/ai/default.svg')) {
                  img.src = '/icons/ai/default.svg';
                }
              }}
            />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              {quota.providerDisplayName}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <StatusIcon status={quota.status} />
              <span>{quota.statusMessage}</span>
            </div>
          </div>
        </div>

        {/* Refresh Button */}
        {onRefresh && (
          <button
            onClick={() => onRefresh(quota.provider)}
            disabled={refreshing}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-white/50 hover:text-gray-600 disabled:opacity-50"
            title="刷新配额"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Quota Progress */}
      {hasQuotaData ? (
        <div className="mb-4">
          {/* Progress Bar */}
          <div className="mb-2 h-3 w-full overflow-hidden rounded-full bg-white">
            <div
              className={`h-full ${colors.progress} transition-all duration-500`}
              style={{ width: `${Math.min(quota.usagePercentage || 0, 100)}%` }}
            />
          </div>

          {/* Usage Info */}
          <div className="flex items-center justify-between text-sm">
            <span className={colors.text}>
              已使用: {formatNumber(quota.usage)} {quota.unit}
            </span>
            <span className="text-gray-500">
              {quota.remaining !== null && (
                <>
                  剩余: {formatNumber(quota.remaining)} {quota.unit}
                </>
              )}
            </span>
          </div>

          {/* Percentage */}
          {quota.usagePercentage !== null && (
            <div className="mt-1 text-right text-lg font-bold">
              <span className={colors.text}>
                {quota.usagePercentage.toFixed(1)}%
              </span>
              <span className="ml-1 text-sm font-normal text-gray-400">
                使用率
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="mb-4 rounded-lg bg-white/50 p-4 text-center text-sm text-gray-500">
          暂不支持自动配额查询
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-gray-200/50 pt-3 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span>周期: {formatPeriod(quota.period)}</span>
          {quota.dataSource === 'api' && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-600">
              API
            </span>
          )}
          {quota.dataSource === 'estimated' && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
              估算
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span>更新: {formatLastUpdated(quota.lastUpdated)}</span>
          {quota.consoleUrl && (
            <a
              href={quota.consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-600"
              title="打开官方控制台"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
