'use client';

/**
 * Topic Content Panel - 专题研究内容面板
 *
 * 设计参考 AI Writing 实现:
 * 1. 洞察报告 - Markdown 文档视图 + 大纲导航
 * 2. 团队互动 - Agent 对话历史、Leader 决策过程
 * 3. Agent思考架构 - 每个 Agent 的推理链路
 * 4. 参考文献 - 引用管理
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import type {
  TopicReport,
  TopicDimension,
  TopicEvidence,
} from '@/types/topic-research';

// Tab 类型定义
type TabType = 'report' | 'team' | 'thinking' | 'references';

// 研究事件类型
export interface ResearchEvent {
  id: string;
  timestamp: Date;
  agentType: 'leader' | 'researcher' | 'reviewer' | 'synthesizer';
  agentName: string;
  eventType: 'start' | 'progress' | 'complete' | 'error' | 'decision';
  dimensionName?: string;
  message: string;
  details?: string;
}

// Agent 思考记录
export interface AgentThinking {
  id: string;
  agentType: 'leader' | 'researcher' | 'reviewer' | 'synthesizer';
  agentName: string;
  timestamp: Date;
  phase: string;
  thinking: string;
  decision?: string;
  reasoning?: string;
}

// Report revision for version history
interface ReportRevision {
  id: string;
  version: number;
  createdAt: Date;
  summary?: string;
}

// WebSocket 事件类型
interface WsEvent {
  type: string;
  data: unknown;
  timestamp: string;
}

interface TopicContentPanelProps {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  evidence: TopicEvidence[];
  isLoadingReport: boolean;
  isLoadingEvidence: boolean;
  onExportReport?: (format: 'pdf' | 'docx') => void;
  researchEvents?: ResearchEvent[];
  agentThinkings?: AgentThinking[];
  /** Report revisions for version selection */
  revisions?: ReportRevision[];
  /** Callback to rollback to a specific version */
  onRollbackVersion?: (revisionId: string) => void;
  /** @Leader input callback */
  onSendLeaderInstruction?: (instruction: string) => void;
  /** Whether research is in progress */
  isRefreshing?: boolean;
  /** WebSocket events for real-time updates */
  wsEvents?: WsEvent[];
  /** WebSocket connection status */
  wsConnected?: boolean;
  /** Clear WebSocket events */
  onClearWsEvents?: () => void;
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

const ListIcon = ({ className }: { className?: string }) => (
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
      d="M4 6h16M4 10h16M4 14h16M4 18h16"
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
  agentThinkings = [],
  revisions = [],
  onRollbackVersion,
  onSendLeaderInstruction,
  isRefreshing = false,
  wsEvents = [],
  wsConnected = false,
  onClearWsEvents,
}: TopicContentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('team');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [versionMenuOpen, setVersionMenuOpen] = useState(false);

  // Safe array fallbacks
  const safeDimensions = dimensions || [];
  const safeEvidence = evidence || [];
  const safeEvents = researchEvents || [];
  const safeThinkings = agentThinkings || [];

  // Tab 配置 - 顺序: 团队互动 → Agent思考 → 洞察报告 → 参考文献
  const tabs: {
    key: TabType;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      key: 'team',
      label: '团队互动',
      icon: <TeamIcon className="h-4 w-4" />,
      badge: safeEvents.length > 0 ? safeEvents.length : undefined,
    },
    {
      key: 'thinking',
      label: 'Agent思考',
      icon: <ThinkingIcon className="h-4 w-4" />,
      badge: safeThinkings.length > 0 ? safeThinkings.length : undefined,
    },
    {
      key: 'report',
      label: '洞察报告',
      icon: <DocumentIcon className="h-4 w-4" />,
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
                  className={`rounded-full px-1.5 py-0.5 text-xs ${activeTab === tab.key ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-500'}`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {/* 版本选择下拉框 */}
          {activeTab === 'report' && report && (
            <div className="relative">
              <button
                onClick={() => setVersionMenuOpen(!versionMenuOpen)}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <span>版本 {report.version}</span>
                <ChevronDownIcon className="h-3 w-3" />
              </button>
              {versionMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setVersionMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                    <div className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-400">
                      版本历史
                    </div>
                    {/* Current version */}
                    <div className="flex items-center gap-2 bg-blue-50 px-3 py-2">
                      <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                      <span className="flex-1 text-sm text-blue-700">
                        版本 {report.version} (当前)
                      </span>
                      <span className="text-xs text-blue-500">
                        {report.generatedAt
                          ? new Date(report.generatedAt).toLocaleDateString(
                              'zh-CN'
                            )
                          : '-'}
                      </span>
                    </div>
                    {/* Previous versions */}
                    {revisions.length > 0 ? (
                      revisions.map((rev) => (
                        <button
                          key={rev.id}
                          onClick={() => {
                            onRollbackVersion?.(rev.id);
                            setVersionMenuOpen(false);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50"
                        >
                          <span className="h-2 w-2 rounded-full bg-gray-300"></span>
                          <span className="flex-1 text-sm text-gray-700">
                            版本 {rev.version}
                          </span>
                          <span className="text-xs text-gray-400">
                            {new Date(rev.createdAt).toLocaleDateString(
                              'zh-CN'
                            )}
                          </span>
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-xs text-gray-400">
                        暂无历史版本
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

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
          <TeamInteractionTabContent
            events={safeEvents}
            wsEvents={wsEvents}
            wsConnected={wsConnected}
            onClearEvents={onClearWsEvents}
          />
        )}
        {activeTab === 'thinking' && (
          <AgentThinkingTabContent thinkings={safeThinkings} />
        )}
        {activeTab === 'references' && (
          <EvidenceTabContent
            evidence={safeEvidence}
            isLoading={isLoadingEvidence}
          />
        )}
      </div>

      {/* @Leader Input - Bottom of right panel */}
      {onSendLeaderInstruction && (
        <LeaderInputSection
          onSendInstruction={onSendLeaderInstruction}
          isRefreshing={isRefreshing}
        />
      )}
    </div>
  );
}

// ==================== 报告 Tab ====================
// Section card for chapter-like display (AI Writing pattern)
interface ReportSection {
  id: string;
  type: 'summary' | 'highlights' | 'dimension';
  title: string;
  summary: string;
  isCompleted: boolean;
  wordCount: number;
  content?: string;
}

function ReportTabContent({
  report,
  dimensions,
  isLoading,
}: {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  isLoading: boolean;
}) {
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Extract sections from report for card display
  const sections = useMemo<ReportSection[]>(() => {
    if (!report) return [];

    const result: ReportSection[] = [];

    // Summary section
    if (report.summary) {
      result.push({
        id: 'summary',
        type: 'summary',
        title: '核心摘要',
        summary:
          report.summary.slice(0, 100) +
          (report.summary.length > 100 ? '...' : ''),
        isCompleted: true,
        wordCount: report.summary.length,
        content: report.summary,
      });
    }

    // Highlights section
    if (report.highlights && report.highlights.length > 0) {
      const highlightsContent = report.highlights
        .map((h) => `### ${h.title}\n${h.content}`)
        .join('\n\n');
      result.push({
        id: 'highlights',
        type: 'highlights',
        title: '关键发现',
        summary: `${report.highlights.length} 个关键洞察`,
        isCompleted: true,
        wordCount: highlightsContent.length,
        content: highlightsContent,
      });
    }

    // Dimension analysis sections
    if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
      report.dimensionAnalyses.forEach((analysis, idx) => {
        const dimName = analysis.dimension?.name || `维度 ${idx + 1}`;
        let content = analysis.summary || '';

        if (analysis.keyFindings && analysis.keyFindings.length > 0) {
          content +=
            '\n\n**关键发现:**\n' +
            analysis.keyFindings.map((f) => `- ${f.finding}`).join('\n');
        }
        if (analysis.trends && analysis.trends.length > 0) {
          content +=
            '\n\n**趋势:**\n' +
            analysis.trends.map((t) => `- ${t.trend}`).join('\n');
        }
        if (analysis.detailedContent) {
          content += '\n\n' + analysis.detailedContent;
        }

        result.push({
          id: `dim-${idx}`,
          type: 'dimension',
          title: dimName,
          summary: analysis.summary?.slice(0, 80) || '正在分析...',
          isCompleted: !!analysis.summary,
          wordCount: content.length,
          content,
        });
      });
    }

    return result;
  }, [report]);

  // Get selected section content
  const selectedContent = useMemo(() => {
    if (!selectedSection) return null;
    return sections.find((s) => s.id === selectedSection);
  }, [selectedSection, sections]);

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

  // If a section is selected, show its full content
  if (selectedContent) {
    return (
      <div className="flex h-full flex-col">
        {/* Section header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <button
            onClick={() => setSelectedSection(null)}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <div className="flex-1">
            <h3 className="font-medium text-gray-900">
              {selectedContent.title}
            </h3>
            <p className="text-xs text-gray-500">
              {selectedContent.wordCount} 字
            </p>
          </div>
        </div>

        {/* Section content */}
        <div ref={contentRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-6">
            <article className="prose prose-sm prose-blue max-w-none">
              <ReactMarkdown>{selectedContent.content || ''}</ReactMarkdown>
            </article>
          </div>
        </div>
      </div>
    );
  }

  // Section cards view (like AI Writing chapters)
  return (
    <div className="h-full overflow-y-auto">
      {/* Report header */}
      <div className="border-b border-gray-100 px-6 py-4">
        <h2 className="text-xl font-semibold text-gray-900">{report.title}</h2>
        <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
          <span className="flex items-center gap-1">
            <DocumentIcon className="h-4 w-4" />
            {sections.length} 个章节
          </span>
          <span className="flex items-center gap-1">
            <LinkIcon className="h-4 w-4" />
            {report.totalSources || 0} 个来源
          </span>
          <span>
            {report.generatedAt
              ? new Date(report.generatedAt).toLocaleString('zh-CN')
              : '-'}
          </span>
        </div>
      </div>

      {/* Section cards */}
      <div className="p-4">
        <div className="grid gap-3">
          {sections.map((section, idx) => (
            <button
              key={section.id}
              onClick={() => setSelectedSection(section.id)}
              className="group flex items-start gap-4 rounded-lg border border-gray-200 bg-white p-4 text-left transition-all hover:border-blue-300 hover:shadow-md"
            >
              {/* Completion indicator */}
              <div
                className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                  section.isCompleted
                    ? 'bg-green-100 text-green-600'
                    : 'bg-gray-100 text-gray-400'
                }`}
              >
                {section.isCompleted ? (
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                ) : (
                  <span className="text-sm font-medium">{idx + 1}</span>
                )}
              </div>

              {/* Section info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-gray-900 group-hover:text-blue-600">
                    {section.title}
                  </h4>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      section.type === 'summary'
                        ? 'bg-purple-100 text-purple-600'
                        : section.type === 'highlights'
                          ? 'bg-orange-100 text-orange-600'
                          : 'bg-blue-100 text-blue-600'
                    }`}
                  >
                    {section.type === 'summary'
                      ? '摘要'
                      : section.type === 'highlights'
                        ? '洞察'
                        : '维度'}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                  {section.summary}
                </p>
                <div className="mt-2 text-xs text-gray-400">
                  {section.wordCount} 字
                </div>
              </div>

              {/* Arrow */}
              <svg
                className="h-5 w-5 flex-shrink-0 text-gray-300 transition-transform group-hover:translate-x-1 group-hover:text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 团队互动 Tab ====================
// Leader plan structure for displaying task understanding
interface LeaderPlanDisplay {
  taskUnderstanding?: {
    topic: string;
    scope: string;
    objectives?: string[];
  };
  agentAssignments?: Array<{
    agentType: string;
    dimensionName: string;
    task: string;
  }>;
  researchStrategy?: string;
}

// Agent 详情配置类型
interface AgentDetailInfo {
  name: string;
  role: string;
  description: string;
  skills: string[];
  tools: string[];
  icon: string;
  color: string;
  bgColor: string;
  gradient: string;
}

// 研究团队 Agent 详情配置
const RESEARCH_AGENT_DETAILS: Record<string, AgentDetailInfo> = {
  leader: {
    name: 'Research Leader',
    role: '研究协调员',
    description:
      '负责理解研究任务、规划研究维度、分配研究员任务、协调团队协作。Leader 会分析专题需求，制定研究策略，并根据进度动态调整研究方向。',
    skills: ['任务理解', '研究规划', '团队协调', '质量把控', '报告审核'],
    tools: ['任务分解器', '研究规划器', '质量评估器'],
    icon: '👑',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    gradient: 'from-purple-400 to-purple-600',
  },
  researcher: {
    name: 'Research Agent',
    role: '研究员',
    description:
      '负责执行具体维度的研究任务，包括信息检索、数据分析、关键发现提取。研究员会使用多种数据源获取信息，并进行深度分析。',
    skills: ['信息检索', '数据分析', '关键发现', '趋势识别', '证据收集'],
    tools: ['网络搜索', '学术搜索', '数据分析器', 'PDF解析器'],
    icon: '🔍',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    gradient: 'from-blue-400 to-blue-600',
  },
  reviewer: {
    name: 'Quality Reviewer',
    role: '审核员',
    description:
      '负责审核研究结果的质量、准确性和一致性。审核员会检查数据来源可信度、论据逻辑性，并提出改进建议。',
    skills: ['质量评估', '一致性检查', '准确性验证', '逻辑审核', '改进建议'],
    tools: ['质量评估器', '事实核查器', '一致性分析器'],
    icon: '✅',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    gradient: 'from-green-400 to-green-600',
  },
  synthesizer: {
    name: 'Report Synthesizer',
    role: '撰写员',
    description:
      '负责整合各维度研究结果，撰写专业的研究报告。撰写员会组织内容结构、提炼核心观点、生成可读性强的研究报告。',
    skills: ['内容整合', '报告撰写', '观点提炼', '结构组织', '可视化呈现'],
    tools: ['报告生成器', '摘要提取器', '可视化工具'],
    icon: '📊',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    gradient: 'from-orange-400 to-orange-600',
  },
};

function TeamInteractionTabContent({
  events,
  leaderPlan,
  wsEvents = [],
  wsConnected = false,
  onClearEvents,
}: {
  events: ResearchEvent[];
  leaderPlan?: LeaderPlanDisplay | null;
  wsEvents?: WsEvent[];
  wsConnected?: boolean;
  onClearEvents?: () => void;
}) {
  const safeEvents = events || [];
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  // Agent 类型配置
  const agentConfig: Record<
    ResearchEvent['agentType'],
    { icon: string; label: string; color: string; bgColor: string }
  > = {
    leader: {
      icon: '👑',
      label: 'Leader',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
    },
    researcher: {
      icon: '🔍',
      label: '研究员',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
    },
    reviewer: {
      icon: '✅',
      label: '审核员',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
    },
    synthesizer: {
      icon: '📊',
      label: '撰写员',
      color: 'text-orange-700',
      bgColor: 'bg-orange-100',
    },
  };

  // 事件类型配置
  const eventTypeConfig: Record<
    ResearchEvent['eventType'],
    { icon: string; label: string; color: string }
  > = {
    start: { icon: '▶️', label: '开始', color: 'text-blue-600' },
    progress: { icon: '⏳', label: '进行中', color: 'text-gray-600' },
    complete: { icon: '✅', label: '完成', color: 'text-green-600' },
    error: { icon: '❌', label: '错误', color: 'text-red-600' },
    decision: { icon: '🎯', label: '决策', color: 'text-purple-600' },
  };

  // Render Leader plan section if available
  const renderLeaderPlanSection = () => {
    if (!leaderPlan) return null;

    return (
      <div className="mb-4 space-y-3">
        {/* Task Understanding */}
        {leaderPlan.taskUnderstanding && (
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">👑</span>
              <h4 className="font-medium text-purple-800">Leader 任务理解</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-purple-700">研究主题：</span>
                <span className="text-purple-600">
                  {leaderPlan.taskUnderstanding.topic}
                </span>
              </div>
              <div>
                <span className="font-medium text-purple-700">研究范围：</span>
                <span className="text-purple-600">
                  {leaderPlan.taskUnderstanding.scope}
                </span>
              </div>
              {leaderPlan.taskUnderstanding.objectives &&
                leaderPlan.taskUnderstanding.objectives.length > 0 && (
                  <div>
                    <span className="font-medium text-purple-700">
                      研究目标：
                    </span>
                    <ul className="ml-4 mt-1 list-disc text-purple-600">
                      {leaderPlan.taskUnderstanding.objectives.map(
                        (obj, idx) => (
                          <li key={idx}>{obj}</li>
                        )
                      )}
                    </ul>
                  </div>
                )}
            </div>
          </div>
        )}

        {/* Research Strategy */}
        {leaderPlan.researchStrategy && (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-lg">🎯</span>
              <h4 className="font-medium text-indigo-800">研究策略</h4>
            </div>
            <p className="text-sm text-indigo-600">
              {leaderPlan.researchStrategy}
            </p>
          </div>
        )}

        {/* Agent Assignments */}
        {leaderPlan.agentAssignments &&
          leaderPlan.agentAssignments.length > 0 && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <span className="text-lg">📋</span>
                <h4 className="font-medium text-blue-800">Agent 任务分配</h4>
              </div>
              <div className="space-y-2">
                {leaderPlan.agentAssignments.map((assignment, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 rounded-lg bg-white p-2 text-sm"
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        assignment.agentType === 'researcher'
                          ? 'bg-blue-100 text-blue-600'
                          : assignment.agentType === 'reviewer'
                            ? 'bg-green-100 text-green-600'
                            : 'bg-orange-100 text-orange-600'
                      }`}
                    >
                      {assignment.agentType === 'researcher'
                        ? '🔍'
                        : assignment.agentType === 'reviewer'
                          ? '✅'
                          : '📊'}
                    </span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">
                        {assignment.dimensionName}
                      </span>
                      <span className="mx-2 text-gray-400">→</span>
                      <span className="text-gray-600">{assignment.task}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
      </div>
    );
  };

  // Helper to format WebSocket event for display
  const formatWsEvent = (wsEvent: WsEvent) => {
    const data = wsEvent.data as Record<string, unknown>;
    const eventType = wsEvent.type;

    // Determine icon, color, and agentType based on event type
    let icon = '📋';
    let bgColor = 'bg-blue-100';
    let textColor = 'text-blue-700';
    let label = 'AI 团队';
    let agentType: string | null = null; // For click-to-show-details

    if (eventType.startsWith('leader:')) {
      icon = '👑';
      bgColor = 'bg-purple-100';
      textColor = 'text-purple-700';
      label = 'Leader';
      agentType = 'leader';
    } else if (eventType.startsWith('agent:')) {
      const agentRole = (data.agentRole as string) || '';
      icon =
        agentRole === 'reviewer'
          ? '✅'
          : agentRole === 'synthesizer'
            ? '📊'
            : '🔍';
      bgColor =
        agentRole === 'reviewer'
          ? 'bg-green-100'
          : agentRole === 'synthesizer'
            ? 'bg-orange-100'
            : 'bg-blue-100';
      textColor =
        agentRole === 'reviewer'
          ? 'text-green-700'
          : agentRole === 'synthesizer'
            ? 'text-orange-700'
            : 'text-blue-700';
      label = (data.agentName as string) || 'Agent';
      agentType = agentRole || 'researcher';
    } else if (eventType.startsWith('task:')) {
      icon = '📋';
      bgColor = 'bg-gray-100';
      textColor = 'text-gray-700';
      label = '任务';
    } else if (eventType.startsWith('mission:')) {
      icon = '🎯';
      bgColor = 'bg-green-100';
      textColor = 'text-green-700';
      label = 'Leader';
      agentType = 'leader';
    } else if (eventType.startsWith('dimension:')) {
      icon = '🔍';
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-700';
      label = '研究员';
      agentType = 'researcher';
    } else if (eventType.startsWith('report:')) {
      icon = '📊';
      bgColor = 'bg-orange-100';
      textColor = 'text-orange-700';
      label = '撰写员';
      agentType = 'synthesizer';
    }

    // Extract message from data
    const message =
      (data.message as string) ||
      (data.content as string) ||
      eventType.replace(/:/g, ' ').replace(/_/g, ' ');

    return { icon, bgColor, textColor, label, message, agentType };
  };

  // Show empty state only if no wsEvents and no legacy events
  if (safeEvents.length === 0 && wsEvents.length === 0 && !leaderPlan) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <TeamIcon className="h-10 w-10 text-blue-500" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">等待研究开始</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          研究过程中，AI 团队的协作动态将实时展示在此处
        </p>
        {/* Connection status */}
        <div className="mt-4 flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-gray-300'}`}
          />
          <span className="text-xs text-gray-400">
            {wsConnected ? '实时连接已建立' : '等待连接...'}
          </span>
        </div>
        <div className="mt-6 w-full max-w-md space-y-3">
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">👑</span>
              <div>
                <div className="font-medium text-gray-900">Leader 协调</div>
                <p className="text-xs text-gray-500">
                  分析任务、规划维度、分配研究员
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔍</span>
              <div>
                <div className="font-medium text-gray-900">研究员执行</div>
                <p className="text-xs text-gray-500">
                  搜索资料、分析数据、整理发现
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl">✅</span>
              <div>
                <div className="font-medium text-gray-900">审核与撰写</div>
                <p className="text-xs text-gray-500">
                  质量审核、报告撰写、最终交付
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4">
        {/* Connection status and controls */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${wsConnected ? 'animate-pulse bg-green-500' : 'bg-gray-300'}`}
              />
              <span className="text-xs text-gray-500">
                {wsConnected ? '实时更新中' : '未连接'}
              </span>
            </div>
            {wsEvents.length > 0 && (
              <span className="text-xs text-gray-400">
                {wsEvents.length} 条消息
              </span>
            )}
          </div>
          {wsEvents.length > 0 && onClearEvents && (
            <button
              onClick={onClearEvents}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              清除消息
            </button>
          )}
        </div>

        {/* Leader Plan Section */}
        {renderLeaderPlanSection()}

        {/* WebSocket Events - Real-time messages (AI Writing style) */}
        {wsEvents.length > 0 && (
          <div className="mb-4 space-y-3">
            {wsEvents.map((wsEvent, idx) => {
              const { icon, bgColor, textColor, label, message, agentType } =
                formatWsEvent(wsEvent);
              const time = new Date(wsEvent.timestamp).toLocaleTimeString(
                'zh-CN',
                {
                  hour: '2-digit',
                  minute: '2-digit',
                }
              );

              return (
                <div
                  key={`ws-${idx}`}
                  className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    {/* Clickable Agent Icon */}
                    <button
                      onClick={() => agentType && setSelectedAgent(agentType)}
                      disabled={!agentType}
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${bgColor} ${
                        agentType
                          ? 'cursor-pointer transition-transform hover:scale-110'
                          : 'cursor-default'
                      }`}
                      title={agentType ? '点击查看详情' : undefined}
                    >
                      <span className="text-sm">{icon}</span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {/* Clickable Agent Label */}
                        {agentType ? (
                          <button
                            onClick={() => setSelectedAgent(agentType)}
                            className={`text-sm font-medium ${textColor} hover:underline`}
                          >
                            {label}
                          </button>
                        ) : (
                          <span className={`text-sm font-medium ${textColor}`}>
                            {label}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{time}</span>
                      </div>
                      <p className="mt-1 text-sm text-gray-700">{message}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Legacy Events Header */}
        {safeEvents.length > 0 && (
          <div className="mb-4 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">
              研究过程 ({safeEvents.length} 条记录)
            </h4>
          </div>
        )}

        {/* Legacy 事件时间线 */}
        {safeEvents.length > 0 && (
          <div className="relative">
            <div className="absolute left-4 top-0 h-full w-px bg-gray-200" />

            <div className="space-y-4">
              {safeEvents.map((event) => {
                const agent = agentConfig[event.agentType];
                const eventType = eventTypeConfig[event.eventType];

                return (
                  <div key={event.id} className="relative flex gap-4 pl-10">
                    {/* 时间线节点 - Clickable */}
                    <button
                      onClick={() => setSelectedAgent(event.agentType)}
                      className={`absolute left-1 flex h-7 w-7 items-center justify-center rounded-full text-sm ${agent.bgColor} cursor-pointer transition-transform hover:scale-110`}
                      title="点击查看详情"
                    >
                      {agent.icon}
                    </button>

                    {/* 事件卡片 */}
                    <div
                      className={`flex-1 rounded-lg border p-3 ${
                        event.eventType === 'error'
                          ? 'border-red-200 bg-red-50'
                          : event.eventType === 'complete'
                            ? 'border-green-200 bg-green-50'
                            : event.eventType === 'decision'
                              ? 'border-purple-200 bg-purple-50'
                              : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* Clickable Agent Label */}
                          <button
                            onClick={() => setSelectedAgent(event.agentType)}
                            className={`rounded px-1.5 py-0.5 text-xs font-medium ${agent.bgColor} ${agent.color} hover:opacity-80`}
                            title="点击查看详情"
                          >
                            {event.agentName || agent.label}
                          </button>
                          <span className={`text-xs ${eventType.color}`}>
                            {eventType.icon} {eventType.label}
                          </span>
                          {event.dimensionName && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                              {event.dimensionName}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-gray-400">
                          {new Date(event.timestamp).toLocaleTimeString(
                            'zh-CN',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-gray-700">
                        {event.message}
                      </p>
                      {event.details && (
                        <div className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-500">
                          {event.details}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Agent Details Modal */}
      {selectedAgent && RESEARCH_AGENT_DETAILS[selectedAgent] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="relative mx-4 w-full max-w-md rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br ${RESEARCH_AGENT_DETAILS[selectedAgent].gradient} text-xl text-white shadow-md`}
                >
                  {RESEARCH_AGENT_DETAILS[selectedAgent].icon}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {RESEARCH_AGENT_DETAILS[selectedAgent].name}
                  </h3>
                  <span className="text-sm text-gray-500">
                    {RESEARCH_AGENT_DETAILS[selectedAgent].role}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedAgent(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-4">
              {/* Description */}
              <p className="text-sm leading-relaxed text-gray-600">
                {RESEARCH_AGENT_DETAILS[selectedAgent].description}
              </p>

              {/* Skills */}
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-800">
                  技能
                </h4>
                <div className="flex flex-wrap gap-2">
                  {RESEARCH_AGENT_DETAILS[selectedAgent].skills.map((skill) => (
                    <span
                      key={skill}
                      className={`rounded-full px-3 py-1 text-xs font-medium ${RESEARCH_AGENT_DETAILS[selectedAgent].bgColor} ${RESEARCH_AGENT_DETAILS[selectedAgent].color}`}
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tools */}
              <div className="mt-4">
                <h4 className="mb-2 text-sm font-semibold text-gray-800">
                  工具
                </h4>
                <div className="flex flex-wrap gap-2">
                  {RESEARCH_AGENT_DETAILS[selectedAgent].tools.map((tool) => (
                    <span
                      key={tool}
                      className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700"
                    >
                      {tool}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-gray-100 px-6 py-4">
              <button
                onClick={() => setSelectedAgent(null)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==================== Agent 思考架构 Tab ====================
function AgentThinkingTabContent({
  thinkings,
}: {
  thinkings: AgentThinking[];
}) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const safeThinkings = thinkings || [];

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Agent 类型配置
  const agentConfig: Record<
    AgentThinking['agentType'],
    {
      icon: string;
      label: string;
      color: string;
      bgColor: string;
      borderColor: string;
    }
  > = {
    leader: {
      icon: '👑',
      label: 'Leader',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
    },
    researcher: {
      icon: '🔍',
      label: '研究员',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
    },
    reviewer: {
      icon: '✅',
      label: '审核员',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
    },
    synthesizer: {
      icon: '📊',
      label: '撰写员',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
    },
  };

  if (safeThinkings.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-purple-100">
          <ThinkingIcon className="h-10 w-10 text-purple-500" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">
          Agent 思考架构
        </h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          研究过程中，各 Agent 的推理链路、决策依据和思考过程将在此展示
        </p>
        <div className="mt-6 w-full max-w-md space-y-3">
          <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
              <span>👑</span> Leader 决策链
            </div>
            <p className="mt-2 text-xs text-purple-600">
              任务理解 → 维度规划 → Agent 分配 → 质量审核 → 报告整合
            </p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-700">
              <span>🔍</span> 研究员推理链
            </div>
            <p className="mt-2 text-xs text-blue-600">
              信息检索 → 数据分析 → 关键发现 → 结论推导
            </p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <span>✅</span> 审核反馈链
            </div>
            <p className="mt-2 text-xs text-green-600">
              质量评估 → 一致性检查 → 改进建议 → 通过/拒绝决定
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 按 Agent 分组
  const groupedByAgent = safeThinkings.reduce(
    (acc, t) => {
      const key = t.agentName || t.agentType;
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    },
    {} as Record<string, AgentThinking[]>
  );

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-4">
        {Object.entries(groupedByAgent).map(([agentKey, thinkingList]) => {
          const firstThinking = thinkingList[0];
          const config = agentConfig[firstThinking.agentType];

          return (
            <div
              key={agentKey}
              className={`rounded-lg border ${config.borderColor} ${config.bgColor}`}
            >
              {/* Agent 头部 */}
              <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3">
                <span className="text-lg">{config.icon}</span>
                <span className={`font-medium ${config.color}`}>
                  {agentKey}
                </span>
                <span className="text-xs text-gray-500">
                  ({thinkingList.length} 条思考记录)
                </span>
              </div>

              {/* 思考列表 */}
              <div className="divide-y divide-gray-100">
                {thinkingList.map((thinking) => {
                  const isExpanded = expandedIds.has(thinking.id);

                  return (
                    <div key={thinking.id} className="p-3">
                      <button
                        onClick={() => toggleExpand(thinking.id)}
                        className="flex w-full items-center justify-between text-left"
                      >
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-white px-2 py-0.5 text-xs font-medium text-gray-600">
                            {thinking.phase}
                          </span>
                          <span className="line-clamp-1 text-sm text-gray-700">
                            {thinking.thinking.slice(0, 100)}...
                          </span>
                        </div>
                        <ChevronDownIcon
                          className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>

                      {isExpanded && (
                        <div className="mt-3 space-y-3 rounded-lg bg-white p-3">
                          <div>
                            <div className="mb-1 text-xs font-medium text-gray-500">
                              思考过程
                            </div>
                            <p className="whitespace-pre-wrap text-sm text-gray-700">
                              {thinking.thinking}
                            </p>
                          </div>
                          {thinking.reasoning && (
                            <div>
                              <div className="mb-1 text-xs font-medium text-gray-500">
                                推理依据
                              </div>
                              <p className="whitespace-pre-wrap text-sm text-gray-600">
                                {thinking.reasoning}
                              </p>
                            </div>
                          )}
                          {thinking.decision && (
                            <div>
                              <div className="mb-1 text-xs font-medium text-gray-500">
                                决策结果
                              </div>
                              <p className="whitespace-pre-wrap text-sm font-medium text-gray-800">
                                {thinking.decision}
                              </p>
                            </div>
                          )}
                          <div className="text-right text-xs text-gray-400">
                            {new Date(thinking.timestamp).toLocaleString(
                              'zh-CN'
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==================== 证据来源 Tab ====================
function EvidenceTabContent({
  evidence,
  isLoading,
}: {
  evidence: TopicEvidence[];
  isLoading: boolean;
}) {
  const safeEvidence = evidence || [];
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>(
    'all'
  );
  const [sortBy, setSortBy] = useState<'credibility' | 'date'>('credibility');

  // 筛选和排序
  const filteredEvidence = useMemo(() => {
    let result = [...safeEvidence];

    if (filter !== 'all') {
      result = result.filter((e) => {
        const score = e.credibilityScore || 0;
        if (filter === 'high') return score >= 70;
        if (filter === 'medium') return score >= 40 && score < 70;
        if (filter === 'low') return score < 40;
        return true;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'credibility') {
        return (b.credibilityScore || 0) - (a.credibilityScore || 0);
      }
      const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return dateB - dateA;
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

// ==================== @Leader Input Section ====================
interface LeaderInputSectionProps {
  onSendInstruction: (instruction: string) => void;
  isRefreshing: boolean;
}

function LeaderInputSection({
  onSendInstruction,
  isRefreshing,
}: LeaderInputSectionProps) {
  const [userInput, setUserInput] = useState('');
  const [showLeaderMenu, setShowLeaderMenu] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Handle input change and detect @Leader mention
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setUserInput(value);

    // Detect @ trigger
    const cursorPos = e.target.selectionStart || 0;
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);

    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      if (query === '' || 'leader'.startsWith(query)) {
        setShowLeaderMenu(true);
      } else {
        setShowLeaderMenu(false);
      }
    } else {
      setShowLeaderMenu(false);
    }
  };

  // Select @Leader
  const handleSelectLeader = () => {
    const cursorPos = inputRef.current?.selectionStart || userInput.length;
    const textBeforeCursor = userInput.slice(0, cursorPos);
    const textAfterCursor = userInput.slice(cursorPos);

    const newTextBefore = textBeforeCursor.replace(/@\w*$/, '@Leader ');
    const newText = newTextBefore + textAfterCursor;
    const newCursorPos = newTextBefore.length;

    setUserInput(newText);
    setShowLeaderMenu(false);

    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  // Send instruction
  const handleSendInstruction = () => {
    if (!userInput.trim()) return;

    // Clean @Leader from the instruction
    const cleanInstruction = userInput.replace(/@Leader\s*/gi, '').trim();
    if (cleanInstruction) {
      onSendInstruction(cleanInstruction);
      setUserInput('');
    }
  };

  // Handle key press (Enter to send)
  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendInstruction();
    }
  };

  return (
    <div className="relative border-t border-gray-200 bg-gray-50 p-3">
      {/* @Leader Dropdown */}
      {showLeaderMenu && (
        <div className="absolute bottom-full left-3 right-3 z-50 mb-2 rounded-lg border border-gray-200 bg-white py-2 shadow-lg">
          <div className="px-3 py-1 text-xs font-medium text-gray-400">
            提及 Leader
          </div>
          <button
            onClick={handleSelectLeader}
            className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-gray-50"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-purple-400 to-purple-600 text-xs text-white">
              👑
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800">@Leader</div>
              <div className="text-xs text-gray-400">
                研究协调员 · 调整研究方向和内容
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="flex gap-2">
        <textarea
          ref={inputRef}
          value={userInput}
          onChange={handleInputChange}
          onKeyDown={handleKeyPress}
          onBlur={() => {
            setTimeout(() => setShowLeaderMenu(false), 200);
          }}
          placeholder="输入 @Leader 让协调员编辑调整内容..."
          rows={2}
          className="flex-1 resize-none rounded-lg border border-gray-200 bg-white p-2.5 text-sm placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-100"
          disabled={isRefreshing}
        />
        <button
          onClick={handleSendInstruction}
          disabled={!userInput.trim() || isRefreshing}
          className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
      <p className="mt-1.5 text-xs text-gray-400">
        输入 @ 可提及 Leader，Enter 发送，Shift+Enter 换行
      </p>
    </div>
  );
}
