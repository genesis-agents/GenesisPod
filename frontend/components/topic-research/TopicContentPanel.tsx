'use client';

/**
 * Topic Content Panel - 专业内容展示面板
 *
 * 设计理念：
 * 1. 信息分层 - 从概览到详情，支持渐进式深入
 * 2. 快速导航 - 报告目录、维度快速跳转
 * 3. 数据可视化 - 关键指标、趋势图表
 * 4. 证据追溯 - 每个结论可追溯到来源
 */

import { useState, useMemo, useRef } from 'react';
import type {
  TopicReport,
  TopicDimension,
  DimensionAnalysis,
  TopicEvidence,
} from '@/types/topic-research';

// Tab 类型定义
type TabType = 'report' | 'team' | 'thinking' | 'references';

// 研究事件类型 (导出供其他组件使用)
export interface ResearchEvent {
  id: string;
  timestamp: Date;
  agentType: 'coordinator' | 'researcher' | 'reviewer' | 'synthesizer';
  agentName: string;
  eventType: 'start' | 'progress' | 'complete' | 'error';
  dimensionName?: string;
  message: string;
}

interface TopicContentPanelProps {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  evidence: TopicEvidence[];
  isLoadingReport: boolean;
  isLoadingEvidence: boolean;
  onExportReport?: (format: 'pdf' | 'docx') => void;
  // 研究事件列表（用于团队互动展示）
  researchEvents?: ResearchEvent[];
}

// Icons
const DocumentIcon = ({ className }: { className?: string }) => (
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
      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
    />
  </svg>
);

const LinkIcon = ({ className }: { className?: string }) => (
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
      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
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

const ChevronDownIcon = ({ className }: { className?: string }) => (
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
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

const SpinnerIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24">
    <circle
      className="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      strokeWidth="4"
    />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// Team Icon
const TeamIcon = ({ className }: { className?: string }) => (
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
      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
    />
  </svg>
);

// Thinking Icon (Brain/Mind)
const ThinkingIcon = ({ className }: { className?: string }) => (
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
      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
    />
  </svg>
);

export function TopicContentPanel({
  report,
  dimensions,
  evidence,
  isLoadingReport,
  isLoadingEvidence,
  onExportReport,
  researchEvents = [],
}: TopicContentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('report');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Safe array fallbacks to prevent undefined access
  const safeDimensions = dimensions || [];
  const safeEvidence = evidence || [];
  const safeEvents = researchEvents || [];

  // Tab 配置
  const tabs: {
    key: TabType;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      key: 'report',
      label: '研究报告',
      icon: <DocumentIcon className="h-4 w-4" />,
    },
    {
      key: 'team',
      label: '团队互动',
      icon: <TeamIcon className="h-4 w-4" />,
      badge: safeEvents.length > 0 ? safeEvents.length : undefined,
    },
    {
      key: 'thinking',
      label: 'Agent思考架构',
      icon: <ThinkingIcon className="h-4 w-4" />,
    },
    {
      key: 'references',
      label: '参考文献',
      icon: <LinkIcon className="h-4 w-4" />,
      badge: safeEvidence.length,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Tab Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                    activeTab === tab.key
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 导出按钮 */}
        {activeTab === 'report' && report && (
          <div className="relative">
            <button
              onClick={() => setExportMenuOpen(!exportMenuOpen)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <DownloadIcon className="h-4 w-4" />
              导出
              <ChevronDownIcon className="h-3 w-3" />
            </button>
            {exportMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setExportMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    onClick={() => {
                      onExportReport?.('pdf');
                      setExportMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    导出 PDF
                  </button>
                  <button
                    onClick={() => {
                      onExportReport?.('docx');
                      setExportMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    导出 Word
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'report' && (
          <ReportTabContent
            report={report}
            dimensions={safeDimensions}
            isLoading={isLoadingReport}
          />
        )}
        {activeTab === 'team' && (
          <TeamInteractionTabContent events={safeEvents} />
        )}
        {activeTab === 'thinking' && <AgentThinkingTabContent />}
        {activeTab === 'references' && (
          <EvidenceTabContent
            evidence={safeEvidence}
            isLoading={isLoadingEvidence}
          />
        )}
      </div>
    </div>
  );
}

// 报告 Tab 内容 - 简洁版，无TOC侧边栏
function ReportTabContent({
  report,
  dimensions,
  isLoading,
}: {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  isLoading: boolean;
}) {
  const contentRef = useRef<HTMLDivElement>(null);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <SpinnerIcon className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">加载报告中...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <DocumentIcon className="h-10 w-10 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无研究报告</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          点击左侧"开始研究"按钮，AI 团队将自动收集资料、分析数据并生成专业报告
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* 报告内容 - 无TOC侧边栏 */}
      <div ref={contentRef} className="h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-6">
          {/* 报告头部 */}
          <div className="mb-8 border-b border-gray-200 pb-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">
                  版本 {report.version} · 生成于{' '}
                  {report.generatedAt
                    ? new Date(report.generatedAt).toLocaleString('zh-CN')
                    : '-'}
                </p>
                <h1 className="mt-2 text-2xl font-bold text-gray-900">
                  {report.title || '研究报告'}
                </h1>
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5">
                <span className="text-sm font-medium text-blue-700">
                  {report.totalSources || 0}
                </span>
                <span className="text-sm text-blue-600">来源引用</span>
              </div>
            </div>
          </div>

          {/* 核心摘要 */}
          {report.summary && (
            <section id="summary" className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-sm text-blue-600">
                  1
                </span>
                核心摘要
              </h2>
              <div className="rounded-xl border border-gray-200 bg-gradient-to-br from-blue-50 to-white p-6">
                <p className="whitespace-pre-wrap leading-relaxed text-gray-700">
                  {report.summary}
                </p>
              </div>
            </section>
          )}

          {/* 关键发现 */}
          {report.highlights && report.highlights.length > 0 && (
            <section id="highlights" className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-sm text-blue-600">
                  2
                </span>
                关键发现
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                {report.highlights.map((highlight, index) => (
                  <HighlightCard key={index} highlight={highlight} />
                ))}
              </div>
            </section>
          )}

          {/* 维度分析摘要 */}
          {report.dimensionAnalyses && report.dimensionAnalyses.length > 0 && (
            <section id="dimensions" className="mb-8">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-blue-100 text-sm text-blue-600">
                  3
                </span>
                维度分析
              </h2>
              <div className="space-y-4">
                {report.dimensionAnalyses.map((analysis) => (
                  <DimensionAnalysisCard
                    key={analysis.id}
                    analysis={analysis}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// 关键发现卡片
function HighlightCard({
  highlight,
}: {
  highlight: {
    type: 'trend' | 'finding' | 'opportunity' | 'challenge';
    title: string;
    content: string;
  };
}) {
  const typeConfig = {
    trend: {
      icon: '📈',
      label: '趋势',
      className: 'border-blue-200 bg-blue-50',
      textClass: 'text-blue-600',
    },
    finding: {
      icon: '💡',
      label: '发现',
      className: 'border-purple-200 bg-purple-50',
      textClass: 'text-purple-600',
    },
    opportunity: {
      icon: '🎯',
      label: '机会',
      className: 'border-green-200 bg-green-50',
      textClass: 'text-green-600',
    },
    challenge: {
      icon: '⚠️',
      label: '挑战',
      className: 'border-orange-200 bg-orange-50',
      textClass: 'text-orange-600',
    },
  };

  const config = typeConfig[highlight.type] || {
    icon: '📋',
    label: highlight.type || '发现',
    className: 'border-gray-200 bg-gray-50',
    textClass: 'text-gray-600',
  };

  return (
    <div className={`rounded-xl border p-4 ${config.className}`}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">{config.icon}</span>
        <span className={`text-xs font-semibold uppercase ${config.textClass}`}>
          {config.label}
        </span>
      </div>
      <h4 className="font-medium text-gray-900">{highlight.title}</h4>
      <p className="mt-1 text-sm text-gray-600">{highlight.content}</p>
    </div>
  );
}

// 维度分析卡片
function DimensionAnalysisCard({ analysis }: { analysis: DimensionAnalysis }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      id={`dim-${analysis.id}`}
      className="overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md"
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">
            {analysis.dimension?.name || '未知维度'}
          </h4>
          {analysis.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-gray-500">
              {analysis.summary}
            </p>
          )}
        </div>
        <div className="ml-4 flex items-center gap-3">
          {analysis.confidenceLevel && (
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                analysis.confidenceLevel === 'high'
                  ? 'bg-green-100 text-green-700'
                  : analysis.confidenceLevel === 'medium'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-gray-100 text-gray-600'
              }`}
            >
              {analysis.confidenceLevel === 'high'
                ? '高可信'
                : analysis.confidenceLevel === 'medium'
                  ? '中可信'
                  : '低可信'}
            </span>
          )}
          <ChevronDownIcon
            className={`h-5 w-5 text-gray-400 transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          {/* 关键发现 */}
          {analysis.keyFindings && analysis.keyFindings.length > 0 && (
            <div className="mb-4">
              <h5 className="mb-2 text-sm font-medium text-gray-700">
                关键发现
              </h5>
              <ul className="space-y-2">
                {analysis.keyFindings.map((finding, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span
                      className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                        finding.significance === 'high'
                          ? 'bg-red-500'
                          : finding.significance === 'medium'
                            ? 'bg-yellow-500'
                            : 'bg-gray-400'
                      }`}
                    />
                    <span className="text-sm text-gray-600">
                      {finding.finding}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 趋势 */}
          {analysis.trends && analysis.trends.length > 0 && (
            <div className="mb-4">
              <h5 className="mb-2 text-sm font-medium text-gray-700">趋势</h5>
              <div className="flex flex-wrap gap-2">
                {analysis.trends.map((trend, idx) => (
                  <span
                    key={idx}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      trend.direction === 'increasing'
                        ? 'bg-green-100 text-green-700'
                        : trend.direction === 'decreasing'
                          ? 'bg-red-100 text-red-700'
                          : trend.direction === 'emerging'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {trend.direction === 'increasing' && '↑'}
                    {trend.direction === 'decreasing' && '↓'}
                    {trend.direction === 'emerging' && '★'}
                    {trend.direction === 'stable' && '→'}
                    {trend.trend}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 详细内容 */}
          {analysis.detailedContent && (
            <div className="rounded-lg bg-white p-3">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-600">
                {analysis.detailedContent.slice(0, 500)}
                {analysis.detailedContent.length > 500 && '...'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// 团队互动 Tab 内容
function TeamInteractionTabContent({ events }: { events: ResearchEvent[] }) {
  const safeEvents = events || [];

  // Agent 类型配置
  const agentConfig: Record<
    ResearchEvent['agentType'],
    { icon: string; label: string; color: string; bgColor: string }
  > = {
    coordinator: {
      icon: 'C',
      label: '协调者',
      color: 'text-gray-700',
      bgColor: 'bg-gray-100',
    },
    researcher: {
      icon: 'R',
      label: '研究员',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
    },
    reviewer: {
      icon: 'V',
      label: '审核员',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
    },
    synthesizer: {
      icon: 'S',
      label: '撰写员',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
    },
  };

  // 事件类型配置
  const eventTypeConfig: Record<
    ResearchEvent['eventType'],
    { icon: string; label: string }
  > = {
    start: { icon: '▶', label: '开始' },
    progress: { icon: '◐', label: '进行中' },
    complete: { icon: '✓', label: '完成' },
    error: { icon: '✗', label: '错误' },
  };

  if (safeEvents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <TeamIcon className="h-10 w-10 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无团队互动</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          开始研究后，AI团队的协作过程将在此展示
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">
            研究过程 ({safeEvents.length} 条记录)
          </h4>
        </div>

        {/* 事件时间线 */}
        <div className="relative">
          {/* 时间线竖线 */}
          <div className="absolute left-4 top-0 h-full w-px bg-gray-200" />

          <div className="space-y-4">
            {safeEvents.map((event, index) => {
              const agent = agentConfig[event.agentType];
              const eventType = eventTypeConfig[event.eventType];

              return (
                <div key={event.id} className="relative flex gap-4 pl-10">
                  {/* 时间线节点 */}
                  <div
                    className={`absolute left-2 flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${agent.bgColor} ${agent.color}`}
                  >
                    {agent.icon}
                  </div>

                  {/* 事件卡片 */}
                  <div
                    className={`flex-1 rounded-lg border p-3 ${
                      event.eventType === 'error'
                        ? 'border-red-200 bg-red-50'
                        : event.eventType === 'complete'
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-medium ${agent.bgColor} ${agent.color}`}
                        >
                          {event.agentName || agent.label}
                        </span>
                        {event.dimensionName && (
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {event.dimensionName}
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-gray-400">
                        {new Date(event.timestamp).toLocaleTimeString('zh-CN', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-gray-700">
                      {event.message}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Agent 思考架构 Tab 内容
function AgentThinkingTabContent() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-100">
        <ThinkingIcon className="h-10 w-10 text-purple-500" />
      </div>
      <h3 className="mt-4 text-lg font-medium text-gray-900">Agent 思考架构</h3>
      <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
        研究过程中，各 Agent 的推理链路、决策依据和思考过程将在此展示
      </p>
      <div className="mt-6 w-full max-w-md space-y-3">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-purple-500 text-xs text-white">
              👑
            </span>
            Leader 决策
          </div>
          <p className="mt-2 text-xs text-gray-500">
            研究维度规划、任务分配、质量审核决策
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs text-white">
              🔍
            </span>
            研究员推理
          </div>
          <p className="mt-2 text-xs text-gray-500">
            信息检索策略、数据分析逻辑、结论推导过程
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 text-xs text-white">
              ✅
            </span>
            审核反馈
          </div>
          <p className="mt-2 text-xs text-gray-500">
            质量评估标准、改进建议、通过/拒绝依据
          </p>
        </div>
      </div>
    </div>
  );
}

// 证据来源 Tab 内容
function EvidenceTabContent({
  evidence,
  isLoading,
}: {
  evidence: TopicEvidence[];
  isLoading: boolean;
}) {
  // Safe array fallback
  const safeEvidence = evidence || [];

  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>(
    'all'
  );
  const [sortBy, setSortBy] = useState<'credibility' | 'date'>('credibility');

  // 筛选和排序证据
  const filteredEvidence = useMemo(() => {
    let result = [...safeEvidence];

    // 筛选
    if (filter !== 'all') {
      result = result.filter((e) => {
        const score = e.credibilityScore || 0;
        if (filter === 'high') return score >= 70;
        if (filter === 'medium') return score >= 40 && score < 70;
        if (filter === 'low') return score < 40;
        return true;
      });
    }

    // 排序
    result.sort((a, b) => {
      if (sortBy === 'credibility') {
        return (b.credibilityScore || 0) - (a.credibilityScore || 0);
      }
      if (sortBy === 'date') {
        const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
        const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
        return dateB - dateA;
      }
      return 0;
    });

    return result;
  }, [safeEvidence, filter, sortBy]);

  // 统计
  const stats = useMemo(() => {
    const high = safeEvidence.filter(
      (e) => (e.credibilityScore || 0) >= 70
    ).length;
    const medium = safeEvidence.filter(
      (e) => (e.credibilityScore || 0) >= 40 && (e.credibilityScore || 0) < 70
    ).length;
    const low = safeEvidence.filter(
      (e) => (e.credibilityScore || 0) < 40
    ).length;
    return { total: safeEvidence.length, high, medium, low };
  }, [safeEvidence]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <SpinnerIcon className="h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-gray-500">加载证据来源...</p>
        </div>
      </div>
    );
  }

  if (safeEvidence.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
          <LinkIcon className="h-10 w-10 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">暂无证据来源</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          刷新专题后将显示所有引用的证据来源及其可信度评分
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* 工具栏 */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">
            共 <strong>{stats.total}</strong> 个来源
          </span>
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-green-600">
              <span className="h-2 w-2 rounded-full bg-green-500"></span>
              高可信 {stats.high}
            </span>
            <span className="flex items-center gap-1 text-yellow-600">
              <span className="h-2 w-2 rounded-full bg-yellow-500"></span>
              中可信 {stats.medium}
            </span>
            <span className="flex items-center gap-1 text-red-600">
              <span className="h-2 w-2 rounded-full bg-red-500"></span>
              低可信 {stats.low}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as typeof filter)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="all">全部</option>
            <option value="high">高可信</option>
            <option value="medium">中可信</option>
            <option value="low">低可信</option>
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-lg border border-gray-300 bg-white px-2 py-1 text-sm"
          >
            <option value="credibility">按可信度</option>
            <option value="date">按日期</option>
          </select>
        </div>
      </div>

      {/* 证据列表 */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid gap-4 md:grid-cols-2">
          {filteredEvidence.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-gray-200 bg-white p-4 transition-all hover:border-blue-300 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h4 className="line-clamp-2 font-medium text-gray-900 group-hover:text-blue-600">
                    {item.title}
                  </h4>
                  <p className="mt-1 text-xs text-gray-500">{item.domain}</p>
                </div>
                {item.credibilityScore !== null && (
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
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
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                <span className="rounded bg-gray-100 px-1.5 py-0.5">
                  {item.sourceType || '网页'}
                </span>
                {item.publishedAt && (
                  <span>
                    {new Date(item.publishedAt).toLocaleDateString('zh-CN')}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
