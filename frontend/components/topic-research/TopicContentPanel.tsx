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

interface TopicContentPanelProps {
  report: TopicReport | null;
  dimensions: TopicDimension[];
  evidence: TopicEvidence[];
  isLoadingReport: boolean;
  isLoadingEvidence: boolean;
  onExportReport?: (format: 'pdf' | 'docx') => void;
  researchEvents?: ResearchEvent[];
  agentThinkings?: AgentThinking[];
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
}: TopicContentPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('report');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Safe array fallbacks
  const safeDimensions = dimensions || [];
  const safeEvidence = evidence || [];
  const safeEvents = researchEvents || [];
  const safeThinkings = agentThinkings || [];

  // Tab 配置
  const tabs: {
    key: TabType;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      key: 'report',
      label: '洞察报告',
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
      label: 'Agent思考',
      icon: <ThinkingIcon className="h-4 w-4" />,
      badge: safeThinkings.length > 0 ? safeThinkings.length : undefined,
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
    </div>
  );
}

// ==================== 报告 Tab ====================
// 提取报告内容中的标题，生成大纲
interface OutlineItem {
  id: string;
  level: number;
  text: string;
  offset: number;
}

function extractOutline(content: string): OutlineItem[] {
  const lines = content.split('\n');
  const outline: OutlineItem[] = [];
  let offset = 0;

  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      outline.push({
        id: `heading-${outline.length}`,
        level: match[1].length,
        text: match[2].trim(),
        offset,
      });
    }
    offset += line.length + 1;
  }

  return outline;
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
  const [showOutline, setShowOutline] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  // 从报告中提取完整的 Markdown 内容
  const reportMarkdown = useMemo(() => {
    if (!report) return '';

    const sections: string[] = [];

    // 标题
    if (report.title) {
      sections.push(`# ${report.title}\n`);
    }

    // 摘要
    if (report.summary) {
      sections.push(`## 核心摘要\n\n${report.summary}\n`);
    }

    // 关键发现
    if (report.highlights && report.highlights.length > 0) {
      sections.push(`## 关键发现\n`);
      report.highlights.forEach((h, i) => {
        const typeEmoji =
          h.type === 'trend'
            ? '📈'
            : h.type === 'finding'
              ? '💡'
              : h.type === 'opportunity'
                ? '🎯'
                : '⚠️';
        sections.push(`### ${typeEmoji} ${h.title}\n\n${h.content}\n`);
      });
    }

    // 维度分析
    if (report.dimensionAnalyses && report.dimensionAnalyses.length > 0) {
      sections.push(`## 维度分析\n`);
      report.dimensionAnalyses.forEach((analysis) => {
        const dimName = analysis.dimension?.name || '未知维度';
        sections.push(`### ${dimName}\n`);

        if (analysis.summary) {
          sections.push(`${analysis.summary}\n`);
        }

        if (analysis.keyFindings && analysis.keyFindings.length > 0) {
          sections.push(`\n**关键发现:**\n`);
          analysis.keyFindings.forEach((f) => {
            const sig =
              f.significance === 'high'
                ? '🔴'
                : f.significance === 'medium'
                  ? '🟡'
                  : '⚪';
            sections.push(`- ${sig} ${f.finding}\n`);
          });
        }

        if (analysis.trends && analysis.trends.length > 0) {
          sections.push(`\n**趋势:**\n`);
          analysis.trends.forEach((t) => {
            const dir =
              t.direction === 'increasing'
                ? '↑'
                : t.direction === 'decreasing'
                  ? '↓'
                  : t.direction === 'emerging'
                    ? '★'
                    : '→';
            sections.push(`- ${dir} ${t.trend}\n`);
          });
        }

        if (analysis.detailedContent) {
          sections.push(`\n${analysis.detailedContent}\n`);
        }

        sections.push('\n');
      });
    }

    return sections.join('\n');
  }, [report]);

  // 大纲
  const outline = useMemo(
    () => extractOutline(reportMarkdown),
    [reportMarkdown]
  );

  // 滚动到指定标题
  const scrollToHeading = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

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
    <div className="flex h-full">
      {/* 大纲侧边栏 */}
      {showOutline && outline.length > 0 && (
        <div className="w-56 flex-shrink-0 border-r border-gray-100 bg-gray-50">
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              目录大纲
            </span>
            <button
              onClick={() => setShowOutline(false)}
              className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          <nav className="overflow-y-auto p-2">
            {outline.map((item, idx) => (
              <button
                key={item.id}
                onClick={() => scrollToHeading(`outline-${idx}`)}
                className={`block w-full truncate rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-gray-200 ${
                  item.level === 1
                    ? 'font-semibold text-gray-900'
                    : item.level === 2
                      ? 'pl-4 text-gray-700'
                      : 'pl-6 text-gray-500'
                }`}
              >
                {item.text}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* 报告内容 */}
      <div ref={contentRef} className="flex-1 overflow-y-auto">
        {/* 工具栏 */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 px-4 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            {!showOutline && (
              <button
                onClick={() => setShowOutline(true)}
                className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
              >
                <ListIcon className="h-3 w-3" />
                显示目录
              </button>
            )}
            <span className="text-xs text-gray-400">
              版本 {report.version} ·{' '}
              {report.generatedAt
                ? new Date(report.generatedAt).toLocaleString('zh-CN')
                : '-'}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="rounded bg-blue-50 px-2 py-1 text-blue-600">
              {report.totalSources || 0} 来源引用
            </span>
          </div>
        </div>

        {/* Markdown 渲染区域 */}
        <div className="mx-auto max-w-3xl px-6 py-6">
          <article className="prose prose-sm prose-blue max-w-none">
            <ReactMarkdown
              components={{
                // 为标题添加 ID 以支持导航
                h1: ({ children, ...props }) => {
                  const text = String(children);
                  const idx = outline.findIndex(
                    (o) => o.text === text && o.level === 1
                  );
                  return (
                    <h1 id={`outline-${idx}`} {...props}>
                      {children}
                    </h1>
                  );
                },
                h2: ({ children, ...props }) => {
                  const text = String(children);
                  const idx = outline.findIndex(
                    (o) => o.text === text && o.level === 2
                  );
                  return (
                    <h2
                      id={`outline-${idx}`}
                      className="scroll-mt-16"
                      {...props}
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children, ...props }) => {
                  const text = String(children);
                  const idx = outline.findIndex(
                    (o) => o.text === text && o.level === 3
                  );
                  return (
                    <h3
                      id={`outline-${idx}`}
                      className="scroll-mt-16"
                      {...props}
                    >
                      {children}
                    </h3>
                  );
                },
              }}
            >
              {reportMarkdown}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    </div>
  );
}

// ==================== 团队互动 Tab ====================
function TeamInteractionTabContent({ events }: { events: ResearchEvent[] }) {
  const safeEvents = events || [];

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

  if (safeEvents.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
          <TeamIcon className="h-10 w-10 text-blue-500" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">等待研究开始</h3>
        <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
          研究过程中，AI 团队的协作动态将实时展示在此处
        </p>
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
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-700">
            研究过程 ({safeEvents.length} 条记录)
          </h4>
        </div>

        {/* 事件时间线 */}
        <div className="relative">
          <div className="absolute left-4 top-0 h-full w-px bg-gray-200" />

          <div className="space-y-4">
            {safeEvents.map((event) => {
              const agent = agentConfig[event.agentType];
              const eventType = eventTypeConfig[event.eventType];

              return (
                <div key={event.id} className="relative flex gap-4 pl-10">
                  {/* 时间线节点 */}
                  <div
                    className={`absolute left-1 flex h-7 w-7 items-center justify-center rounded-full text-sm ${agent.bgColor}`}
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
                          : event.eventType === 'decision'
                            ? 'border-purple-200 bg-purple-50'
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
      </div>
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
