'use client';

import { Radio, Star } from 'lucide-react';

export interface RadarBriefingEmptyStateProps {
  daysSinceLastTier3?: number;
}

export function RadarBriefingEmptyState({
  daysSinceLastTier3,
}: RadarBriefingEmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 px-6 py-10 text-center">
      <p className="inline-flex items-center gap-1.5 text-base font-medium text-slate-600">
        <Radio className="h-4 w-4 text-violet-500" aria-hidden="true" />
        今日 0 条信号 · 持续监控中
      </p>

      {daysSinceLastTier3 != null && daysSinceLastTier3 > 0 && (
        <p className="inline-flex items-center gap-1 text-sm text-slate-400">
          上次
          <span className="inline-flex items-center gap-0.5 text-violet-600">
            <Star className="h-3 w-3 fill-violet-600" aria-hidden="true" />
            <Star className="h-3 w-3 fill-violet-600" aria-hidden="true" />
            <Star className="h-3 w-3 fill-violet-600" aria-hidden="true" />
          </span>
          信号在{' '}
          <span className="font-medium text-violet-600">
            {daysSinceLastTier3}
          </span>{' '}
          天前
        </p>
      )}
    </div>
  );
}
