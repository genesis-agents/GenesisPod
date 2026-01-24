'use client';

import React from 'react';
import type { ProjectAISummary } from '@/types/ai-office';

/**
 * 开源项目专属结构化摘要组件
 * 针对开源项目资源优化，突出功能、技术栈和项目活力
 */
interface ProjectAISummaryProps {
  summary: ProjectAISummary;
  compact?: boolean;
  expandable?: boolean;
}

const MaturityBadge: React.FC<{ maturity: string }> = ({ maturity }) => {
  const maturities = {
    alpha: {
      emoji: '🔵',
      label: 'Alpha',
      color: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    beta: {
      emoji: '🟢',
      label: 'Beta',
      color: 'bg-green-50 text-green-700 border-green-200',
    },
    stable: {
      emoji: '⭐',
      label: 'Stable',
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    },
    mature: {
      emoji: '🏆',
      label: 'Mature',
      color: 'bg-purple-50 text-purple-700 border-purple-200',
    },
  };

  const m = maturities[maturity as keyof typeof maturities] || maturities.beta;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm font-medium ${m.color}`}
    >
      <span>{m.emoji}</span>
      {m.label}
    </span>
  );
};

const ActivityIndicator: React.FC<{ isActive: boolean }> = ({ isActive }) => {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
        isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
      }`}
    >
      <span
        className={isActive ? 'animate-pulse text-green-500' : 'text-gray-500'}
      >
        ●
      </span>
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
};

export const ProjectAISummaryComponent: React.FC<ProjectAISummaryProps> = ({
  summary,
  compact = false,
  expandable = true,
}) => {
  const [isExpanded, setIsExpanded] = React.useState(!compact);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* 头部 */}
      <div className="border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-blue-50 p-4">
        {/* 成熟度和活力指标 */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MaturityBadge maturity={summary.maturity} />
            <ActivityIndicator isActive={summary.activity.isActive} />
          </div>
        </div>

        {/* 项目名称 */}
        <h3 className="mb-2 text-base font-bold text-gray-900">
          {summary.projectName}
        </h3>

        {/* 项目目的 */}
        <p className="mb-3 text-sm leading-relaxed text-gray-700">
          {summary.purpose}
        </p>

        {/* 项目指标 */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-1 text-gray-600">
            <span>⭐</span>
            <span className="font-semibold">
              {summary.activity.stars.toLocaleString()}
            </span>
            <span>Stars</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600">
            <span>🔀</span>
            <span className="font-semibold">
              {summary.activity.forks.toLocaleString()}
            </span>
            <span>Forks</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600">
            <span>❌</span>
            <span className="font-semibold">{summary.activity.openIssues}</span>
            <span>Issues</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600">
            <span>👥</span>
            <span className="font-semibold">
              {summary.activity.activeContributors}
            </span>
            <span>Contributors</span>
          </div>
        </div>

        {/* 元信息 */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-600">
          <span>📄 {summary.license}</span>
          <span>🏗️ {summary.ecosystem}</span>
          <span>⏱️ {summary.readingTime} min read</span>
          <div className="ml-auto flex items-center gap-1">
            <span className="text-yellow-500">⭐</span>
            <span>{(summary.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="space-y-4 p-4">
          {/* 主要功能 */}
          {summary.mainFeatures.length > 0 && (
            <div className="border-l-4 border-blue-500 pl-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                ✨ Main Features
              </h4>
              <ul className="space-y-1.5">
                {summary.mainFeatures.map((feature, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 text-blue-500">✓</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 技术栈 */}
          {summary.techStack.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                🛠️ Tech Stack
              </h4>
              <div className="flex flex-wrap gap-2">
                {summary.techStack.map((tech, idx) => (
                  <span
                    key={idx}
                    className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 核心概览 */}
          {summary.overview && (
            <div className="border-l-4 border-purple-500 pl-4">
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                📖 Overview
              </h4>
              <p className="text-sm leading-relaxed text-gray-700">
                {summary.overview}
              </p>
            </div>
          )}

          {/* 快速开始 */}
          {summary.gettingStarted && (
            <div className="rounded border border-green-200 bg-green-50 p-3">
              <h4 className="mb-2 text-sm font-semibold text-green-900">
                🚀 Getting Started
              </h4>
              <p className="text-sm leading-relaxed text-green-800">
                {summary.gettingStarted}
              </p>
            </div>
          )}

          {/* 使用场景 */}
          {summary.useCases.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                💡 Use Cases
              </h4>
              <ul className="space-y-1.5">
                {summary.useCases.map((useCase, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 text-green-500">▸</span>
                    <span>{useCase}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 关键要点 */}
          {summary.keyPoints.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-900">
                📌 Key Takeaways
              </h4>
              <ul className="space-y-1.5">
                {summary.keyPoints.map((point, idx) => (
                  <li key={idx} className="flex gap-2 text-sm text-gray-700">
                    <span className="flex-shrink-0 text-orange-500">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 学习曲线 */}
          <div className="rounded border border-blue-200 bg-blue-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-blue-900">
                📈 Learning Curve
              </h4>
              <span className="text-xs font-medium text-blue-700">
                {summary.learningCurve}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-blue-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all"
                style={{
                  width:
                    summary.learningCurve === 'easy'
                      ? '33%'
                      : summary.learningCurve === 'moderate'
                        ? '66%'
                        : '100%',
                }}
              ></div>
            </div>
          </div>

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
                    className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 最后更新 */}
          <div className="border-t border-gray-100 pt-2 text-xs text-gray-500">
            <p>
              Last updated on {summary.activity.lastUpdate.toLocaleDateString()}
            </p>
            <p className="mt-1">AI-analyzed using {summary.model}</p>
          </div>
        </div>
      )}

      {/* 展开/收起按钮 */}
      {expandable && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full py-1 text-sm font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            {isExpanded ? '▼ Collapse' : '▶ View Full Analysis'}
          </button>
        </div>
      )}
    </div>
  );
};
