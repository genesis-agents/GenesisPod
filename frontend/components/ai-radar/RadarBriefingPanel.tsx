'use client';

import { Calendar, RefreshCw } from 'lucide-react';

import { useTranslation } from '@/lib/i18n';
import { RadarBriefingCard, type DailySignalView } from './RadarBriefingCard';
import { RadarBriefingSkeleton } from './RadarBriefingSkeleton';
import { RadarBriefingEmptyState } from './RadarBriefingEmptyState';
import { RadarBriefingErrorState } from './RadarBriefingErrorState';

export interface RadarBriefingPanelProps {
  briefingDate: string;
  status: 'completed' | 'no_signals' | 'generating' | 'error';
  signals: DailySignalView[];
  topicId: string;
  topicName: string;
  onRerun?: () => void;
  rerunCount?: number;
  onRetry?: () => void;
  favoritedIds?: Set<string>;
  onToggleFavorite?: (signalId: string) => Promise<void>;
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
  onRetry,
  favoritedIds,
  onToggleFavorite,
}: RadarBriefingPanelProps) {
  const { t } = useTranslation();
  const canRerun = (rerunCount ?? 0) < 2;
  const formattedDate = formatBriefingDate(briefingDate);

  const showEmpty =
    status === 'no_signals' || (status === 'completed' && signals.length === 0);

  return (
    <section className="flex flex-col gap-6">
      {/* Panel header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="inline-flex items-center gap-1.5 text-lg font-semibold text-slate-800 md:text-xl">
          <Calendar className="h-5 w-5 text-violet-600" aria-hidden="true" />
          {t('radar.detail.panelTitle', { date: formattedDate })}
        </h1>

        {onRerun && (
          <div className="flex flex-col items-end gap-0.5">
            <button
              onClick={onRerun}
              disabled={!canRerun || status === 'generating'}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t('radar.detail.rerunBriefing')}
            >
              <RefreshCw className="h-4 w-4" />
              {t('radar.detail.rerunBriefing')}
            </button>
            {rerunCount > 0 && (
              <span className="text-xs text-slate-400">
                {t('radar.detail.alreadyRerunToday', { count: rerunCount })}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content area */}
      {status === 'generating' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-500">
            {t('radar.detail.generating')}
          </p>
          <RadarBriefingSkeleton />
        </div>
      )}

      {status === 'error' && <RadarBriefingErrorState onRetry={onRetry} />}

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
              isFavorited={favoritedIds?.has(signal.id)}
              onFavorite={
                onToggleFavorite
                  ? () => onToggleFavorite(signal.id)
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
