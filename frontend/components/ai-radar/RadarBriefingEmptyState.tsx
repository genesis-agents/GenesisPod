'use client';

export interface RadarBriefingEmptyStateProps {
  daysSinceLastTier3?: number;
}

export function RadarBriefingEmptyState({
  daysSinceLastTier3,
}: RadarBriefingEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-6 py-10 text-center">
      <p className="text-base font-medium text-slate-600">
        📌 今日 0 条信号 · 持续监控中
      </p>

      {daysSinceLastTier3 != null && daysSinceLastTier3 > 0 && (
        <p className="text-sm text-slate-400">
          上次 ⭐⭐⭐ 信号在{' '}
          <span className="font-medium text-violet-600">
            {daysSinceLastTier3}
          </span>{' '}
          天前
        </p>
      )}
    </div>
  );
}
