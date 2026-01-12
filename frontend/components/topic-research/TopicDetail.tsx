'use client';

/**
 * Topic Detail Component
 *
 * 显示专题详情、报告和维度分析
 */

import { useState, useEffect } from 'react';
import type {
  ResearchTopic,
  TopicReport,
  TopicDimension,
  DimensionAnalysis,
} from '@/types/topic-research';
import { DimensionStatus, ResearchTopicType } from '@/types/topic-research';
import { useTopicResearchStore } from '@/stores/topicResearchStore';
import { RefreshProgress } from './RefreshProgress';
import { TopicResearchCanvas } from './TopicResearchCanvas';

interface TopicDetailProps {
  topic: ResearchTopic;
  onBack: () => void;
}

// Icons
const ArrowLeftIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10 19l-7-7m0 0l7-7m-7 7h18"
    />
  </svg>
);

const RefreshIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

const CheckCircleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const LoaderIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const ExclamationCircleIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

// Dimension status badge
function DimensionStatusBadge({ status }: { status: DimensionStatus }) {
  const config = {
    [DimensionStatus.PENDING]: {
      icon: <ClockIcon className="h-3.5 w-3.5" />,
      label: '待研究',
      className: 'bg-gray-100 text-gray-600',
    },
    [DimensionStatus.RESEARCHING]: {
      icon: <LoaderIcon className="h-3.5 w-3.5 animate-spin" />,
      label: '研究中',
      className: 'bg-blue-100 text-blue-600',
    },
    [DimensionStatus.COMPLETED]: {
      icon: <CheckCircleIcon className="h-3.5 w-3.5" />,
      label: '已完成',
      className: 'bg-green-100 text-green-600',
    },
    [DimensionStatus.FAILED]: {
      icon: <ExclamationCircleIcon className="h-3.5 w-3.5" />,
      label: '失败',
      className: 'bg-red-100 text-red-600',
    },
  };

  const { icon, label, className } = config[status];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}

// Topic type gradient
const topicTypeGradients: Record<ResearchTopicType, string> = {
  [ResearchTopicType.MACRO]: 'from-blue-500 to-cyan-600',
  [ResearchTopicType.TECHNOLOGY]: 'from-purple-500 to-pink-600',
  [ResearchTopicType.COMPANY]: 'from-emerald-500 to-teal-600',
};

export function TopicDetail({ topic, onBack }: TopicDetailProps) {
  const {
    dimensions,
    currentReport,
    isRefreshing,
    refreshProgress,
    isLoadingReports,
    fetchDimensions,
    fetchLatestReport,
    triggerRefresh,
    cancelRefresh,
    exportReport,
  } = useTopicResearchStore();

  const [activeTab, setActiveTab] = useState<
    'team' | 'overview' | 'dimensions' | 'evidence'
  >('team');
  const [expandedDimension, setExpandedDimension] = useState<string | null>(
    null
  );

  // Load data
  useEffect(() => {
    fetchDimensions(topic.id);
    fetchLatestReport(topic.id);
  }, [topic.id, fetchDimensions, fetchLatestReport]);

  const handleRefresh = () => {
    triggerRefresh(topic.id);
  };

  const handleCancelRefresh = async () => {
    try {
      await cancelRefresh(topic.id, 'current');
    } catch (error) {
      // Error is already handled in store
    }
  };

  const handleExport = async (format: 'pdf' | 'docx') => {
    if (!currentReport) return;
    try {
      const url = await exportReport(topic.id, currentReport.id, { format });
      window.open(url, '_blank');
    } catch (error) {
      // Error is already handled in store
    }
  };

  const gradient = topicTypeGradients[topic.type];

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-md`}
            >
              <svg
                className="h-5 w-5 text-white"
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
              <h1 className="text-xl font-bold text-gray-900">{topic.name}</h1>
              {topic.description && (
                <p className="text-sm text-gray-500">{topic.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExport('pdf')}
              disabled={!currentReport || isRefreshing}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <DownloadIcon className="h-4 w-4" />
              导出 PDF
            </button>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white ${
                isRefreshing
                  ? 'bg-gray-400'
                  : `bg-gradient-to-r ${gradient} hover:opacity-90`
              }`}
            >
              <RefreshIcon
                className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`}
              />
              {isRefreshing ? '刷新中...' : '立即刷新'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-6 border-b border-gray-200">
          {[
            { key: 'team', label: '研究团队' },
            { key: 'overview', label: '报告概览' },
            { key: 'dimensions', label: '研究维度' },
            { key: 'evidence', label: '证据来源' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              className={`relative pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Refresh Progress */}
      {isRefreshing && refreshProgress && (
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <RefreshProgress
            progress={refreshProgress}
            onCancel={handleCancelRefresh}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'team' && (
          <TopicResearchCanvas
            topicName={topic.name}
            dimensions={dimensions}
            isRefreshing={isRefreshing}
            refreshProgress={refreshProgress}
            onStartRefresh={handleRefresh}
            onCancelRefresh={handleCancelRefresh}
            embedded
          />
        )}
        {activeTab === 'overview' && (
          <div className="p-6">
            <ReportOverview
              report={currentReport}
              isLoading={isLoadingReports}
            />
          </div>
        )}
        {activeTab === 'dimensions' && (
          <div className="p-6">
            <DimensionsList
              dimensions={dimensions}
              report={currentReport}
              expandedId={expandedDimension}
              onToggle={setExpandedDimension}
            />
          </div>
        )}
        {activeTab === 'evidence' && (
          <div className="p-6">
            <EvidenceList topicId={topic.id} reportId={currentReport?.id} />
          </div>
        )}
      </div>
    </div>
  );
}

// Report Overview Component
function ReportOverview({
  report,
  isLoading,
}: {
  report: TopicReport | null;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderIcon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
        <svg
          className="h-16 w-16 text-gray-300"
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
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无报告</h3>
        <p className="mt-1 text-gray-500">点击"立即刷新"生成第一份报告</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Report Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm text-gray-500">版本 {report.version}</span>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">
              {report.title || '研究报告'}
            </h2>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div>
              生成于:{' '}
              {report.generatedAt
                ? new Date(report.generatedAt).toLocaleString('zh-CN')
                : '-'}
            </div>
            <div>来源数: {report.totalSources}</div>
          </div>
        </div>
      </div>

      {/* Summary */}
      {report.summary && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            核心摘要
          </h3>
          <p className="whitespace-pre-wrap text-gray-700">{report.summary}</p>
        </div>
      )}

      {/* Highlights */}
      {report.highlights && report.highlights.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            关键发现
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {report.highlights.map((highlight, index) => (
              <div
                key={index}
                className={`rounded-lg border p-4 ${
                  highlight.type === 'trend'
                    ? 'border-blue-200 bg-blue-50'
                    : highlight.type === 'opportunity'
                      ? 'border-green-200 bg-green-50'
                      : highlight.type === 'challenge'
                        ? 'border-orange-200 bg-orange-50'
                        : 'border-gray-200 bg-gray-50'
                }`}
              >
                <span
                  className={`text-xs font-medium uppercase ${
                    highlight.type === 'trend'
                      ? 'text-blue-600'
                      : highlight.type === 'opportunity'
                        ? 'text-green-600'
                        : highlight.type === 'challenge'
                          ? 'text-orange-600'
                          : 'text-gray-600'
                  }`}
                >
                  {highlight.type === 'trend' && '趋势'}
                  {highlight.type === 'finding' && '发现'}
                  {highlight.type === 'opportunity' && '机会'}
                  {highlight.type === 'challenge' && '挑战'}
                </span>
                <h4 className="mt-1 font-medium text-gray-900">
                  {highlight.title}
                </h4>
                <p className="mt-1 text-sm text-gray-600">
                  {highlight.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimension Analyses */}
      {report.dimensionAnalyses && report.dimensionAnalyses.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            维度分析
          </h3>
          {report.dimensionAnalyses.map((analysis) => (
            <DimensionAnalysisCard key={analysis.id} analysis={analysis} />
          ))}
        </div>
      )}
    </div>
  );
}

// Dimension Analysis Card
function DimensionAnalysisCard({ analysis }: { analysis: DimensionAnalysis }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div>
          <h4 className="font-medium text-gray-900">
            {analysis.dimension?.name || '未知维度'}
          </h4>
          {analysis.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">
              {analysis.summary}
            </p>
          )}
        </div>
        <svg
          className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

      {isExpanded && (
        <div className="border-t border-gray-100 p-4">
          {/* Key Findings */}
          {(analysis.keyFindings || []).length > 0 && (
            <div className="mb-4">
              <h5 className="mb-2 text-sm font-medium text-gray-700">
                关键发现
              </h5>
              <ul className="space-y-2">
                {(analysis.keyFindings || []).map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${
                        finding.significance === 'high'
                          ? 'bg-red-500'
                          : finding.significance === 'medium'
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-gray-600">{finding.finding}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Trends */}
          {(analysis.trends || []).length > 0 && (
            <div className="mb-4">
              <h5 className="mb-2 text-sm font-medium text-gray-700">趋势</h5>
              <ul className="space-y-2">
                {(analysis.trends || []).map((trend, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 text-xs ${
                        trend.direction === 'increasing'
                          ? 'text-green-600'
                          : trend.direction === 'decreasing'
                            ? 'text-red-600'
                            : trend.direction === 'emerging'
                              ? 'text-blue-600'
                              : 'text-gray-500'
                      }`}
                    >
                      {trend.direction === 'increasing' && '↑'}
                      {trend.direction === 'decreasing' && '↓'}
                      {trend.direction === 'emerging' && '★'}
                      {trend.direction === 'stable' && '→'}
                    </span>
                    <span className="text-gray-600">{trend.trend}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Detailed Content */}
          {analysis.detailedContent && (
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap text-gray-600">
                {analysis.detailedContent}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Dimensions List Component
function DimensionsList({
  dimensions,
  report,
  expandedId,
  onToggle,
}: {
  dimensions: TopicDimension[];
  report: TopicReport | null;
  expandedId: string | null;
  onToggle: (id: string | null) => void;
}) {
  if (dimensions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
        <svg
          className="h-16 w-16 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6h16M4 10h16M4 14h16M4 18h16"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无研究维度</h3>
        <p className="mt-1 text-gray-500">请先配置研究维度</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dimensions.map((dimension) => {
        const analysis = report?.dimensionAnalyses?.find(
          (a) => a.dimensionId === dimension.id
        );
        const isExpanded = expandedId === dimension.id;

        return (
          <div
            key={dimension.id}
            className="rounded-xl border border-gray-200 bg-white"
          >
            <button
              onClick={() => onToggle(isExpanded ? null : dimension.id)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-sm font-medium text-gray-600">
                  {dimension.sortOrder}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-gray-900">
                      {dimension.name}
                    </h4>
                    <DimensionStatusBadge status={dimension.status} />
                  </div>
                  {dimension.description && (
                    <p className="mt-0.5 text-sm text-gray-500">
                      {dimension.description}
                    </p>
                  )}
                </div>
              </div>
              <svg
                className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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

            {isExpanded && (
              <div className="border-t border-gray-100 p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">搜索关键词:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(dimension.searchQueries || []).map((query, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
                        >
                          {query}
                        </span>
                      ))}
                      {(!dimension.searchQueries ||
                        dimension.searchQueries.length === 0) && (
                        <span className="text-gray-400">暂无配置</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500">数据来源:</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(dimension.searchSources || []).map((source, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600"
                        >
                          {source}
                        </span>
                      ))}
                      {(!dimension.searchSources ||
                        dimension.searchSources.length === 0) && (
                        <span className="text-gray-400">暂无配置</span>
                      )}
                    </div>
                  </div>
                </div>

                {analysis && (
                  <div className="mt-4 rounded-lg bg-gray-50 p-3">
                    <h5 className="text-sm font-medium text-gray-700">
                      分析摘要
                    </h5>
                    <p className="mt-1 text-sm text-gray-600">
                      {analysis.summary}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Evidence List Component
function EvidenceList({
  topicId,
  reportId,
}: {
  topicId: string;
  reportId: string | undefined;
}) {
  const { evidence, isLoadingEvidence, evidenceTotal, fetchEvidence } =
    useTopicResearchStore();

  useEffect(() => {
    if (reportId) {
      fetchEvidence(topicId, reportId);
    }
  }, [topicId, reportId, fetchEvidence]);

  if (!reportId) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
        <svg
          className="h-16 w-16 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无证据来源</h3>
        <p className="mt-1 text-gray-500">刷新专题后将显示所有引用的证据</p>
      </div>
    );
  }

  if (isLoadingEvidence) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoaderIcon className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const safeEvidence = evidence || [];

  if (safeEvidence.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-20">
        <svg
          className="h-16 w-16 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无证据来源</h3>
        <p className="mt-1 text-gray-500">刷新专题后将显示所有引用的证据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700">
          共 {evidenceTotal || 0} 个来源
        </h3>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {safeEvidence.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="line-clamp-2 font-medium text-gray-900">
                  {item.title}
                </h4>
                <p className="mt-1 text-xs text-gray-500">{item.domain}</p>
              </div>
              {item.credibilityScore !== null && (
                <span
                  className={`ml-2 flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    item.credibilityScore >= 70
                      ? 'bg-green-100 text-green-700'
                      : item.credibilityScore >= 40
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {item.credibilityScore}%
                </span>
              )}
            </div>
            {item.snippet && (
              <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                {item.snippet}
              </p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-400">
              <span>{item.sourceType}</span>
              {item.publishedAt && (
                <>
                  <span>•</span>
                  <span>
                    {new Date(item.publishedAt).toLocaleDateString('zh-CN')}
                  </span>
                </>
              )}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
