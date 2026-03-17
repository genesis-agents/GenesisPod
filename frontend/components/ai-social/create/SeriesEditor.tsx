'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore } from '@/stores';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Edit3,
  FileText,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import DOMPurify from 'isomorphic-dompurify';
import { ContentEditor } from './ContentEditor';

/**
 * 系列内容编辑器
 * 当 Topic Insights 报告被拆分为多篇文章时，显示系列总览和单篇编辑
 */
export function SeriesEditor() {
  const { t } = useTranslation();
  const {
    seriesParts,
    activePartIndex,
    sourceTitle,
    setStep,
    enterPartEdit,
    exitPartEdit,
  } = useSocialCreateStore();

  const [expandedParts, setExpandedParts] = useState<Set<number>>(new Set([0]));

  // Toggle preview expansion
  const toggleExpand = (index: number) => {
    setExpandedParts((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  // Count visible text characters (strip HTML tags)
  const getWordCount = (html: string): number => {
    const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');
    return text.length;
  };

  // Count chart placeholders in content
  const getChartCount = (html: string): number => {
    const matches = html.match(/<!-- chart:[^\s]+ -->/g);
    return matches?.length || 0;
  };

  // If editing a single part, show ContentEditor
  if (activePartIndex >= 0) {
    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <button
            onClick={exitPartEdit}
            className="flex items-center gap-1 text-rose-600 hover:text-rose-700"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('aiSocial.series.backToOverview') || 'Back to series'}
          </button>
          <span>/</span>
          <span className="text-gray-700">
            {t('aiSocial.series.partN', { n: activePartIndex + 1 }) ||
              `Part ${activePartIndex + 1}`}
          </span>
        </div>
        <ContentEditor />
      </div>
    );
  }

  // Series overview mode
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setStep(3)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">
            {t('aiSocial.series.title') || 'Series Content'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            {sourceTitle || ''} &middot;{' '}
            {t('aiSocial.series.totalParts', { count: seriesParts.length }) ||
              `${seriesParts.length} articles`}{' '}
            &middot;{' '}
            {t('aiSocial.series.totalWords', {
              count: seriesParts.reduce(
                (sum, p) => sum + getWordCount(p.content),
                0
              ),
            }) ||
              `~${seriesParts.reduce((sum, p) => sum + getWordCount(p.content), 0).toLocaleString()} chars`}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-600">
          <Sparkles className="h-4 w-4" />
          {t('aiSocial.series.fromTopicInsights') || 'From Topic Insights'}
        </div>
      </div>

      {/* Parts list */}
      <div className="space-y-3">
        {seriesParts.map((part, index) => {
          const isExpanded = expandedParts.has(index);
          const wordCount = getWordCount(part.content);
          const chartCount = getChartCount(part.content);

          return (
            <div
              key={part.id}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-sm"
            >
              {/* Card header */}
              <div className="flex items-center gap-4 p-4">
                {/* Part number badge */}
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-pink-600 text-sm font-bold text-white">
                  {index + 1}
                </div>

                {/* Info */}
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-gray-900">
                    {part.title}
                  </h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />~
                      {wordCount.toLocaleString()}{' '}
                      {t('aiSocial.series.chars') || 'chars'}
                    </span>
                    {chartCount > 0 && (
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3.5 w-3.5" />
                        {chartCount} {t('aiSocial.series.charts') || 'charts'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => enterPartEdit(index)}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    {t('common.edit') || 'Edit'}
                  </button>
                  <button
                    onClick={() => toggleExpand(index)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Expandable preview */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                  <div
                    className="prose prose-sm max-h-64 max-w-none overflow-auto text-gray-600"
                    dangerouslySetInnerHTML={{
                      __html: DOMPurify.sanitize(part.content),
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
