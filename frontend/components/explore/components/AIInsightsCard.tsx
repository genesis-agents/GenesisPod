'use client';

import { AIInsight } from '../utils/types';
import TextSelectionToolbar from '@/components/ui/content/TextSelectionToolbar';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface AIInsightsCardProps {
  aiInsights: AIInsight[];
  resourceId?: string;
  onContextMenu?: (e: React.MouseEvent, text: string) => void;
  onAskAI?: (text: string) => void;
}

export default function AIInsightsCard({
  aiInsights,
  resourceId,
  onContextMenu,
  onAskAI,
}: AIInsightsCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-orange-50 to-yellow-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 text-white shadow-sm">
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              {aiInsights.length}{' '}
              {t('explore.aiCards.insights.title') || 'Key Insights'}
            </h3>
            <p className="text-[11px] text-gray-500">
              {t('explore.aiCards.insights.hint') ||
                'Select text for more options'}
            </p>
          </div>
        </div>
      </div>
      <TextSelectionToolbar
        resourceId={resourceId}
        onAskAI={onAskAI}
        onAddToNotes={(text) => {
          onContextMenu?.({} as React.MouseEvent, text);
        }}
      >
        <div className="space-y-2 p-3">
          {aiInsights.map((insight, i) => (
            <div
              key={i}
              className={`group cursor-text select-text rounded-lg border-2 p-2.5 transition-all ${
                insight.importance === 'high'
                  ? 'border-red-200 bg-red-50 hover:border-red-300 hover:bg-red-100'
                  : insight.importance === 'medium'
                    ? 'border-orange-200 bg-orange-50 hover:border-orange-300 hover:bg-orange-100'
                    : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
              }`}
            >
              <div className="flex items-start">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold leading-snug text-gray-900">
                    {insight.title}
                  </h4>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600">
                    {insight.description}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </TextSelectionToolbar>
    </div>
  );
}
