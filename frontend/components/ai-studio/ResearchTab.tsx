'use client';

/**
 * ResearchTab - 全宽沉浸式深度研究界面
 *
 * 三种视图状态：
 * 1. 列表视图：显示历史研究 + 新研究入口
 * 2. 研究进行中：左侧思考链 + 右侧实时报告
 * 3. 研究完成：全宽报告 + 底部操作栏
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Loader2,
  Microscope,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  CheckCircle2,
  AlertCircle,
  X,
  Brain,
  Clock,
  ArrowLeft,
  Download,
  MessageSquare,
  Sparkles,
  History,
  Plus,
  MoreHorizontal,
  Trash2,
  Share2,
  FileOutput,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  useDeepResearch,
  DeepResearchReport,
  ReportReference,
} from '@/hooks/useDeepResearch';
import ThinkingChainPanel from './ThinkingChainPanel';

// ==================== Types ====================
interface ResearchSession {
  id: string;
  query: string;
  status:
    | 'PLANNING'
    | 'SEARCHING'
    | 'REFLECTING'
    | 'SYNTHESIZING'
    | 'COMPLETED'
    | 'FAILED';
  report?: DeepResearchReport;
  sourcesUsed: number;
  tokensUsed: number;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

interface ResearchTabProps {
  projectId: string;
  onExportToOutputs?: (report: DeepResearchReport) => void;
  className?: string;
}

// ==================== Main Component ====================
export function ResearchTab({
  projectId,
  onExportToOutputs,
  className,
}: ResearchTabProps) {
  // View state: 'list' | 'researching' | 'viewing'
  const [view, setView] = useState<'list' | 'researching' | 'viewing'>('list');
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [viewingSession, setViewingSession] = useState<ResearchSession | null>(
    null
  );
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );

  const { state, startResearch, stop, reset, isSearching } = useDeepResearch(
    projectId,
    {
      onComplete: (report) => {
        // Save to sessions
        const newSession: ResearchSession = {
          id: `dr_${Date.now()}`,
          query: query,
          status: 'COMPLETED',
          report,
          sourcesUsed: report.metadata.totalSources,
          tokensUsed: 0,
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        setSessions((prev) => [newSession, ...prev]);
        setViewingSession(newSession);
        setView('viewing');
      },
      onError: (error) => {
        console.error('Deep Research error:', error);
        setView('list');
      },
    }
  );

  // Load research history
  useEffect(() => {
    async function loadSessions() {
      setLoadingSessions(true);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(
          `${API_BASE}/api/v1/ai-studio/projects/${projectId}/deep-research/sessions`,
          { credentials: 'include' }
        );
        if (res.ok) {
          const data = await res.json();
          setSessions(data.data || []);
        }
      } catch (err) {
        console.error('Failed to load research sessions:', err);
      } finally {
        setLoadingSessions(false);
      }
    }
    loadSessions();
  }, [projectId]);

  const handleStartResearch = useCallback(async () => {
    if (!query.trim() || isSearching) return;
    setView('researching');
    await startResearch(query, {
      depth: 'standard',
      includeAcademic: true,
      language: 'zh-CN',
    });
  }, [query, isSearching, startResearch]);

  const handleStopResearch = useCallback(() => {
    stop();
    setView('list');
  }, [stop]);

  const handleViewSession = useCallback((session: ResearchSession) => {
    setViewingSession(session);
    setView('viewing');
  }, []);

  const handleBackToList = useCallback(() => {
    setViewingSession(null);
    setView('list');
    reset();
    setQuery('');
  }, [reset]);

  const handleCopySection = useCallback((content: string, section: string) => {
    navigator.clipboard.writeText(content);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  }, []);

  const handleFollowUp = useCallback(async () => {
    if (!followUpQuery.trim() || !viewingSession) return;
    // Start new research with follow-up context
    setQuery(followUpQuery);
    setFollowUpQuery('');
    setView('researching');
    await startResearch(followUpQuery, {
      depth: 'standard',
      includeAcademic: true,
      language: 'zh-CN',
    });
  }, [followUpQuery, viewingSession, startResearch]);

  const handleDeleteSession = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering onClick
      if (deletingSessionId) return;

      setDeletingSessionId(sessionId);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(
          `${API_BASE}/api/v1/ai-studio/projects/${projectId}/deep-research/sessions/${sessionId}`,
          {
            method: 'DELETE',
            credentials: 'include',
          }
        );
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          // If viewing the deleted session, go back to list
          if (viewingSession?.id === sessionId) {
            setViewingSession(null);
            setView('list');
          }
        }
      } catch (err) {
        console.error('Failed to delete session:', err);
      } finally {
        setDeletingSessionId(null);
      }
    },
    [deletingSessionId, projectId, viewingSession]
  );

  // ==================== Render Views ====================

  // List View
  if (view === 'list') {
    return (
      <div className={cn('flex h-full flex-col bg-gray-50', className)}>
        {/* Header */}
        <div className="border-b bg-white px-6 py-4">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 p-2">
                  <Microscope className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">
                    Deep Research
                  </h1>
                  <p className="text-sm text-gray-500">
                    AI驱动的多轮迭代深度研究
                  </p>
                </div>
              </div>
              {sessions.length > 0 && (
                <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                  <History className="h-4 w-4" />
                  {sessions.length} 次研究
                </button>
              )}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Microscope className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-purple-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleStartResearch()}
                placeholder="输入你想深入研究的问题..."
                className="w-full rounded-2xl border-2 border-gray-200 py-4 pl-12 pr-32 text-lg outline-none transition-all focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
              <button
                onClick={handleStartResearch}
                disabled={!query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2.5 font-medium text-white transition-all hover:from-purple-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                开始研究
              </button>
            </div>

            {/* Quick Topics */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-gray-400">热门主题:</span>
              {[
                'AI发展趋势',
                '量子计算应用',
                '气候变化影响',
                '新能源技术',
                'Web3生态',
              ].map((topic) => (
                <button
                  key={topic}
                  onClick={() => setQuery(topic)}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs transition-colors hover:bg-purple-100 hover:text-purple-700"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Research History */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-4xl">
            {loadingSessions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
              </div>
            ) : sessions.length === 0 ? (
              <EmptyResearchState />
            ) : (
              <div className="space-y-3">
                <h3 className="mb-4 text-sm font-medium text-gray-500">
                  最近研究
                </h3>
                {sessions.map((session) => (
                  <ResearchSessionCard
                    key={session.id}
                    session={session}
                    onClick={() => handleViewSession(session)}
                    onDelete={(e) => handleDeleteSession(session.id, e)}
                    isDeleting={deletingSessionId === session.id}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Researching View
  if (view === 'researching') {
    return (
      <div className={cn('flex h-full flex-col bg-white', className)}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToList}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <h2 className="line-clamp-1 font-semibold text-gray-900">
                {query}
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{getPhaseLabel(state.phase)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleStopResearch}
            className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-red-600 transition-colors hover:bg-red-100"
          >
            <X className="h-4 w-4" />
            停止研究
          </button>
        </div>

        {/* Progress Bar */}
        <div className="border-b bg-gray-50 px-6 py-2">
          <div className="flex items-center gap-4">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
              <motion.div
                className="h-full bg-gradient-to-r from-purple-500 to-indigo-500"
                initial={{ width: 0 }}
                animate={{
                  width: state.searchProgress
                    ? `${Math.round((state.searchProgress.currentRound / Math.max(state.searchProgress.totalRounds, 1)) * 100)}%`
                    : state.phase === 'completed'
                      ? '100%'
                      : '10%',
                }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <span className="text-sm font-medium text-gray-600">
              {state.searchProgress
                ? `${Math.round((state.searchProgress.currentRound / Math.max(state.searchProgress.totalRounds, 1)) * 100)}%`
                : state.phase === 'completed'
                  ? '100%'
                  : '...'}
            </span>
          </div>
        </div>

        {/* Toggle Thinking */}
        <div className="border-b px-6 py-2">
          <button
            onClick={() => setShowThinking(!showThinking)}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            <Brain className="h-4 w-4" />
            {showThinking ? '隐藏思考过程' : '显示思考过程'}
            {showThinking ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Thinking Panel (30%) */}
          <AnimatePresence>
            {showThinking && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '30%', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="flex-shrink-0 overflow-hidden border-r"
              >
                <ThinkingChainPanel state={state} className="h-full" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Report Content (70%) */}
          <div className="flex-1 overflow-y-auto p-6">
            <StreamingReportView
              reportContent={state.reportContent}
              phase={state.phase}
            />
          </div>
        </div>
      </div>
    );
  }

  // Viewing Completed Research
  if (view === 'viewing' && viewingSession?.report) {
    return (
      <div className={cn('flex h-full flex-col bg-white', className)}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBackToList}
              className="rounded-lg p-2 transition-colors hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5 text-gray-500" />
            </button>
            <div>
              <h2 className="line-clamp-1 font-semibold text-gray-900">
                {viewingSession.query}
              </h2>
              <div className="flex items-center gap-3 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {viewingSession.sourcesUsed} 来源
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {viewingSession.report.metadata.duration.toFixed(1)}s
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExportToOutputs?.(viewingSession.report!)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileOutput className="h-4 w-4" />
              导出
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Share2 className="h-4 w-4" />
              分享
            </button>
          </div>
        </div>

        {/* Report Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl p-6">
            <CompletedReportView
              report={viewingSession.report}
              copiedSection={copiedSection}
              onCopySection={handleCopySection}
            />
          </div>
        </div>

        {/* Follow-up Bar */}
        <div className="border-t bg-gray-50 px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <div className="relative flex-1">
              <MessageSquare className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={followUpQuery}
                onChange={(e) => setFollowUpQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleFollowUp()}
                placeholder="基于此研究继续追问..."
                className="w-full rounded-xl border border-gray-300 py-3 pl-12 pr-4 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
            </div>
            <button
              onClick={handleFollowUp}
              disabled={!followUpQuery.trim()}
              className="rounded-xl bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              追问
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

// ==================== Sub Components ====================

function EmptyResearchState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-2xl bg-purple-50 p-4">
        <Microscope className="h-12 w-12 text-purple-500" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">
        开始你的第一次深度研究
      </h3>
      <p className="max-w-md text-gray-500">
        输入研究主题，AI
        将进行多轮迭代搜索，自动规划研究路径，并生成带引用的专业研究报告。
      </p>
      <div className="mt-6 grid max-w-lg grid-cols-2 gap-4 text-left">
        {[
          {
            icon: Brain,
            title: 'AI规划研究路径',
            desc: '自动分解问题，制定搜索策略',
          },
          {
            icon: Search,
            title: '多轮迭代搜索',
            desc: '最多5轮深度搜索，覆盖全面',
          },
          {
            icon: Sparkles,
            title: '自我反思优化',
            desc: '实时评估质量，动态调整方向',
          },
          {
            icon: FileText,
            title: '专业报告生成',
            desc: '结构化报告，完整引用标注',
          },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-lg border bg-white p-3"
          >
            <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-500" />
            <div>
              <div className="text-sm font-medium text-gray-900">{title}</div>
              <div className="text-xs text-gray-500">{desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResearchSessionCard({
  session,
  onClick,
  onDelete,
  isDeleting,
}: {
  session: ResearchSession;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting: boolean;
}) {
  const statusConfig = {
    COMPLETED: {
      color: 'text-green-600 bg-green-50',
      icon: CheckCircle2,
      label: '已完成',
    },
    FAILED: {
      color: 'text-red-600 bg-red-50',
      icon: AlertCircle,
      label: '失败',
    },
    PLANNING: {
      color: 'text-blue-600 bg-blue-50',
      icon: Loader2,
      label: '规划中',
    },
    SEARCHING: {
      color: 'text-purple-600 bg-purple-50',
      icon: Search,
      label: '搜索中',
    },
    REFLECTING: {
      color: 'text-yellow-600 bg-yellow-50',
      icon: Brain,
      label: '反思中',
    },
    SYNTHESIZING: {
      color: 'text-indigo-600 bg-indigo-50',
      icon: FileText,
      label: '生成中',
    },
  };

  const config = statusConfig[session.status];
  const StatusIcon = config.icon;

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-4 transition-all hover:border-purple-300 hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-1 font-medium text-gray-900 transition-colors group-hover:text-purple-600">
            {session.query}
          </h4>
          <div className="mt-2 flex items-center gap-3 text-sm text-gray-500">
            <span
              className={cn(
                'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                config.color
              )}
            >
              <StatusIcon
                className={cn(
                  'h-3 w-3',
                  session.status !== 'COMPLETED' &&
                    session.status !== 'FAILED' &&
                    'animate-spin'
                )}
              />
              {config.label}
            </span>
            {session.sourcesUsed > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {session.sourcesUsed} 来源
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatTimeAgo(session.createdAt)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 disabled:opacity-50 group-hover:opacity-100"
            title="删除研究"
          >
            {isDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
          <ChevronRight className="h-5 w-5 text-gray-300 transition-colors group-hover:text-purple-500" />
        </div>
      </div>
    </div>
  );
}

function StreamingReportView({
  reportContent,
  phase,
}: {
  reportContent: Record<string, string>;
  phase: string;
}) {
  const sections = Object.entries(reportContent);

  if (sections.length === 0 && phase !== 'synthesizing') {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-purple-500" />
        <p className="text-gray-500">正在收集和分析信息...</p>
        <p className="mt-1 text-sm text-gray-400">AI正在执行研究计划</p>
      </div>
    );
  }

  return (
    <div className="prose prose-purple max-w-none">
      {sections.map(([section, content]) => (
        <div key={section} className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
            {getSectionIcon(section)}
            {getSectionTitle(section)}
          </h2>
          <div className="whitespace-pre-wrap leading-relaxed text-gray-700">
            {content}
            {phase === 'synthesizing' && (
              <span className="ml-1 inline-block h-5 w-2 animate-pulse bg-purple-500" />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function CompletedReportView({
  report,
  copiedSection,
  onCopySection,
}: {
  report: DeepResearchReport;
  copiedSection: string | null;
  onCopySection: (content: string, section: string) => void;
}) {
  const [expandedRefs, setExpandedRefs] = useState(true); // Default expanded for better UX
  const [highlightedRef, setHighlightedRef] = useState<number | null>(null);
  const [highlightedQuote, setHighlightedQuote] = useState<string | null>(null);

  // Handle citation click - scroll to reference and highlight quote
  const handleCitationClick = useCallback(
    (refId: number, surroundingContext?: string) => {
      // Expand references if collapsed
      if (!expandedRefs) {
        setExpandedRefs(true);
      }
      // Set highlighted quote for the reference
      setHighlightedQuote(surroundingContext || null);
      // Wait for animation then scroll
      setTimeout(
        () => {
          const refElement = document.getElementById(`ref-${refId}`);
          if (refElement) {
            refElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            // Highlight the reference
            setHighlightedRef(refId);
            setTimeout(() => {
              setHighlightedRef(null);
              setHighlightedQuote(null);
            }, 5000);
          }
        },
        expandedRefs ? 0 : 300
      );
    },
    [expandedRefs]
  );

  return (
    <div className="space-y-8">
      {/* Metadata */}
      <div className="flex flex-wrap gap-4 rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 p-4 text-sm">
        <span className="flex items-center gap-2 text-purple-700">
          <FileText className="h-4 w-4" />
          {report.metadata.totalSources} 个来源
        </span>
        <span className="flex items-center gap-2 text-purple-700">
          <Search className="h-4 w-4" />
          {report.metadata.searchRounds} 轮搜索
        </span>
        <span className="flex items-center gap-2 text-purple-700">
          <Clock className="h-4 w-4" />
          {report.metadata.duration.toFixed(1)} 秒
        </span>
      </div>

      {/* Executive Summary */}
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Sparkles className="h-5 w-5 text-purple-500" />
            执行摘要
          </h2>
          <CopyButton
            content={report.executiveSummary}
            section="summary"
            copied={copiedSection === 'summary'}
            onCopy={onCopySection}
          />
        </div>
        <div className="prose prose-purple max-w-none leading-relaxed text-gray-700">
          {formatContentWithCitations(
            report.executiveSummary,
            [], // Summary typically doesn't have citations
            handleCitationClick,
            report.references
          )}
        </div>
      </section>

      {/* Main Sections */}
      {report.sections.map((section, index) => (
        <section key={index} className="rounded-xl border bg-white p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{section.title}</h2>
            <CopyButton
              content={section.content}
              section={`section-${index}`}
              copied={copiedSection === `section-${index}`}
              onCopy={onCopySection}
            />
          </div>
          <div className="prose prose-purple max-w-none">
            {formatContentWithCitations(
              section.content,
              section.citations,
              handleCitationClick,
              report.references
            )}
          </div>
        </section>
      ))}

      {/* Conclusion */}
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            结论
          </h2>
          <CopyButton
            content={report.conclusion}
            section="conclusion"
            copied={copiedSection === 'conclusion'}
            onCopy={onCopySection}
          />
        </div>
        <div className="prose prose-purple max-w-none leading-relaxed text-gray-700">
          {formatContentWithCitations(
            report.conclusion,
            [],
            handleCitationClick,
            report.references
          )}
        </div>
      </section>

      {/* References - NotebookLM style with expandable content */}
      <section className="rounded-xl bg-gray-50 p-6">
        <button
          onClick={() => setExpandedRefs(!expandedRefs)}
          className="flex w-full items-center justify-between"
        >
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <FileText className="h-5 w-5 text-gray-500" />
            参考文献 ({report.references.length})
          </h2>
          {expandedRefs ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
        <AnimatePresence>
          {expandedRefs && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="mt-4 space-y-2 overflow-hidden"
            >
              {report.references.map((ref) => {
                const isHighlighted = highlightedRef === ref.id;
                return (
                  <div
                    key={ref.id}
                    id={`ref-${ref.id}`}
                    className={`rounded-lg border transition-all duration-300 ${
                      isHighlighted
                        ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-300 ring-offset-2'
                        : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3 p-3">
                      <span className="flex-shrink-0 rounded bg-purple-600 px-2 py-0.5 text-xs font-bold text-white">
                        [{ref.id}]
                      </span>
                      <div className="min-w-0 flex-1">
                        <a
                          href={ref.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
                        >
                          <span className="line-clamp-1">{ref.title}</span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        </a>
                        {/* Show snippet with quote highlighting */}
                        {ref.snippet && (
                          <div className="mt-2 text-xs leading-relaxed text-gray-600">
                            {isHighlighted && highlightedQuote ? (
                              <HighlightedSnippet
                                snippet={ref.snippet}
                                quote={highlightedQuote}
                              />
                            ) : (
                              <p className="line-clamp-3">{ref.snippet}</p>
                            )}
                          </div>
                        )}
                        {/* Show full content when highlighted */}
                        {isHighlighted && ref.snippet && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="mt-2 border-t border-purple-200 pt-2"
                          >
                            <p className="text-xs italic text-purple-600">
                              点击引用跳转到此来源
                            </p>
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

// Highlight matching quote in snippet
function HighlightedSnippet({
  snippet,
  quote,
}: {
  snippet: string;
  quote: string;
}) {
  // Clean quote for matching
  const cleanQuote = quote
    .replace(/\[[\d,\s]+\]/g, '')
    .replace(/\[资料\s*[\d,、\s]+\]/g, '')
    .replace(/CITE_GROUP_\d+(?:_\d+)*/g, '')
    .trim()
    .slice(0, 50); // Use first 50 chars for matching

  const lowerSnippet = snippet.toLowerCase();
  const lowerQuote = cleanQuote.toLowerCase();
  const matchIndex = lowerSnippet.indexOf(lowerQuote);

  if (matchIndex === -1 || cleanQuote.length < 10) {
    // No match found, show full snippet with yellow background
    return (
      <p className="animate-pulse rounded bg-yellow-100 px-1">{snippet}</p>
    );
  }

  const before = snippet.slice(0, matchIndex);
  const highlighted = snippet.slice(matchIndex, matchIndex + cleanQuote.length);
  const after = snippet.slice(matchIndex + cleanQuote.length);

  return (
    <p>
      {before}
      <span className="animate-pulse rounded bg-yellow-200 px-0.5 font-medium text-gray-900">
        {highlighted}
      </span>
      {after}
    </p>
  );
}

function CopyButton({
  content,
  section,
  copied,
  onCopy,
}: {
  content: string;
  section: string;
  copied: boolean;
  onCopy: (content: string, section: string) => void;
}) {
  return (
    <button
      onClick={() => onCopy(content, section)}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          已复制
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          复制
        </>
      )}
    </button>
  );
}

// ==================== Helpers ====================

function getPhaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    idle: '准备就绪',
    planning: '制定研究计划...',
    searching: '执行搜索...',
    reflecting: '分析和反思...',
    synthesizing: '生成研究报告...',
    completed: '研究完成',
    error: '发生错误',
  };
  return labels[phase] || phase;
}

function getSectionIcon(section: string) {
  if (section.includes('summary') || section.includes('摘要')) {
    return <Sparkles className="h-5 w-5 text-purple-500" />;
  }
  if (section.includes('conclusion') || section.includes('结论')) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />;
  }
  return <FileText className="h-5 w-5 text-gray-400" />;
}

function getSectionTitle(section: string): string {
  const titles: Record<string, string> = {
    executive_summary: '执行摘要',
    conclusion: '结论',
  };
  return titles[section] || section;
}

/**
 * Format content with clickable citations
 * Supports multiple formats:
 * - [1], [1, 2] - standard citation format
 * - [资料 1], [资料 1, 2] - Chinese reference format
 * - CITE_GROUP_1_2 - AI output format
 */
function formatContentWithCitations(
  content: string,
  citations: number[],
  onCitationClick?: (refId: number, surroundingContext?: string) => void,
  references?: ReportReference[]
): React.ReactNode {
  // Match all citation formats
  const pattern =
    /(\[(\d+(?:\s*,\s*\d+)*)\]|\[资料\s*(\d+(?:\s*[,、]\s*\d+)*)\]|CITE_GROUP_(\d+(?:_\d+)*))/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }

    // Parse indices based on format
    let indices: number[];
    if (match[2]) {
      // Standard [1] or [1, 2] format
      indices = match[2].split(/\s*,\s*/).map((s) => parseInt(s, 10));
    } else if (match[3]) {
      // Chinese [资料 1] format
      indices = match[3].split(/\s*[,、]\s*/).map((s) => parseInt(s, 10));
    } else if (match[4]) {
      // CITE_GROUP_1_2 format
      indices = match[4].split('_').map((s) => parseInt(s, 10));
    } else {
      parts.push(match[0]);
      lastIndex = match.index + match[0].length;
      continue;
    }

    // Extract surrounding context for quote-based highlighting
    const contextStart = Math.max(0, match.index - 80);
    const contextEnd = Math.min(
      content.length,
      match.index + match[0].length + 80
    );
    let surroundingContext = content.slice(contextStart, contextEnd);
    // Clean citation markers from context
    surroundingContext = surroundingContext
      .replace(/\[[\d,\s]+\]/g, '')
      .replace(/\[资料\s*[\d,、\s]+\]/g, '')
      .replace(/CITE_GROUP_\d+(?:_\d+)*/g, '')
      .trim();

    // Create citation links for each index
    indices.forEach((num) => {
      // Only show citations that are in the valid citation list, or show all if list is empty
      const shouldShow = citations.length === 0 || citations.includes(num);
      if (shouldShow) {
        const reference = references?.find((r) => r.id === num);
        parts.push(
          <DeepCitationLink
            key={`${match!.index}-${num}`}
            sourceIndex={num}
            sourceTitle={reference?.title}
            sourceSnippet={reference?.snippet}
            onClick={() => onCitationClick?.(num, surroundingContext)}
          />
        );
      }
    });

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.length === 0 ? content : parts;
}

/**
 * Citation link with NotebookLM-style tooltip
 */
function DeepCitationLink({
  sourceIndex,
  sourceTitle,
  sourceSnippet,
  onClick,
}: {
  sourceIndex: number;
  sourceTitle?: string;
  sourceSnippet?: string;
  onClick?: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Get preview text
  const preview = sourceSnippet
    ? sourceSnippet.length > 150
      ? sourceSnippet.slice(0, 150) + '...'
      : sourceSnippet
    : null;

  return (
    <span className="relative inline">
      <sup
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick?.();
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="mx-0.5 cursor-pointer rounded px-0.5 font-medium text-purple-600 transition-all hover:bg-purple-100 hover:text-purple-800"
        title={`跳转到引用 [${sourceIndex}]`}
      >
        [{sourceIndex}]
      </sup>

      {/* Tooltip with source details - NotebookLM style */}
      {showTooltip && sourceTitle && (
        <div
          ref={tooltipRef}
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-gray-200 bg-white shadow-xl"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          {/* Header */}
          <div className="flex items-start gap-2 border-b border-gray-100 px-3 py-2">
            <div className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-purple-100">
              <FileText className="h-3.5 w-3.5 text-purple-600" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="rounded bg-purple-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {sourceIndex}
                </span>
                <span className="truncate text-sm font-medium text-gray-900">
                  {sourceTitle}
                </span>
              </div>
            </div>
          </div>

          {/* Content Preview */}
          {preview && (
            <div className="px-3 py-2">
              <p className="text-xs leading-relaxed text-gray-600">{preview}</p>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-100 bg-gray-50 px-3 py-1.5">
            <span className="text-[10px] text-gray-400">
              Click to view full source
            </span>
            <ExternalLink className="h-3 w-3 text-gray-400" />
          </div>

          {/* Arrow */}
          <div className="absolute left-1/2 top-full -translate-x-1/2">
            <div className="h-2 w-2 -translate-y-1 rotate-45 border-b border-r border-gray-200 bg-gray-50" />
          </div>
        </div>
      )}
    </span>
  );
}

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 7) return `${diffDays}天前`;
  return date.toLocaleDateString();
}

export default ResearchTab;
