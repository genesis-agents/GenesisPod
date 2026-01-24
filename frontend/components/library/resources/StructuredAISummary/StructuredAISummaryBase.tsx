'use client';

import React from 'react';
import type { StructuredAISummary } from '@/types/ai-office';

/**
 * 结构化AI摘要基础组件
 * 所有资源类型的结构化摘要都继承自此组件
 */
interface StructuredAISummaryBaseProps {
  summary: StructuredAISummary;
  compact?: boolean; // 紧凑模式（用于卡片）
  expandable?: boolean; // 可展开模式
}

export const StructuredAISummaryBase: React.FC<
  StructuredAISummaryBaseProps
> = ({ summary, compact = false, expandable = true }) => {
  const [isExpanded, setIsExpanded] = React.useState(!compact);

  const difficultyColors = {
    beginner: 'bg-green-50 text-green-700 border-green-200',
    intermediate: 'bg-blue-50 text-blue-700 border-blue-200',
    advanced: 'bg-orange-50 text-orange-700 border-orange-200',
    expert: 'bg-red-50 text-red-700 border-red-200',
  };

  const difficultyEmoji = {
    beginner: '🌱',
    intermediate: '📚',
    advanced: '🚀',
    expert: '⚡',
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* 头部 */}
      <div className="border-b border-gray-100 p-4">
        {/* 分类和难度 */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
              {summary.category}
            </span>
            {summary.subcategories.length > 0 && (
              <span className="text-xs text-gray-500">
                {summary.subcategories.slice(0, 2).join(', ')}
              </span>
            )}
          </div>
          <div
            className={`flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${
              difficultyColors[summary.difficulty]
            }`}
          >
            <span>{difficultyEmoji[summary.difficulty]}</span>
            <span>{summary.difficulty}</span>
          </div>
        </div>

        {/* 核心概览 */}
        <p className="text-sm leading-relaxed text-gray-700">
          {compact && !isExpanded ? (
            <>{summary.overview.substring(0, 150)}...</>
          ) : (
            summary.overview
          )}
        </p>

        {/* 阅读时间 */}
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          <span>⏱️ {summary.readingTime} min read</span>
          <div className="flex items-center gap-1">
            <span className="text-yellow-500">⭐</span>
            <span>{(summary.confidence * 100).toFixed(0)}% confidence</span>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="space-y-4 p-4">
          {/* 关键要点 */}
          {summary.keyPoints.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                📌 Key Points
              </h4>
              <ul className="space-y-1.5">
                {summary.keyPoints.map((point, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 text-blue-500">▸</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 关键词 */}
          {summary.keywords.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                🏷️ Keywords
              </h4>
              <div className="flex flex-wrap gap-2">
                {summary.keywords.map((keyword, idx) => (
                  <span
                    key={idx}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 可视化建议 */}
          {summary.visualizations && summary.visualizations.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                📊 Visualizations
              </h4>
              <div className="space-y-2">
                {summary.visualizations.map((viz, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 rounded border border-purple-200 bg-purple-50 p-2"
                  >
                    <span className="text-purple-600">▪</span>
                    <div className="flex-1">
                      <p className="text-xs font-medium text-purple-900">
                        {viz.type}
                      </p>
                      <p className="text-xs text-purple-700">
                        {viz.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 元信息 */}
          <div className="border-t border-gray-100 pt-2">
            <p className="text-xs text-gray-500">
              Generated on {summary.generatedAt.toLocaleDateString()} using{' '}
              {summary.model}
            </p>
          </div>
        </div>
      )}

      {/* 展开/收起按钮 */}
      {expandable && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-1 text-sm font-medium text-blue-600 hover:text-blue-700"
          >
            {isExpanded ? '▼ Collapse' : '▶ Expand'}
          </button>
        </div>
      )}
    </div>
  );
};
