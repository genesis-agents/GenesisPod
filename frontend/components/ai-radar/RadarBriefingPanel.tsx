'use client';

import { RefreshCw } from 'lucide-react';

import { RadarBriefingCard, type DailySignalView } from './RadarBriefingCard';
import { RadarBriefingSkeleton } from './RadarBriefingSkeleton';
import { RadarBriefingEmptyState } from './RadarBriefingEmptyState';

export interface RadarBriefingPanelProps {
  briefingDate: string;
  status: 'completed' | 'no_signals' | 'generating';
  signals: DailySignalView[];
  topicId: string;
  topicName: string;
  onRerun?: () => void;
  rerunCount?: number;
}

function formatBriefingDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const month = d.getMonth() + 1;
  const day = d.getDate();
  return `${month}月${day}日`;
}

export function RadarBriefingPanel({
  briefingDate,
  status,
  signals,
  topicId,
  topicName,
  onRerun,
  rerunCount = 0,
}: RadarBriefingPanelProps) {
  const canRerun = (rerunCount ?? 0) < 2;
  const formattedDate = formatBriefingDate(briefingDate);

  const showEmpty =
    status === 'no_signals' || (status === 'completed' && signals.length === 0);

  return (
    <section className="flex flex-col gap-6">
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-800 md:text-xl">
          <span className="mr-1">📅</span>
          {formattedDate} · 今日精选
        </h1>

        {onRerun && (
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={onRerun}
              disabled={!canRerun || status === 'generating'}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="重新精选"
            >
              <RefreshCw className="h-4 w-4" />
              重新精选
            </button>
            {rerunCount > 0 && (
              <span className="text-xs text-slate-400">
                今日已精选 {rerunCount} 次
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      {status === 'generating' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">精选生成中…</p>
          <RadarBriefingSkeleton />
        </div>
      )}

      {showEmpty && <RadarBriefingEmptyState />}

      {status === 'completed' && signals.length > 0 && (
        <div className="flex flex-col gap-6">
          {signals.map((signal, idx) => (
            <RadarBriefingCard
              key={signal.id}
              signal={signal}
              index={idx + 1}
              topicId={topicId}
              topicName={topicName}
              detailUrl={`/ai-radar/topic/${topicId}/signal/${signal.id}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
