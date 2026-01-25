'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { Clock, AlertCircle, RotateCcw, Trash2 } from 'lucide-react';
import type { DraftData } from '@/lib/storage/draft-storage';

interface DraftRecoveryDialogProps {
  draft: DraftData;
  onRecover: () => void;
  onDiscard: () => void;
}

/**
 * Dialog for recovering unsaved drafts
 */
export function DraftRecoveryDialog({
  draft,
  onRecover,
  onDiscard,
}: DraftRecoveryDialogProps) {
  const { t } = useTranslation();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleRecover = () => {
    setIsProcessing(true);
    try {
      onRecover();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDiscard = () => {
    setIsProcessing(true);
    try {
      onDiscard();
    } finally {
      setIsProcessing(false);
    }
  };

  // Format saved time
  const formatSavedTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return t('aiSocial.draft.justNow') || 'Just now';
    } else if (diffMins < 60) {
      return (
        t('aiSocial.draft.minutesAgo', { count: diffMins }) ||
        `${diffMins} minutes ago`
      );
    } else if (diffHours < 24) {
      return (
        t('aiSocial.draft.hoursAgo', { count: diffHours }) ||
        `${diffHours} hours ago`
      );
    } else if (diffDays < 7) {
      return (
        t('aiSocial.draft.daysAgo', { count: diffDays }) ||
        `${diffDays} days ago`
      );
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-gray-100 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">
                {t('aiSocial.draft.recoveryTitle') || 'Unsaved Draft Found'}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {t('aiSocial.draft.recoveryDesc') ||
                  'We found a draft you were working on. Would you like to recover it?'}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4 p-6">
          {/* Draft info */}
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>
                {t('aiSocial.draft.savedAt') || 'Saved'}{' '}
                {formatSavedTime(draft.savedAt)}
              </span>
            </div>

            {/* Title preview */}
            {draft.title && (
              <div className="mb-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('aiSocial.draft.titleLabel') || 'Title'}
                </p>
                <p className="line-clamp-1 text-sm text-gray-900">
                  {draft.title}
                </p>
              </div>
            )}

            {/* Content preview */}
            {draft.content && (
              <div className="mb-2">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('aiSocial.draft.contentLabel') || 'Content'}
                </p>
                <p className="line-clamp-2 text-sm text-gray-700">
                  {draft.content.replace(/<[^>]*>/g, '').substring(0, 100)}
                  {draft.content.length > 100 ? '...' : ''}
                </p>
              </div>
            )}

            {/* Tags preview */}
            {draft.tags.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                  {t('aiSocial.draft.tagsLabel') || 'Tags'}
                </p>
                <div className="flex flex-wrap gap-1">
                  {draft.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
                    >
                      #{tag}
                    </span>
                  ))}
                  {draft.tags.length > 3 && (
                    <span className="inline-flex items-center text-xs text-gray-500">
                      +{draft.tags.length - 3} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <p className="text-xs text-amber-800">
              {t('aiSocial.draft.discardWarning') ||
                'Discarding this draft will permanently delete it. This action cannot be undone.'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 border-t border-gray-100 p-6">
          <button
            onClick={handleDiscard}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {t('aiSocial.draft.discard') || 'Discard Draft'}
          </button>
          <button
            onClick={handleRecover}
            disabled={isProcessing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            {t('aiSocial.draft.recover') || 'Recover Draft'}
          </button>
        </div>
      </div>
    </div>
  );
}
