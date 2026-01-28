'use client';

import { useState } from 'react';
import { triggerCitationClick } from '../citationNavigation';

export interface CitationBadgeProps {
  index: number;
  evidence: {
    id: string;
    title?: string | null;
    url?: string | null;
    snippet?: string | null;
    domain?: string | null;
  };
}

export function CitationBadge({ index, evidence }: CitationBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (evidence.id) {
      triggerCitationClick(evidence.id);
    }
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <sup
        onClick={handleClick}
        className="cursor-pointer rounded bg-purple-100 px-1 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-200"
        title="点击跳转到参考文献"
      >
        [{index}]
      </sup>

      {isHovered && (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-2 w-96 -translate-x-1/2 rounded-lg border border-gray-200 bg-white shadow-xl"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex items-start gap-2 border-b border-gray-100 p-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
              {index}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-2 text-sm font-medium text-gray-900">
                {evidence.title || '未知来源'}
              </h4>
              {evidence.domain && (
                <span className="mt-0.5 inline-block text-xs text-gray-400">
                  {evidence.domain}
                </span>
              )}
            </div>
          </div>

          {evidence.snippet && (
            <div className="max-h-48 overflow-y-auto p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                {evidence.snippet}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-2">
            <button
              onClick={handleClick}
              className="flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-800"
            >
              查看完整来源 →
            </button>
            {evidence.url && (
              <a
                href={evidence.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                onClick={(e) => e.stopPropagation()}
              >
                打开原文 ↗
              </a>
            )}
          </div>

          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-50" />
        </div>
      )}
    </span>
  );
}
