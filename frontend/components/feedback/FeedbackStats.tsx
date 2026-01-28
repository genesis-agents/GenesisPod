'use client';

import ClientDate from '@/components/common/ClientDate';
import {
  useFeedbackStats,
  useImprovementTracking,
} from '@/hooks/domain/useResearchFeedback';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  description?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

function StatCard({ title, value, icon, description, trend }: StatCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
          {icon}
        </div>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trend.isPositive ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trend.isPositive ? '+' : '-'}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-semibold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-gray-400">{description}</p>
        )}
      </div>
    </div>
  );
}

export function FeedbackStats() {
  const { data: stats, loading: statsLoading } = useFeedbackStats();
  const { data: tracking, loading: trackingLoading } = useImprovementTracking();

  if (statsLoading || trackingLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="h-32 animate-pulse rounded-lg border border-gray-200 bg-gray-100"
          />
        ))}
      </div>
    );
  }

  const pendingCount =
    (stats?.byStatus?.PENDING || 0) + (stats?.byStatus?.REVIEWING || 0);
  const resolvedCount =
    (stats?.byStatus?.APPLIED || 0) + (stats?.byStatus?.CLOSED || 0);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="总反馈数"
        value={stats?.total || 0}
        icon={<MessageSquare className="h-5 w-5" />}
        description="累计收到的反馈"
      />
      <StatCard
        title="待处理"
        value={pendingCount}
        icon={<Clock className="h-5 w-5" />}
        description="等待审核和处理"
      />
      <StatCard
        title="已应用"
        value={tracking?.applied || 0}
        icon={<CheckCircle className="h-5 w-5" />}
        description="改进已生效"
      />
      <StatCard
        title="效果评分"
        value={tracking?.avgEffectScore?.toFixed(1) || 'N/A'}
        icon={<TrendingUp className="h-5 w-5" />}
        description="平均改进效果 (0-5)"
      />
    </div>
  );
}

export function FeedbackTrendChart() {
  const { data: stats } = useFeedbackStats();

  if (!stats?.recentTrend || stats.recentTrend.length === 0) {
    return null;
  }

  const maxCount = Math.max(...stats.recentTrend.map((d) => d.count), 1);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-medium text-gray-900">最近 7 天趋势</h3>
      <div className="flex h-32 items-end justify-between gap-2">
        {stats.recentTrend.map((day) => (
          <div key={day.date} className="flex flex-1 flex-col items-center">
            <div
              className="w-full rounded-t bg-blue-500 transition-all hover:bg-blue-600"
              style={{
                height: `${(day.count / maxCount) * 100}%`,
                minHeight: day.count > 0 ? '4px' : '0',
              }}
            />
            <ClientDate
              date={day.date}
              format="date"
              dateOptions={{ month: 'numeric', day: 'numeric' }}
              className="mt-2 text-xs text-gray-500"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryBreakdown() {
  const { data: stats } = useFeedbackStats();

  if (!stats?.byCategory) {
    return null;
  }

  const categories = [
    { key: 'QUALITY_ISSUE', label: '质量问题', color: 'bg-red-500' },
    { key: 'CONTENT_ERROR', label: '内容错误', color: 'bg-orange-500' },
    { key: 'FEATURE_REQUEST', label: '功能建议', color: 'bg-blue-500' },
    { key: 'IMPROVEMENT', label: '改进建议', color: 'bg-green-500' },
    { key: 'POSITIVE', label: '正面反馈', color: 'bg-purple-500' },
  ];

  const total = Object.values(stats.byCategory).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-4 text-sm font-medium text-gray-900">分类分布</h3>
      <div className="space-y-3">
        {categories.map((cat) => {
          const count =
            stats.byCategory[cat.key as keyof typeof stats.byCategory] || 0;
          const percentage = ((count / total) * 100).toFixed(1);
          return (
            <div key={cat.key}>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">{cat.label}</span>
                <span className="font-medium">{count}</span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full ${cat.color} transition-all`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
