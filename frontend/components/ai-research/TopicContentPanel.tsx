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

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type {
  TopicReport,
  TopicDimension,
  TopicEvidence,
} from '@/types/topic-research';
import type { MissionStatus } from '@/lib/api/topic-research';

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

// ★ AI Writing 模式：消息详情类型（用于展开预览）
interface MessageDetail {
  type:
    | 'dimension_content'
    | 'report_preview'
    | 'leader_plan'
    | 'agent_analysis'
    | 'text';
  data: string | Record<string, unknown>;
}

// ★ AI Writing 模式：转换后的 UI 消息
interface UIMessage {
  id: string;
  type: 'system' | 'agent' | 'progress' | 'leader';
  agent?: string;
  agentIcon?: string;
  agentColor?: string;
  agentBgColor?: string;
  agentType?: string; // for click-to-show-details
  content: string;
  timestamp: Date;
  detail?: MessageDetail; // ★ 可展开的详情
  progress?: number; // 0-100 进度
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
  /** Mission status from backend */
  missionStatus?: MissionStatus | null;
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
  missionStatus,
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
            evidence={safeEvidence}
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
          <AgentThinkingTabContent
            thinkings={safeThinkings}
            missionStatus={missionStatus}
            wsEvents={wsEvents}
          />
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

// ==================== 内联引用 Tooltip 组件 ====================
// 参考 Fast Research 的引用呈现方式
interface CitationTooltipProps {
  citationId: string;
  citationIndex: number;
  evidence: TopicEvidence | null;
}

function CitationTooltip({ citationIndex, evidence }: CitationTooltipProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Citation badge */}
      <sup className="cursor-pointer rounded bg-purple-100 px-1 py-0.5 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-200">
        [{citationIndex}]
      </sup>

      {/* Tooltip */}
      {isHovered && evidence && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          {/* Arrow */}
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 border-8 border-transparent border-t-white" />
          <div className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 border-8 border-transparent border-t-gray-200" />

          {/* Content */}
          <div className="flex items-start gap-2">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
              {citationIndex}
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="line-clamp-2 text-sm font-medium text-gray-900">
                {evidence.title || '未知来源'}
              </h4>
              {evidence.snippet && (
                <p className="mt-1 line-clamp-3 text-xs text-gray-600">
                  {evidence.snippet}
                </p>
              )}
              {evidence.url && (
                <a
                  href={evidence.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                    />
                  </svg>
                  点击查看原文
                </a>
              )}
              {evidence.domain && (
                <span className="mt-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                  {evidence.domain}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

/**
 * 将字符串内容中的引用标记替换为可交互的组件
 * 支持格式: [1], [2], [temp-1-1], [temp-2-3] 等
 */
function renderTextWithCitations(
  text: string,
  evidence: TopicEvidence[],
  keyPrefix: string = ''
): React.ReactNode[] {
  // 匹配 [数字] 或 [temp-数字-数字] 格式
  const citationPattern = /\[(\d+)\]|\[(temp-\d+-\d+)\]/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  // 建立引用索引到证据的映射
  const evidenceMap = new Map<
    string,
    { index: number; evidence: TopicEvidence }
  >();
  evidence.forEach((e, idx) => {
    // 按顺序映射：第一个证据对应 [1]，第二个对应 [2]
    evidenceMap.set(String(idx + 1), { index: idx + 1, evidence: e });
    // 同时支持 temp-x-y 格式映射到证据 ID
    evidenceMap.set(e.id, { index: idx + 1, evidence: e });
  });

  while ((match = citationPattern.exec(text)) !== null) {
    // 添加引用前的文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // 获取引用标识符
    const citationRef = match[1] || match[2];
    const evidenceData = evidenceMap.get(citationRef);

    if (evidenceData) {
      parts.push(
        <CitationTooltip
          key={`${keyPrefix}citation-${match.index}`}
          citationId={citationRef}
          citationIndex={evidenceData.index}
          evidence={evidenceData.evidence}
        />
      );
    } else {
      // 未找到对应证据，保留原始文本但添加样式
      parts.push(
        <sup
          key={`${keyPrefix}citation-unknown-${match.index}`}
          className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500"
        >
          [{citationRef}]
        </sup>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // 添加剩余文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/**
 * 处理 React children，将其中的字符串内容替换为带引用的组件
 */
function processChildrenWithCitations(
  children: React.ReactNode,
  evidence: TopicEvidence[]
): React.ReactNode {
  if (!children) return children;

  // 如果是字符串，处理引用
  if (typeof children === 'string') {
    const parts = renderTextWithCitations(children, evidence);
    return parts.length === 1 ? parts[0] : <>{parts}</>;
  }

  // 如果是数组，递归处理每个元素
  if (Array.isArray(children)) {
    return children.map((child, idx) => {
      if (typeof child === 'string') {
        const parts = renderTextWithCitations(child, evidence, `arr-${idx}-`);
        return parts.length === 1 ? parts[0] : <span key={idx}>{parts}</span>;
      }
      return child;
    });
  }

  // 其他情况直接返回
  return children;
}

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
  evidence,
  isLoading,
}: {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  evidence: TopicEvidence[];
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
              <ReactMarkdown
                components={{
                  // 自定义段落渲染，支持内联引用
                  p: ({ children }) => (
                    <p>{processChildrenWithCitations(children, evidence)}</p>
                  ),
                  // 自定义列表项渲染
                  li: ({ children }) => (
                    <li>{processChildrenWithCitations(children, evidence)}</li>
                  ),
                }}
              >
                {selectedContent.content || ''}
              </ReactMarkdown>
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
  // ★ AI Writing 模式：展开的消息ID集合
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    new Set()
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ★ 切换消息展开状态
  const toggleMessageExpand = useCallback((msgId: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
      } else {
        next.add(msgId);
      }
      return next;
    });
  }, []);

  // ★ AI Writing 模式：将 WebSocket 事件转换为 UI 消息（带详情）
  const uiMessages = useMemo<UIMessage[]>(() => {
    return wsEvents.map((wsEvent, idx) => {
      const data = wsEvent.data as Record<string, unknown>;
      const eventType = wsEvent.type;
      const msgId = `ws-${idx}-${wsEvent.timestamp}`;

      let agent = 'AI 团队';
      let agentIcon = '📋';
      let agentColor = 'text-blue-700';
      let agentBgColor = 'bg-blue-100';
      let agentType: string | undefined;
      let msgType: UIMessage['type'] = 'system';
      let content = '';
      let detail: MessageDetail | undefined;
      let progress: number | undefined;

      // 根据事件类型解析
      if (eventType.startsWith('leader:')) {
        agent = 'Leader';
        agentIcon = '👑';
        agentColor = 'text-purple-700';
        agentBgColor = 'bg-purple-100';
        agentType = 'leader';
        msgType = 'leader';

        if (eventType === 'leader:thinking') {
          const phase = (data.phase as string) || '';
          const thinking = (data.content as string) || '';
          progress = (data.progress as number) || 0;
          content = `[${phase}] ${thinking}`;
          // ★ 添加思考详情
          if (thinking.length > 100) {
            detail = { type: 'text', data: thinking };
          }
        } else if (eventType === 'leader:planning') {
          content = (data.message as string) || 'Leader 正在规划研究维度...';
        } else if (eventType === 'leader:plan_ready') {
          const plan = data.plan as Record<string, unknown>;
          content = `Leader 规划完成：${(plan?.dimensions as unknown[])?.length || 0} 个研究维度`;
          // ★ 添加规划详情
          if (plan) {
            detail = { type: 'leader_plan', data: plan };
          }
        } else {
          content =
            (data.message as string) || (data.content as string) || eventType;
        }
      } else if (eventType.startsWith('agent:')) {
        const role = (data.agentRole as string) || 'researcher';
        agent = (data.agentName as string) || 'Agent';
        agentType = role;
        msgType = 'agent';

        if (role === 'reviewer') {
          agentIcon = '✅';
          agentColor = 'text-green-700';
          agentBgColor = 'bg-green-100';
        } else if (role === 'synthesizer') {
          agentIcon = '📊';
          agentColor = 'text-orange-700';
          agentBgColor = 'bg-orange-100';
        } else {
          agentIcon = '🔍';
          agentColor = 'text-blue-700';
          agentBgColor = 'bg-blue-100';
        }

        content =
          (data.message as string) ||
          (data.status as string) ||
          `${agent} 工作中`;
      } else if (eventType.startsWith('task:')) {
        agentIcon = '📋';
        agentBgColor = 'bg-gray-100';
        agentColor = 'text-gray-700';
        msgType = 'progress';
        progress = (data.progress as number) || 0;
        content = (data.message as string) || `任务 ${eventType.split(':')[1]}`;
      } else if (eventType.startsWith('dimension:')) {
        agent = '研究员';
        agentIcon = '🔍';
        agentColor = 'text-blue-700';
        agentBgColor = 'bg-blue-100';
        agentType = 'researcher';
        msgType = 'agent';

        const dimName = (data.dimensionName as string) || '';
        if (eventType === 'dimension:research_started') {
          content = `开始研究维度「${dimName}」`;
        } else if (eventType === 'dimension:research_progress') {
          progress = (data.progress as number) || 0;
          content = `「${dimName}」研究进度 ${progress}%`;
        } else if (eventType === 'dimension:research_completed') {
          content = `「${dimName}」研究完成`;
          // ★ 添加研究结果预览
          const summary = (data.summary as string) || '';
          const keyFindings = (data.keyFindings as string[]) || [];
          if (summary || keyFindings.length > 0) {
            detail = {
              type: 'dimension_content',
              data: { summary, keyFindings, dimensionName: dimName },
            };
          }
        } else {
          content = (data.message as string) || eventType;
        }
      } else if (eventType.startsWith('report:')) {
        agent = '撰写员';
        agentIcon = '📊';
        agentColor = 'text-orange-700';
        agentBgColor = 'bg-orange-100';
        agentType = 'synthesizer';
        msgType = 'agent';

        if (eventType === 'report:synthesis_started') {
          content = '开始撰写研究报告...';
        } else if (eventType === 'report:synthesis_completed') {
          content = '研究报告撰写完成';
          // ★ 添加报告预览
          const reportTitle = (data.title as string) || '';
          const summary = (data.summary as string) || '';
          if (reportTitle || summary) {
            detail = {
              type: 'report_preview',
              data: { title: reportTitle, summary },
            };
          }
        } else {
          content = (data.message as string) || eventType;
        }
      } else if (eventType.startsWith('mission:')) {
        agent = 'Leader';
        agentIcon = '🎯';
        agentColor = 'text-green-700';
        agentBgColor = 'bg-green-100';
        agentType = 'leader';
        msgType = 'system';
        progress = data.progress as number;
        content = (data.message as string) || `任务 ${eventType.split(':')[1]}`;
      } else {
        content =
          (data.message as string) ||
          (data.content as string) ||
          eventType.replace(/:/g, ' ');
      }

      return {
        id: msgId,
        type: msgType,
        agent,
        agentIcon,
        agentColor,
        agentBgColor,
        agentType,
        content,
        timestamp: new Date(wsEvent.timestamp),
        detail,
        progress,
      };
    });
  }, [wsEvents]);

  // ★ 自动滚动到底部
  useEffect(() => {
    if (uiMessages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [uiMessages.length]);

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

  // Show empty state only if no uiMessages and no legacy events
  if (safeEvents.length === 0 && uiMessages.length === 0 && !leaderPlan) {
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
            {uiMessages.length > 0 && (
              <span className="text-xs text-gray-400">
                {uiMessages.length} 条消息
              </span>
            )}
          </div>
          {uiMessages.length > 0 && onClearEvents && (
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

        {/* ★ AI Writing 风格：WebSocket 事件消息流（带详情展开） */}
        {uiMessages.length > 0 && (
          <div className="mb-4 space-y-3">
            {uiMessages.map((msg) => {
              const isExpanded = expandedMessages.has(msg.id);
              const time = msg.timestamp.toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={msg.id}
                  className={`rounded-lg border shadow-sm transition-all ${
                    msg.type === 'leader'
                      ? 'border-purple-200 bg-purple-50'
                      : msg.type === 'progress'
                        ? 'border-amber-200 bg-amber-50'
                        : 'border-gray-200 bg-white'
                  }`}
                >
                  <div className="p-3">
                    <div className="flex items-start gap-3">
                      {/* Agent Icon - 可点击查看详情 */}
                      <button
                        onClick={() =>
                          msg.agentType && setSelectedAgent(msg.agentType)
                        }
                        disabled={!msg.agentType}
                        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${msg.agentBgColor} ${
                          msg.agentType
                            ? 'cursor-pointer transition-transform hover:scale-110'
                            : 'cursor-default'
                        }`}
                        title={
                          msg.agentType ? '点击查看 Agent 详情' : undefined
                        }
                      >
                        <span className="text-sm">{msg.agentIcon}</span>
                      </button>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {msg.agentType ? (
                            <button
                              onClick={() => setSelectedAgent(msg.agentType!)}
                              className={`text-sm font-medium ${msg.agentColor} hover:underline`}
                            >
                              {msg.agent}
                            </button>
                          ) : (
                            <span
                              className={`text-sm font-medium ${msg.agentColor}`}
                            >
                              {msg.agent}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">{time}</span>
                          {/* 进度指示器 */}
                          {msg.progress !== undefined && msg.progress > 0 && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-600">
                              {msg.progress}%
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-700">
                          {msg.content}
                        </p>

                        {/* ★ 进度条（如果有进度） */}
                        {msg.progress !== undefined && msg.progress > 0 && (
                          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all duration-300"
                              style={{ width: `${msg.progress}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* ★ 详情展开按钮 */}
                      {msg.detail && (
                        <button
                          onClick={() => toggleMessageExpand(msg.id)}
                          className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title={isExpanded ? '收起详情' : '展开详情'}
                        >
                          <svg
                            className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                      )}
                    </div>
                  </div>

                  {/* ★ 可展开的详情内容（AI Writing 核心模式） */}
                  {msg.detail && isExpanded && (
                    <div className="border-t border-gray-100 bg-gray-50 p-3">
                      {msg.detail.type === 'dimension_content' && (
                        <DimensionContentPreview
                          data={msg.detail.data as Record<string, unknown>}
                        />
                      )}
                      {msg.detail.type === 'report_preview' && (
                        <ReportPreview
                          data={msg.detail.data as Record<string, unknown>}
                        />
                      )}
                      {msg.detail.type === 'leader_plan' && (
                        <LeaderPlanPreview
                          data={msg.detail.data as Record<string, unknown>}
                        />
                      )}
                      {msg.detail.type === 'text' && (
                        <div className="whitespace-pre-wrap text-sm text-gray-600">
                          {msg.detail.data as string}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {/* 滚动锚点 */}
            <div ref={messagesEndRef} />
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
  missionStatus,
  wsEvents = [],
}: {
  thinkings: AgentThinking[];
  missionStatus?: MissionStatus | null;
  wsEvents?: WsEvent[];
}) {
  // 折叠状态：按 Agent 类型折叠
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(
    new Set()
  );
  // 展开状态：单条记录详情
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const safeThinkings = thinkings || [];

  const toggleAgentCollapse = (agentType: string) => {
    setCollapsedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentType)) {
        next.delete(agentType);
      } else {
        next.add(agentType);
      }
      return next;
    });
  };

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

  // 从 missionStatus 中提取 Leader 理解意图
  const leaderPlan = missionStatus?.leaderPlan;

  // 从 WebSocket 事件中提取所有 Agent 的活动
  const agentActivities = useMemo(() => {
    type AgentActivity = {
      id: string;
      agentType: 'leader' | 'researcher' | 'reviewer' | 'synthesizer';
      eventType: string;
      phase?: string;
      content: string;
      progress?: number;
      dimensionName?: string;
      agentName?: string;
      timestamp: Date;
    };

    const activities: AgentActivity[] = [];

    wsEvents.forEach((e, idx) => {
      const data = e.data as Record<string, unknown>;

      // Leader 事件
      if (e.type === 'leader:thinking') {
        activities.push({
          id: `leader-thinking-${idx}`,
          agentType: 'leader',
          eventType: 'thinking',
          phase: (data.phase as string) || 'thinking',
          content: (data.content as string) || '',
          progress: data.progress as number,
          timestamp: new Date(e.timestamp),
        });
      } else if (e.type === 'leader:planning') {
        activities.push({
          id: `leader-planning-${idx}`,
          agentType: 'leader',
          eventType: 'planning',
          phase: 'planning',
          content: (data.message as string) || '正在规划研究任务...',
          progress: data.progress as number,
          timestamp: new Date(e.timestamp),
        });
      }
      // 研究员事件
      else if (e.type === 'dimension:research_started') {
        activities.push({
          id: `researcher-start-${idx}`,
          agentType: 'researcher',
          eventType: 'start',
          phase: 'researching',
          content: `开始研究: ${data.dimensionName || '维度研究'}`,
          dimensionName: data.dimensionName as string,
          agentName: data.agentName as string,
          timestamp: new Date(e.timestamp),
        });
      } else if (e.type === 'dimension:research_progress') {
        activities.push({
          id: `researcher-progress-${idx}`,
          agentType: 'researcher',
          eventType: 'progress',
          phase: (data.phase as string) || 'researching',
          content: (data.message as string) || '研究进行中...',
          progress: data.progress as number,
          dimensionName: data.dimensionName as string,
          agentName: data.agentName as string,
          timestamp: new Date(e.timestamp),
        });
      } else if (e.type === 'dimension:research_completed') {
        activities.push({
          id: `researcher-complete-${idx}`,
          agentType: 'researcher',
          eventType: 'complete',
          phase: 'completed',
          content: `完成研究: ${data.dimensionName || '维度研究'}`,
          dimensionName: data.dimensionName as string,
          agentName: data.agentName as string,
          timestamp: new Date(e.timestamp),
        });
      }
      // Agent 工作事件
      else if (e.type === 'agent:working') {
        const role = (data.agentRole as string) || 'researcher';
        activities.push({
          id: `agent-working-${idx}`,
          agentType: role as AgentActivity['agentType'],
          eventType: 'working',
          phase: 'working',
          content:
            (data.taskDescription as string) ||
            `${data.agentName || 'Agent'} 正在工作...`,
          progress: data.progress as number,
          dimensionName: data.dimensionName as string,
          agentName: data.agentName as string,
          timestamp: new Date(e.timestamp),
        });
      }
      // 报告撰写事件
      else if (e.type === 'report:synthesis_started') {
        activities.push({
          id: `synthesizer-start-${idx}`,
          agentType: 'synthesizer',
          eventType: 'start',
          phase: 'synthesizing',
          content: '开始撰写研究报告...',
          timestamp: new Date(e.timestamp),
        });
      } else if (e.type === 'report:synthesis_progress') {
        activities.push({
          id: `synthesizer-progress-${idx}`,
          agentType: 'synthesizer',
          eventType: 'progress',
          phase: (data.phase as string) || 'synthesizing',
          content: (data.message as string) || '报告撰写中...',
          progress: data.progress as number,
          timestamp: new Date(e.timestamp),
        });
      } else if (e.type === 'report:synthesis_completed') {
        activities.push({
          id: `synthesizer-complete-${idx}`,
          agentType: 'synthesizer',
          eventType: 'complete',
          phase: 'completed',
          content: '研究报告撰写完成',
          timestamp: new Date(e.timestamp),
        });
      }
      // 任务事件
      else if (e.type === 'task:progress') {
        const taskType = data.taskType as string;
        let agentType: AgentActivity['agentType'] = 'researcher';
        if (taskType === 'quality_review') agentType = 'reviewer';
        else if (taskType === 'report_synthesis') agentType = 'synthesizer';

        activities.push({
          id: `task-progress-${idx}`,
          agentType,
          eventType: 'progress',
          phase: (data.status as string) || 'executing',
          content:
            (data.message as string) || (data.title as string) || '任务执行中',
          progress: data.progress as number,
          dimensionName: data.dimensionName as string,
          timestamp: new Date(e.timestamp),
        });
      }
    });

    return activities;
  }, [wsEvents]);

  // 按 Agent 类型分组活动
  const activitiesByAgent = useMemo(() => {
    const grouped: Record<string, typeof agentActivities> = {
      leader: [],
      researcher: [],
      reviewer: [],
      synthesizer: [],
    };

    agentActivities.forEach((activity) => {
      grouped[activity.agentType].push(activity);
    });

    return grouped;
  }, [agentActivities]);

  // Agent 类型配置
  const agentConfig: Record<
    string,
    {
      icon: string;
      label: string;
      color: string;
      bgColor: string;
      borderColor: string;
      headerBg: string;
    }
  > = {
    leader: {
      icon: '👑',
      label: 'Leader 决策',
      color: 'text-purple-700',
      bgColor: 'bg-purple-50',
      borderColor: 'border-purple-200',
      headerBg: 'bg-purple-100',
    },
    researcher: {
      icon: '🔍',
      label: '研究员',
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      headerBg: 'bg-blue-100',
    },
    reviewer: {
      icon: '✅',
      label: '审核员',
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      headerBg: 'bg-green-100',
    },
    synthesizer: {
      icon: '📝',
      label: '撰写员',
      color: 'text-orange-700',
      bgColor: 'bg-orange-50',
      borderColor: 'border-orange-200',
      headerBg: 'bg-orange-100',
    },
  };

  // 判断是否有实际内容
  const hasContent =
    safeThinkings.length > 0 ||
    agentActivities.length > 0 ||
    leaderPlan?.taskUnderstanding;

  if (!hasContent) {
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

  // 有内容时 - 按 Agent 分组显示，支持折叠
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="space-y-3">
        {/* ==================== Leader 区块（可折叠）==================== */}
        {(leaderPlan?.taskUnderstanding ||
          activitiesByAgent.leader.length > 0) && (
          <AgentSection
            agentType="leader"
            config={agentConfig.leader}
            isCollapsed={collapsedAgents.has('leader')}
            onToggle={() => toggleAgentCollapse('leader')}
            itemCount={
              (leaderPlan?.taskUnderstanding ? 1 : 0) +
              activitiesByAgent.leader.length
            }
          >
            {/* Leader 任务理解 */}
            {leaderPlan?.taskUnderstanding && (
              <div className="rounded-lg bg-white p-4 shadow-sm">
                <div className="mb-3 text-sm font-semibold text-purple-700">
                  🎯 任务理解
                </div>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-gray-500">主题:</span>{' '}
                    {leaderPlan.taskUnderstanding.topic}
                  </p>
                  <p>
                    <span className="text-gray-500">范围:</span>{' '}
                    {leaderPlan.taskUnderstanding.scope}
                  </p>
                  {leaderPlan.taskUnderstanding.objectives?.length > 0 && (
                    <div>
                      <span className="text-gray-500">目标:</span>
                      <ul className="mt-1 list-inside list-disc text-gray-700">
                        {leaderPlan.taskUnderstanding.objectives.map(
                          (obj, i) => (
                            <li key={i}>{obj}</li>
                          )
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 执行策略 */}
            {leaderPlan?.executionStrategy && (
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <div className="mb-2 text-sm font-semibold text-purple-700">
                  🧭 执行策略
                </div>
                <div className="space-y-1 text-xs text-gray-600">
                  <p>并行度: {leaderPlan.executionStrategy.parallelism}</p>
                  {leaderPlan.executionStrategy.estimatedTime && (
                    <p>预计: {leaderPlan.executionStrategy.estimatedTime}</p>
                  )}
                </div>
              </div>
            )}

            {/* 维度规划 */}
            {leaderPlan?.dimensions && leaderPlan.dimensions.length > 0 && (
              <div className="rounded-lg bg-white p-3 shadow-sm">
                <div className="mb-2 text-sm font-semibold text-purple-700">
                  📋 研究维度 ({leaderPlan.dimensions.length})
                </div>
                <div className="space-y-1">
                  {leaderPlan.dimensions.map((dim, idx) => (
                    <div
                      key={dim.id || idx}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                        {idx + 1}
                      </span>
                      <span className="text-gray-700">{dim.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Agent 分配 */}
            {leaderPlan?.agentAssignments &&
              leaderPlan.agentAssignments.length > 0 && (
                <div className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="mb-2 text-sm font-semibold text-purple-700">
                    👥 Agent 分配
                  </div>
                  <div className="space-y-1">
                    {leaderPlan.agentAssignments.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-xs"
                      >
                        <span>
                          {a.agentType === 'dimension_researcher'
                            ? '🔍'
                            : a.agentType === 'quality_reviewer'
                              ? '✅'
                              : '📝'}
                        </span>
                        <span className="text-gray-700">{a.role}</span>
                        {a.assignedDimensions &&
                          a.assignedDimensions.length > 0 && (
                            <span className="text-gray-400">
                              → {a.assignedDimensions.join(', ')}
                            </span>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Leader 思考活动 */}
            {activitiesByAgent.leader.length > 0 && (
              <div className="space-y-1">
                {activitiesByAgent.leader.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </AgentSection>
        )}

        {/* ==================== 研究员区块（可折叠）==================== */}
        {activitiesByAgent.researcher.length > 0 && (
          <AgentSection
            agentType="researcher"
            config={agentConfig.researcher}
            isCollapsed={collapsedAgents.has('researcher')}
            onToggle={() => toggleAgentCollapse('researcher')}
            itemCount={activitiesByAgent.researcher.length}
          >
            <div className="space-y-1">
              {activitiesByAgent.researcher.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </AgentSection>
        )}

        {/* ==================== 审核员区块（可折叠）==================== */}
        {activitiesByAgent.reviewer.length > 0 && (
          <AgentSection
            agentType="reviewer"
            config={agentConfig.reviewer}
            isCollapsed={collapsedAgents.has('reviewer')}
            onToggle={() => toggleAgentCollapse('reviewer')}
            itemCount={activitiesByAgent.reviewer.length}
          >
            <div className="space-y-1">
              {activitiesByAgent.reviewer.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </AgentSection>
        )}

        {/* ==================== 撰写员区块（可折叠）==================== */}
        {activitiesByAgent.synthesizer.length > 0 && (
          <AgentSection
            agentType="synthesizer"
            config={agentConfig.synthesizer}
            isCollapsed={collapsedAgents.has('synthesizer')}
            onToggle={() => toggleAgentCollapse('synthesizer')}
            itemCount={activitiesByAgent.synthesizer.length}
          >
            <div className="space-y-1">
              {activitiesByAgent.synthesizer.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </AgentSection>
        )}

        {/* 原有的 Agent 思考记录（兼容旧数据） */}
        {safeThinkings.length > 0 &&
          Object.entries(
            safeThinkings.reduce(
              (acc, t) => {
                const key = t.agentType;
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
              },
              {} as Record<string, AgentThinking[]>
            )
          ).map(([agentType, thinkingList]) => {
            const config = agentConfig[agentType] || agentConfig.researcher;
            const isCollapsed = collapsedAgents.has(`thinking-${agentType}`);

            return (
              <div
                key={`thinking-${agentType}`}
                className={`overflow-hidden rounded-lg border ${config.borderColor}`}
              >
                <button
                  onClick={() => toggleAgentCollapse(`thinking-${agentType}`)}
                  className={`flex w-full items-center justify-between px-4 py-3 ${config.headerBg}`}
                >
                  <div className="flex items-center gap-2">
                    <span>{config.icon}</span>
                    <span className={`font-medium ${config.color}`}>
                      {config.label} 思考记录
                    </span>
                    <span className="text-xs text-gray-500">
                      ({thinkingList.length})
                    </span>
                  </div>
                  <ChevronDownIcon
                    className={`h-4 w-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                  />
                </button>

                {!isCollapsed && (
                  <div className={`divide-y divide-gray-100 ${config.bgColor}`}>
                    {thinkingList.map((thinking) => {
                      const isExpanded = expandedIds.has(thinking.id);
                      return (
                        <div key={thinking.id} className="p-3">
                          <button
                            onClick={() => toggleExpand(thinking.id)}
                            className="flex w-full items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-2">
                              <span className="rounded bg-white px-2 py-0.5 text-xs text-gray-600">
                                {thinking.phase}
                              </span>
                              <span className="line-clamp-1 text-sm text-gray-700">
                                {thinking.thinking.slice(0, 80)}...
                              </span>
                            </div>
                            <ChevronDownIcon
                              className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                            />
                          </button>
                          {isExpanded && (
                            <div className="mt-2 rounded-lg bg-white p-3 text-sm">
                              <p className="whitespace-pre-wrap text-gray-700">
                                {thinking.thinking}
                              </p>
                              {thinking.decision && (
                                <p className="mt-2 font-medium text-gray-800">
                                  决策: {thinking.decision}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// Agent 区块组件（可折叠）
function AgentSection({
  agentType,
  config,
  isCollapsed,
  onToggle,
  itemCount,
  children,
}: {
  agentType: string;
  config: {
    icon: string;
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
    headerBg: string;
  };
  isCollapsed: boolean;
  onToggle: () => void;
  itemCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className={`overflow-hidden rounded-lg border ${config.borderColor}`}>
      <button
        onClick={onToggle}
        className={`flex w-full items-center justify-between px-4 py-3 ${config.headerBg} hover:opacity-90`}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <span className={`font-semibold ${config.color}`}>
            {config.label}
          </span>
          <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs text-gray-600">
            {itemCount} 条记录
          </span>
        </div>
        <ChevronDownIcon
          className={`h-5 w-5 ${config.color} transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
        />
      </button>
      {!isCollapsed && (
        <div className={`space-y-2 p-3 ${config.bgColor}`}>{children}</div>
      )}
    </div>
  );
}

// 活动项组件
function ActivityItem({
  activity,
}: {
  activity: {
    id: string;
    eventType: string;
    phase?: string;
    content: string;
    progress?: number;
    dimensionName?: string;
    agentName?: string;
    timestamp: Date;
  };
}) {
  const eventTypeColors: Record<string, string> = {
    start: 'bg-green-100 text-green-700',
    progress: 'bg-blue-100 text-blue-700',
    complete: 'bg-emerald-100 text-emerald-700',
    thinking: 'bg-purple-100 text-purple-700',
    planning: 'bg-indigo-100 text-indigo-700',
    working: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="flex items-start gap-2 rounded-lg bg-white p-2.5 shadow-sm">
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${eventTypeColors[activity.eventType] || 'bg-gray-100 text-gray-600'}`}
      >
        {activity.phase || activity.eventType}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-700">{activity.content}</p>
        <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
          {activity.dimensionName && <span>{activity.dimensionName}</span>}
          {activity.agentName && <span>• {activity.agentName}</span>}
          {activity.progress !== undefined && (
            <span className="text-blue-500">{activity.progress}%</span>
          )}
          <span>
            {activity.timestamp.toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
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

// ==================== ★ AI Writing 风格：详情预览组件 ====================

/**
 * 维度研究内容预览
 * 显示研究摘要和关键发现
 */
function DimensionContentPreview({ data }: { data: Record<string, unknown> }) {
  const summary = (data.summary as string) || '';
  const keyFindings = (data.keyFindings as string[]) || [];
  const dimensionName = (data.dimensionName as string) || '';

  return (
    <div className="space-y-3">
      {dimensionName && (
        <div className="flex items-center gap-2">
          <span className="text-lg">🔍</span>
          <span className="font-medium text-blue-700">{dimensionName}</span>
        </div>
      )}

      {summary && (
        <div>
          <h5 className="mb-1 text-xs font-semibold text-gray-500">研究摘要</h5>
          <p className="text-sm leading-relaxed text-gray-700">{summary}</p>
        </div>
      )}

      {keyFindings.length > 0 && (
        <div>
          <h5 className="mb-2 text-xs font-semibold text-gray-500">关键发现</h5>
          <ul className="space-y-1.5">
            {keyFindings.slice(0, 5).map((finding, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2 text-sm text-gray-600"
              >
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-blue-500" />
                <span>
                  {typeof finding === 'string'
                    ? finding
                    : JSON.stringify(finding)}
                </span>
              </li>
            ))}
            {keyFindings.length > 5 && (
              <li className="text-xs text-gray-400">
                还有 {keyFindings.length - 5} 条发现...
              </li>
            )}
          </ul>
        </div>
      )}

      {!summary && keyFindings.length === 0 && (
        <p className="text-sm text-gray-400">暂无详细内容</p>
      )}
    </div>
  );
}

/**
 * 报告预览
 * 显示报告标题和摘要
 */
function ReportPreview({ data }: { data: Record<string, unknown> }) {
  const title = (data.title as string) || '';
  const summary = (data.summary as string) || '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">📊</span>
        <span className="font-medium text-orange-700">研究报告</span>
      </div>

      {title && (
        <h4 className="text-base font-semibold text-gray-900">{title}</h4>
      )}

      {summary && (
        <div>
          <h5 className="mb-1 text-xs font-semibold text-gray-500">核心摘要</h5>
          <p className="text-sm leading-relaxed text-gray-700">
            {summary.slice(0, 300)}
            {summary.length > 300 && '...'}
          </p>
        </div>
      )}

      {!title && !summary && (
        <p className="text-sm text-gray-400">报告内容正在生成中...</p>
      )}
    </div>
  );
}

/**
 * Leader 规划预览
 * 显示规划的维度和策略
 */
function LeaderPlanPreview({ data }: { data: Record<string, unknown> }) {
  const dimensions =
    (data.dimensions as Array<{ name: string; description?: string }>) || [];
  const strategy =
    (data.strategy as string) || (data.researchStrategy as string) || '';

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-lg">👑</span>
        <span className="font-medium text-purple-700">Leader 研究规划</span>
      </div>

      {strategy && (
        <div>
          <h5 className="mb-1 text-xs font-semibold text-gray-500">研究策略</h5>
          <p className="text-sm leading-relaxed text-gray-600">{strategy}</p>
        </div>
      )}

      {dimensions.length > 0 && (
        <div>
          <h5 className="mb-2 text-xs font-semibold text-gray-500">
            规划维度 ({dimensions.length})
          </h5>
          <div className="grid gap-2">
            {dimensions.map((dim, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-purple-100 bg-purple-50 p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-200 text-xs font-medium text-purple-700">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-purple-800">
                    {dim.name}
                  </span>
                </div>
                {dim.description && (
                  <p className="mt-1 pl-7 text-xs text-purple-600">
                    {dim.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {!strategy && dimensions.length === 0 && (
        <p className="text-sm text-gray-400">规划详情加载中...</p>
      )}
    </div>
  );
}
