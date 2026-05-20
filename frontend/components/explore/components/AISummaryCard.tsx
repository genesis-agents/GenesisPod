'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { extractImagesFromMarkdown } from '../utils';
import { Base64Image } from '../resources/Base64Image';
import TextSelectionToolbar from '@/components/ui/content/TextSelectionToolbar';
import { useTranslation } from '@/lib/i18n/i18n-context';

interface AISummaryCardProps {
  aiSummary: string;
  resourceId?: string;
  onContextMenu?: (e: React.MouseEvent, text: string) => void;
  onAskAI?: (text: string) => void;
}

export default function AISummaryCard({
  aiSummary,
  resourceId,
  onContextMenu,
  onAskAI,
}: AISummaryCardProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-red-50 to-orange-50 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-white shadow-sm">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-900">
              {t('explore.aiCards.summary.title') || 'AI Summary'}
            </h3>
            <p className="text-[11px] text-gray-500">
              {t('explore.aiCards.summary.hint') ||
                'Select text for more options'}
            </p>
          </div>
        </div>
      </div>
      <TextSelectionToolbar
        resourceId={resourceId}
        onAskAI={onAskAI}
        onAddToNotes={(text, note) => {
          onContextMenu?.({} as React.MouseEvent, text);
        }}
      >
        <div className="prose prose-sm max-w-none cursor-text select-text p-3">
          {(() => {
            const { images, textContent } =
              extractImagesFromMarkdown(aiSummary);
            return (
              <>
                {images.map((img, idx) => (
                  <Base64Image key={idx} src={img.src} alt={img.alt} />
                ))}
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {textContent}
                </ReactMarkdown>
              </>
            );
          })()}
        </div>
      </TextSelectionToolbar>
    </div>
  );
}
