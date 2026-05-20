'use client';

import { AIInsight } from '../utils/types';
import TextSelectionToolbar from '@/components/ui/content/TextSelectionToolbar';
import { FlaskConical } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface AIMethodologyCardProps {
  aiMethodology: AIInsight[];
  resourceId?: string;
  onContextMenu?: (e: React.MouseEvent, text: string) => void;
  onAskAI?: (text: string) => void;
}

export default function AIMethodologyCard({
  aiMethodology,
  resourceId,
  onContextMenu,
  onAskAI,
}: AIMethodologyCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-blue-50 to-cyan-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm">
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
                d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 008 10.586V5L7 4z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-xs font-bold text-gray-900">
              {t('explore.aiCards.methodology.title') || 'Research Methodology'}
            </h3>
            <p className="text-[10px] text-gray-500">
              {t('explore.aiCards.methodology.hint') ||
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
          {aiMethodology.map((method, i) => (
            <div
              key={i}
              className={`group cursor-text select-text rounded-lg border-2 p-2.5 transition-all ${
                method.importance === 'high'
                  ? 'border-blue-200 bg-blue-50 hover:border-blue-300 hover:bg-blue-100'
                  : method.importance === 'medium'
                    ? 'border-cyan-200 bg-cyan-50 hover:border-cyan-300 hover:bg-cyan-100'
                    : 'border-teal-200 bg-teal-50 hover:border-teal-300 hover:bg-teal-100'
              }`}
            >
              <div className="flex items-start gap-2">
                <FlaskConical className="h-4 w-4 flex-shrink-0 text-blue-600" />
                <div className="flex-1">
                  <h4 className="text-xs font-semibold leading-snug text-gray-900">
                    {method.title}
                  </h4>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                    {method.description}
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
