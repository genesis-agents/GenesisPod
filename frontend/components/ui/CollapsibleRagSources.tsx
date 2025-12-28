'use client';

import React, { useState } from 'react';
import { useI18n } from '@/lib/i18n/i18n-context';

interface RagSource {
  documentTitle: string;
  excerpt: string;
  score: number;
}

interface CollapsibleRagSourcesProps {
  sources: RagSource[];
  maxSources?: number;
  defaultExpanded?: boolean;
}

/**
 * 可折叠的 RAG 知识库来源组件
 *
 * 功能：
 * - 默认折叠，点击展开查看详情
 * - 显示 TOP N 个来源（默认5个）
 * - 展示完整的摘录内容
 * - 相关度分数可视化
 * - 双语支持
 */
export function CollapsibleRagSources({
  sources,
  maxSources = 5,
  defaultExpanded = false,
}: CollapsibleRagSourcesProps) {
  const { t } = useI18n();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!sources || sources.length === 0) {
    return null;
  }

  const displaySources = sources.slice(0, maxSources);
  const hasMore = sources.length > maxSources;
  const topCount = Math.min(sources.length, maxSources);

  return (
    <div className="mt-3 overflow-hidden rounded-lg border border-purple-100 bg-purple-50/80">
      {/* Header - 点击切换展开/折叠 */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-3 py-2.5 transition-colors hover:bg-purple-100/50"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-purple-700">
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
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
          <span>
            {t('aiAsk.ragSources.title')}{' '}
            {t('aiAsk.ragSources.topN', { count: topCount })}
          </span>
          <span className="rounded-full bg-purple-200 px-1.5 py-0.5 text-[10px]">
            {t('aiAsk.ragSources.total', { count: sources.length })}
          </span>
        </div>
        <svg
          className={`h-4 w-4 text-purple-500 transition-transform duration-200 ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* 折叠内容 */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="space-y-2 px-3 pb-3">
          {displaySources.map((source, idx) => (
            <div
              key={idx}
              className="group rounded-lg border border-purple-100/50 bg-white p-3 shadow-sm transition-colors hover:border-purple-200"
            >
              {/* 头部：排名、标题、分数 */}
              <div className="mb-2 flex items-start gap-2">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-purple-600 text-[11px] font-bold text-white shadow-sm">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h4 className="text-sm font-medium leading-tight text-gray-800">
                    {source.documentTitle}
                  </h4>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-400 to-purple-600"
                      style={{ width: `${Math.min(source.score * 100, 100)}%` }}
                    />
                  </div>
                  <span className="min-w-[32px] text-right text-[10px] font-medium text-purple-600">
                    {(source.score * 100).toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* 摘录内容 - 完整显示 */}
              <div className="pl-8">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-600">
                  {source.excerpt}
                </p>
              </div>
            </div>
          ))}

          {/* 显示更多提示 */}
          {hasMore && (
            <div className="py-1 text-center">
              <span className="text-[10px] text-purple-500">
                {t('aiAsk.ragSources.moreNotShown', {
                  count: sources.length - maxSources,
                })}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* 折叠状态的预览 */}
      {!isExpanded && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 text-[10px] text-purple-600">
            {displaySources.slice(0, 3).map((source, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 rounded border border-purple-100 bg-white/80 px-1.5 py-0.5"
              >
                <span className="font-medium">{idx + 1}.</span>
                <span className="max-w-[100px] truncate">
                  {source.documentTitle}
                </span>
              </span>
            ))}
            {displaySources.length > 3 && (
              <span className="text-purple-400">
                +{displaySources.length - 3}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CollapsibleRagSources;
