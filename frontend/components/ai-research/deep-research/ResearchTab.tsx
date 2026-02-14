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
  Lightbulb,
  MessageSquare,
  Sparkles,
  History,
  Trash2,
  Share2,
  FileOutput,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  useDiscussionResearch,
  DeepResearchReport,
  ReportReference,
} from '@/hooks';
import { DiscussionChat } from './DiscussionChat';
import { IdeasPanel } from './IdeasPanel';
import { useTranslation } from '@/lib/i18n';
import { getAuthHeader } from '@/lib/utils/auth';
import ClientDate from '@/components/common/ClientDate';
import { ExportDialog } from '@/components/common/ExportDialog';

import { logger } from '@/lib/utils/logger';
// ==================== Types ====================
interface ResearchSession {
  id: string;
  query: string;
  status:
    | 'PLANNING'
    | 'IDEATION'
    | 'SEARCHING'
    | 'FINDINGS'
    | 'REFLECTING'
    | 'SYNTHESIZING'
    | 'COMPLETED'
    | 'FAILED';
  report?: DeepResearchReport;
  discussion?: Array<{
    id: string;
    agentRole: string;
    agentName: string;
    agentIcon: string;
    content: string;
    phase: string;
    messageType: string;
    metadata?: {
      searchResults?: unknown[];
      directions?: string[];
      citations?: number[];
    };
    timestamp: string | Date;
  }>;
  directions?: {
    directions: Array<{
      title: string;
      description?: string;
      assignedTo?: string;
      searchQueries?: string[];
    }>;
  } | null;
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
export function ResearchTab({ projectId, className }: ResearchTabProps) {
  const { t } = useTranslation();
  // View state: 'list' | 'researching' | 'viewing'
  const [view, setView] = useState<'list' | 'researching' | 'viewing'>('list');
  const [query, setQuery] = useState('');
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [viewingSession, setViewingSession] = useState<ResearchSession | null>(
    null
  );
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [followUpQuery, setFollowUpQuery] = useState('');
  const [viewingTab, setViewingTab] = useState<'report' | 'ideas'>('report');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(
    null
  );
  const [showExport, setShowExport] = useState(false);

  const {
    state: discussionState,
    startResearch,
    stop,
    reset,
    isActive: isSearching,
  } = useDiscussionResearch(projectId, {
    onComplete: (report) => {
      const newSession: ResearchSession = {
        id: discussionState.sessionId || `dr_${Date.now()}`,
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
      logger.error('Discussion Research error:', error);
      setView('list');
    },
  });

  // Load research history
  useEffect(() => {
    async function loadSessions() {
      setLoadingSessions(true);
      try {
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
        const res = await fetch(
          `${API_BASE}/api/v1/ai-studio/projects/${projectId}/deep-research/sessions`,
          { headers: { ...getAuthHeader() } }
        );
        if (res.ok) {
          const result = await res.json();
          // Handle wrapped API response { success: true, data: T }
          const data = result?.data ?? result;
          setSessions(data.data || data || []);
        }
      } catch (err) {
        logger.error('Failed to load research sessions:', err);
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
    if (!followUpQuery.trim() || !viewingSession || !viewingSession.report)
      return;
    // Start follow-up research with previous report context
    // This allows the AI to build upon the existing analysis
    setQuery(followUpQuery);
    setFollowUpQuery('');
    setView('researching');
    await startResearch(followUpQuery, {
      depth: 'standard',
      includeAcademic: true,
      language: 'zh-CN',
      // 传入之前的报告作为上下文，实现追问追加
      isFollowUp: true,
      previousReport: viewingSession.report,
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
            headers: { ...getAuthHeader() },
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
        logger.error('Failed to delete session:', err);
      } finally {
        setDeletingSessionId(null);
      }
    },
    [deletingSessionId, projectId, viewingSession]
  );

  // ==================== Render Views ====================

  // Hot topics mapping for i18n
  const hotTopics = [
    { key: 'aiTrends', fallback: 'AI发展趋势' },
    { key: 'quantumComputing', fallback: '量子计算应用' },
    { key: 'climateChange', fallback: '气候变化影响' },
    { key: 'newEnergy', fallback: '新能源技术' },
    { key: 'web3', fallback: 'Web3生态' },
  ];

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
                    {t('aiResearch.deepResearch.title')}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {t('aiResearch.deepResearch.subtitle')}
                  </p>
                </div>
              </div>
              {sessions.length > 0 && (
                <button className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                  <History className="h-4 w-4" />
                  {t('aiResearch.deepResearch.researchCount', {
                    count: sessions.length,
                  })}
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
                placeholder={t('aiResearch.deepResearch.inputPlaceholder')}
                className="w-full rounded-2xl border-2 border-gray-200 bg-white py-4 pl-12 pr-32 text-lg text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
              <button
                onClick={handleStartResearch}
                disabled={!query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2.5 font-medium text-white transition-all hover:from-purple-700 hover:to-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('aiResearch.deepResearch.startButton')}
              </button>
            </div>

            {/* Quick Topics */}
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="text-xs text-gray-400">
                {t('aiResearch.deepResearch.hotTopics')}
              </span>
              {hotTopics.map(({ key, fallback }) => (
                <button
                  key={key}
                  onClick={() =>
                    setQuery(
                      t(`aiResearch.deepResearch.topics.${key}`) || fallback
                    )
                  }
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs transition-colors hover:bg-purple-100 hover:text-purple-700"
                >
                  {t(`aiResearch.deepResearch.topics.${key}`) || fallback}
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
                  {t('aiResearch.deepResearch.recentResearch')}
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

  // Researching View - Discussion-driven
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
                <span>{getPhaseLabel(discussionState.phase, t)}</span>
              </div>
            </div>
          </div>
          <button
            onClick={handleStopResearch}
            className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-red-600 transition-colors hover:bg-red-100"
          >
            <X className="h-4 w-4" />
            {t('aiResearch.deepResearch.stopResearch')}
          </button>
        </div>

        {/* Discussion Chat View */}
        <DiscussionChat
          state={discussionState}
          query={query}
          onStop={handleStopResearch}
          className="flex-1"
        />
      </div>
    );
  }

  // Viewing Completed Research
  if (view === 'viewing' && viewingSession?.report) {
    const hasDiscussion =
      viewingSession.discussion && viewingSession.discussion.length > 0;

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
                  {t('aiResearch.deepResearch.sourcesCount', {
                    count: viewingSession.sourcesUsed,
                  })}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {t('aiResearch.deepResearch.duration', {
                    duration:
                      viewingSession.report.metadata.duration.toFixed(1),
                  })}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExport(true)}
              className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <FileOutput className="h-4 w-4" />
              {t('common.export')}
            </button>
            <button className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Share2 className="h-4 w-4" />
              {t('common.share')}
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        {hasDiscussion && (
          <div className="border-b bg-gray-50 px-6">
            <div className="mx-auto flex max-w-4xl gap-1">
              <TabButton
                active={viewingTab === 'report'}
                icon={FileText}
                label="研究报告"
                onClick={() => setViewingTab('report')}
              />
              <TabButton
                active={viewingTab === 'ideas'}
                icon={Lightbulb}
                label="Ideas 成果"
                badge={viewingSession.directions?.directions?.length}
                onClick={() => setViewingTab('ideas')}
              />
            </div>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {viewingTab === 'report' && (
            <div
              className="mx-auto max-w-4xl p-6"
              data-export-content="research"
            >
              <CompletedReportView
                report={viewingSession.report}
                copiedSection={copiedSection}
                onCopySection={handleCopySection}
              />
            </div>
          )}
          {viewingTab === 'ideas' && (
            <div className="mx-auto max-w-4xl p-6">
              <IdeasPanel
                discussion={viewingSession.discussion ?? []}
                directions={viewingSession.directions}
                query={viewingSession.query}
              />
            </div>
          )}
        </div>

        {/* Export Dialog */}
        {viewingSession.report && (
          <ExportDialog
            isOpen={showExport}
            onClose={() => setShowExport(false)}
            contentSelector="[data-export-content='research']"
            contentTitle={viewingSession.query}
            moduleType="research"
            sourceId={viewingSession.id}
            availableFormats={['PDF', 'DOCX', 'PPTX', 'HTML']}
          />
        )}

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
                placeholder={t('aiResearch.deepResearch.followUpPlaceholder')}
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-12 pr-4 text-gray-900 outline-none placeholder:text-gray-400 focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
              />
            </div>
            <button
              onClick={handleFollowUp}
              disabled={!followUpQuery.trim()}
              className="rounded-xl bg-purple-600 px-6 py-3 font-medium text-white transition-colors hover:bg-purple-700 disabled:opacity-50"
            >
              {t('aiResearch.deepResearch.followUp')}
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
  const { t } = useTranslation();

  const features = [
    {
      icon: Brain,
      key: 'planning',
    },
    {
      icon: Search,
      key: 'searching',
    },
    {
      icon: Sparkles,
      key: 'reflecting',
    },
    {
      icon: FileText,
      key: 'reporting',
    },
  ];

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-2xl bg-purple-50 p-4">
        <Microscope className="h-12 w-12 text-purple-500" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">
        {t('aiResearch.deepResearch.empty.title')}
      </h3>
      <p className="max-w-md text-gray-500">
        {t('aiResearch.deepResearch.empty.description')}
      </p>
      <div className="mt-6 grid max-w-lg grid-cols-2 gap-4 text-left">
        {features.map(({ icon: Icon, key }) => (
          <div
            key={key}
            className="flex items-start gap-3 rounded-lg border bg-white p-3"
          >
            <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-500" />
            <div>
              <div className="text-sm font-medium text-gray-900">
                {t(`aiResearch.deepResearch.empty.features.${key}.title`)}
              </div>
              <div className="text-xs text-gray-500">
                {t(`aiResearch.deepResearch.empty.features.${key}.desc`)}
              </div>
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
  const { t } = useTranslation();

  const statusConfig: Record<
    string,
    { color: string; icon: typeof CheckCircle2; key: string }
  > = {
    COMPLETED: {
      color: 'text-green-600 bg-green-50',
      icon: CheckCircle2,
      key: 'completed',
    },
    FAILED: {
      color: 'text-red-600 bg-red-50',
      icon: AlertCircle,
      key: 'failed',
    },
    PLANNING: {
      color: 'text-blue-600 bg-blue-50',
      icon: Loader2,
      key: 'planning',
    },
    IDEATION: {
      color: 'text-purple-600 bg-purple-50',
      icon: MessageSquare,
      key: 'ideation',
    },
    SEARCHING: {
      color: 'text-purple-600 bg-purple-50',
      icon: Search,
      key: 'searching',
    },
    FINDINGS: {
      color: 'text-amber-600 bg-amber-50',
      icon: Brain,
      key: 'findings',
    },
    REFLECTING: {
      color: 'text-yellow-600 bg-yellow-50',
      icon: Brain,
      key: 'reflecting',
    },
    SYNTHESIZING: {
      color: 'text-indigo-600 bg-indigo-50',
      icon: FileText,
      key: 'synthesizing',
    },
  };

  // ★ 默认配置
  const defaultConfig = {
    color: 'text-gray-600 bg-gray-50',
    icon: Loader2,
    key: 'unknown',
  };

  // ★ 安全访问
  const config = statusConfig[session.status] || defaultConfig;
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
              {t(`aiResearch.deepResearch.status.${config.key}`)}
            </span>
            {session.sourcesUsed > 0 && (
              <span className="flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {t('aiResearch.deepResearch.sourcesCount', {
                  count: session.sourcesUsed,
                })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              <ClientDate date={session.createdAt} format="relative" />
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onDelete}
            disabled={isDeleting}
            className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 disabled:opacity-50 group-hover:opacity-100"
            title={t('aiResearch.deepResearch.deleteResearch')}
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
  const { t } = useTranslation();
  const sections = Object.entries(reportContent);

  if (sections.length === 0 && phase !== 'synthesizing') {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-purple-500" />
        <p className="text-gray-500">
          {t('aiResearch.deepResearch.streaming.collecting')}
        </p>
        <p className="mt-1 text-sm text-gray-400">
          {t('aiResearch.deepResearch.streaming.executing')}
        </p>
      </div>
    );
  }

  return (
    <div className="prose prose-purple max-w-none">
      {sections.map(([section, content]) => (
        <div key={section} className="mb-8">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold text-gray-900">
            {getSectionIcon(section)}
            {getSectionTitle(section, t)}
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
  const { t } = useTranslation();
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
          {t('aiResearch.deepResearch.report.sourcesCount', {
            count: report.metadata.totalSources,
          })}
        </span>
        <span className="flex items-center gap-2 text-purple-700">
          <Search className="h-4 w-4" />
          {t('aiResearch.deepResearch.report.searchRounds', {
            count: report.metadata.searchRounds,
          })}
        </span>
        <span className="flex items-center gap-2 text-purple-700">
          <Clock className="h-4 w-4" />
          {t('aiResearch.deepResearch.report.duration', {
            duration: report.metadata.duration.toFixed(1),
          })}
        </span>
      </div>

      {/* Executive Summary */}
      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Sparkles className="h-5 w-5 text-purple-500" />
            {t('aiResearch.deepResearch.report.executiveSummary')}
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
            {t('aiResearch.deepResearch.report.conclusion')}
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
            {t('aiResearch.deepResearch.report.references')} (
            {report.references.length})
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
                              {t('aiResearch.deepResearch.report.clickToJump')}
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
  const { t } = useTranslation();
  return (
    <button
      onClick={() => onCopy(content, section)}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
    >
      {copied ? (
        <>
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          {t('aiResearch.deepResearch.copy.copied')}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {t('aiResearch.deepResearch.copy.copy')}
        </>
      )}
    </button>
  );
}

// ==================== Helpers ====================

type TranslateFunction = (
  key: string,
  params?: Record<string, string | number>
) => string;

function getPhaseLabel(phase: string, t: TranslateFunction): string {
  // Discussion phases fallback labels
  const discussionPhaseLabels: Record<string, string> = {
    ideation: '头脑风暴中...',
    execution: '搜索调研中...',
    findings: '汇报讨论中...',
    synthesis: '报告撰写中...',
    completed: '研究完成',
    error: '研究出错',
  };
  const key = `aiResearch.deepResearch.phase.${phase}`;
  return t(key) || discussionPhaseLabels[phase] || phase;
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

function getSectionTitle(section: string, t: TranslateFunction): string {
  if (section === 'executive_summary' || section.includes('摘要')) {
    return t('aiResearch.deepResearch.report.executiveSummary');
  }
  if (section === 'conclusion' || section.includes('结论')) {
    return t('aiResearch.deepResearch.report.conclusion');
  }
  return section;
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
  const { t } = useTranslation();
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
        title={`${t('aiResearch.deepResearch.report.clickToJump')} [${sourceIndex}]`}
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
              {t('aiResearch.deepResearch.report.clickToView')}
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

/**
 * Tab button for switching between Report and Ideas views
 */
function TabButton({
  active,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-purple-600 text-purple-600'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
      {badge != null && badge > 0 && (
        <span
          className={cn(
            'rounded-full px-1.5 py-0.5 text-xs font-semibold',
            active
              ? 'bg-purple-100 text-purple-700'
              : 'bg-gray-100 text-gray-600'
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

export default ResearchTab;
