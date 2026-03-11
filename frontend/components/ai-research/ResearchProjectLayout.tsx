'use client';

/**
 * ResearchProjectLayout - Research project detail page layout
 *
 * Two-panel layout: Left TeamPanel (340px, collapsible) + Right Tab Content (flex-1)
 * Tabs: Discussion, Insights, Ideas, Demos, Report
 *
 * Manages: useDiscussionResearch SSE hook, session loading, tab state,
 * ideas/demos hooks, and coordination between all child components.
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  MessageSquare,
  Brain,
  Lightbulb,
  Play,
  FileText,
  Maximize2,
  Minimize2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useTranslation } from '@/lib/i18n';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useDiscussionResearch } from '@/hooks';
import { useResearchIdeas } from '@/hooks/features/useResearchIdeas';
import { useResearchDemos } from '@/hooks/features/useResearchDemos';
import { useIterativeResearch } from '@/hooks/features/useIterativeResearch';
import type { ResearchSession } from './types';
import { AgentPanel } from './discussion/AgentPanel';
import { DiscussionChat } from './discussion/DiscussionChat';
import { InsightsPanel } from './discussion/InsightsPanel';
import { IdeasPanel } from './discussion/IdeasPanel';
import { DemosPanel } from './discussion/DemosPanel';
import { ReportPanel } from './discussion/ReportPanel';
import { IterationTimeline } from './iteration/IterationTimeline';

// ==================== Types ====================

interface ResearchProjectLayoutProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  onBack: () => void;
}

type TabKey =
  | 'discussion'
  | 'insights'
  | 'ideas'
  | 'demos'
  | 'iterations'
  | 'report';

interface TabDefinition {
  key: TabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ==================== Component ====================

export function ResearchProjectLayout({
  projectId,
  projectName,
  projectDescription,
  onBack,
}: ResearchProjectLayoutProps) {
  const { t, locale } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabKey>('discussion');
  const [tabBadges, setTabBadges] = useState<Partial<Record<TabKey, boolean>>>(
    {}
  );
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [viewingSession, setViewingSession] = useState<ResearchSession | null>(
    null
  );
  const [query, setQuery] = useState('');
  const queryRef = useRef(query);
  queryRef.current = query;
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [isExtractingInsights, setIsExtractingInsights] = useState(false);
  const [isExtractingIdeas, setIsExtractingIdeas] = useState(false);

  // Ref for recovery poll interval cleanup
  const recoveryPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Insights (INSIGHT type) & Ideas (CREATIVE_IDEA type) hooks
  const {
    ideas: insights,
    isLoading: insightsLoading,
    updateIdea: updateInsight,
    extractIdeas: extractInsights,
  } = useResearchIdeas(projectId, 'INSIGHT');

  const {
    ideas: creativeIdeas,
    isLoading: ideasLoading,
    updateIdea: updateCreativeIdea,
    extractCreativeIdeas,
  } = useResearchIdeas(projectId, 'CREATIVE_IDEA');

  const {
    demos,
    isLoading: demosLoading,
    deleteDemo,
    generateDemo,
  } = useResearchDemos(projectId);

  // Iterative research hook
  const {
    state: iterativeState,
    startResearch: startIterativeResearch,
    stop: stopIterative,
    isActive: isIterating,
    sendFeedback,
  } = useIterativeResearch(projectId, {
    onComplete: ({ report, sessionId }) => {
      const newSession: ResearchSession = {
        id: sessionId,
        query: queryRef.current,
        status: 'COMPLETED',
        report,
        discussion: [],
        directions: null,
        sourcesUsed: report.metadata.totalSources,
        tokensUsed: 0,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      setSessions((prev) => [newSession, ...prev]);
      setViewingSession(newSession);
      setActiveTab('report');
      // Reload sessions to get the full data
      void reloadSessions();
    },
    onError: (error) => {
      logger.error('Iterative Research error:', error);
    },
    onIterationUpdate: () => {
      // Don't auto-switch tabs - use badges instead (B4)
      setTabBadges((prev) => ({ ...prev, iterations: true }));
    },
    onIterationExit: (data) => {
      logger.info(
        `Iterative research exited: ${data.reason}, score=${data.finalScore}`
      );
    },
  });

  // Reusable session loader
  const reloadSessions = useCallback(async () => {
    try {
      const res = await fetch(
        `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/deep-research/sessions`,
        { headers: { ...getAuthHeader() } }
      );
      if (res.ok) {
        const result = await res.json();
        const raw = result?.data ?? result;
        const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
        setSessions(list);
        return list as ResearchSession[];
      }
    } catch (err) {
      logger.error('Failed to reload sessions:', err);
    }
    return null;
  }, [projectId]);

  // Discussion research hook
  const {
    state: discussionState,
    startResearch,
    stop,
    isActive: isSearching,
  } = useDiscussionResearch(projectId, {
    onComplete: ({ report, sessionId, messages, directions }) => {
      // Create a session from the completed research
      // Uses messages/directions passed directly from the hook (via refs, always fresh)
      const newSession: ResearchSession = {
        id: sessionId,
        query: query,
        status: 'COMPLETED',
        report,
        discussion: messages.map((msg) => ({
          id: msg.id,
          agentRole: msg.agentRole,
          agentName: msg.agentName,
          agentIcon: msg.agentIcon,
          content: msg.content,
          phase: msg.phase,
          messageType: msg.messageType,
          metadata: msg.metadata,
          timestamp: msg.timestamp,
        })),
        directions:
          directions.length > 0
            ? {
                directions: directions.map((d) => ({
                  title: d,
                })),
              }
            : null,
        sourcesUsed: report.metadata.totalSources,
        tokensUsed: 0,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      };
      setSessions((prev) => [newSession, ...prev]);
      setViewingSession(newSession);
      setActiveTab('report');
    },
    onError: (error) => {
      logger.error('Discussion Research error:', error);
    },
    onStreamEndIncomplete: () => {
      // SSE stream ended without completion (server timeout or disconnect)
      // Backend may still be processing - poll for completed session
      logger.warn(
        'SSE stream ended without completion, starting recovery polling...'
      );
      // Clear any existing poll before starting a new one
      if (recoveryPollRef.current) {
        clearInterval(recoveryPollRef.current);
      }
      let attempts = 0;
      const maxAttempts = 90; // Poll for up to 15 minutes (10s * 90)
      const pollInterval = setInterval(async () => {
        attempts++;
        const reloaded = await reloadSessions();
        if (reloaded) {
          // Check if a new COMPLETED session appeared
          const completed = reloaded.find(
            (s) => s.status === 'COMPLETED' && s.report
          );
          if (completed) {
            clearInterval(pollInterval);
            setViewingSession(completed);
            setActiveTab('report');
            logger.info(
              'Recovery polling: found completed session',
              completed.id
            );
            return;
          }
        }
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          logger.warn('Recovery polling: gave up after max attempts');
        }
      }, 10000);
      recoveryPollRef.current = pollInterval;
    },
  });

  // Load sessions from API on mount
  useEffect(() => {
    setLoadingSessions(true);
    reloadSessions().finally(() => setLoadingSessions(false));
  }, [reloadSessions]);

  // Cleanup recovery poll interval on unmount
  useEffect(() => {
    return () => {
      if (recoveryPollRef.current) {
        clearInterval(recoveryPollRef.current);
      }
    };
  }, []);

  // Set tab badges based on iteration progress (B4)
  useEffect(() => {
    if (!isIterating || iterativeState.iterations.length === 0) return;
    const latest =
      iterativeState.iterations[iterativeState.iterations.length - 1];
    if (latest.ideas) {
      setTabBadges((prev) => ({ ...prev, ideas: true }));
    }
    if (latest.demo?.status === 'completed') {
      setTabBadges((prev) => ({ ...prev, demos: true }));
    }
  }, [iterativeState.iterations, isIterating]);

  // Handlers for DiscussionChat
  const researchLanguage = locale === 'zh' ? 'zh-CN' : 'en-US';

  const handleStartResearch = useCallback(
    (q: string, mode?: 'single' | 'iterative') => {
      setQuery(q);
      if (mode === 'iterative') {
        startIterativeResearch(q, {
          mode: 'iterative',
          language: researchLanguage,
          depth: 'standard',
        });
        // Stay on discussion tab so user can see the live conversation.
        // onIterationUpdate will switch to iterations tab after the first round.
        setActiveTab('discussion');
      } else {
        startResearch(q, { language: researchLanguage });
      }
    },
    [startResearch, startIterativeResearch, researchLanguage]
  );

  const handleViewSession = useCallback((session: ResearchSession) => {
    setViewingSession(session);
  }, []);

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/deep-research/sessions/${sessionId}`,
          { method: 'DELETE', headers: { ...getAuthHeader() } }
        );
        if (res.ok) {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          setViewingSession((prev) => (prev?.id === sessionId ? null : prev));
        }
      } catch (err) {
        logger.error('Failed to delete session:', err);
      }
    },
    [projectId]
  );

  const handleBackToList = useCallback(() => {
    setViewingSession(null);
  }, []);

  // Insights/Ideas/Demos handlers
  const handleUpdateInsight = useCallback(
    (
      ideaId: string,
      data: { status?: 'DISCOVERED' | 'STARRED' | 'ARCHIVED' }
    ) => {
      void updateInsight(ideaId, data);
    },
    [updateInsight]
  );

  const handleUpdateCreativeIdea = useCallback(
    (
      ideaId: string,
      data: { status?: 'DISCOVERED' | 'STARRED' | 'ARCHIVED' }
    ) => {
      void updateCreativeIdea(ideaId, data);
    },
    [updateCreativeIdea]
  );

  const handleDeleteDemo = useCallback(
    (demoId: string) => {
      void deleteDemo(demoId);
    },
    [deleteDemo]
  );

  const handleExtractInsights = useCallback(
    async (sessionId: string) => {
      setIsExtractingInsights(true);
      try {
        await extractInsights(sessionId);
      } catch (err) {
        logger.error('Failed to extract insights:', err);
      } finally {
        setIsExtractingInsights(false);
      }
    },
    [extractInsights]
  );

  const handleExtractCreativeIdeas = useCallback(async () => {
    setIsExtractingIdeas(true);
    try {
      await extractCreativeIdeas();
    } catch (err) {
      logger.error('Failed to extract creative ideas:', err);
    } finally {
      setIsExtractingIdeas(false);
    }
  }, [extractCreativeIdeas]);

  const [generatingIdeaId, setGeneratingIdeaId] = useState<string | null>(null);

  // Use ref to access latest demos without adding it to useCallback deps
  // (demos changes every 5s during polling, which would cause unnecessary re-renders)
  const demosRef = useRef(demos);
  useEffect(() => {
    demosRef.current = demos;
  }, [demos]);

  const handleGenerateDemo = useCallback(
    async (ideaId: string) => {
      // Prevent duplicate: check if there's already a PENDING/GENERATING demo for this idea
      const hasPending = demosRef.current.some(
        (d) =>
          d.ideaId === ideaId &&
          (d.status === 'PENDING' || d.status === 'GENERATING')
      );
      if (hasPending) {
        setActiveTab('demos');
        return;
      }

      setGeneratingIdeaId(ideaId);
      try {
        const demo = await generateDemo(ideaId);
        if (demo) {
          setActiveTab('demos');
        }
      } finally {
        setGeneratingIdeaId(null);
      }
    },
    [generateDemo, setActiveTab]
  );

  // Tab click handler - clears badge on click
  const handleTabClick = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setTabBadges((prev) => ({ ...prev, [tab]: false }));
  }, []);

  // Toggle left panel
  const toggleLeftPanel = useCallback(() => {
    setLeftPanelCollapsed((prev) => !prev);
  }, []);

  // Get the active session for ideas extraction
  const activeSessionId =
    viewingSession?.id || (sessions.length > 0 ? sessions[0].id : null);

  // Get current report
  const currentReport = viewingSession?.report || null;
  const currentSessionId = viewingSession?.id || null;

  // Tab definitions
  const TABS: TabDefinition[] = [
    {
      key: 'discussion',
      label: t('aiResearch.tabs.discussion') || '讨论',
      icon: MessageSquare,
    },
    {
      key: 'insights',
      label: t('aiResearch.tabs.insights') || '观点荟萃',
      icon: Brain,
    },
    {
      key: 'ideas',
      label: t('aiResearch.tabs.ideas') || '研究创意',
      icon: Lightbulb,
    },
    {
      key: 'demos',
      label: t('aiResearch.tabs.demos') || '演示',
      icon: Play,
    },
    {
      key: 'iterations',
      label: t('aiResearch.tabs.iterations') || '迭代',
      icon: RefreshCw,
    },
    {
      key: 'report',
      label: t('aiResearch.tabs.report') || '报告',
      icon: FileText,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <button
            onClick={onBack}
            className="flex-shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100"
            title={t('common.back') || '返回'}
          >
            <ArrowLeft className="h-5 w-5 text-gray-500" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-gray-900">
              {projectName}
            </h1>
            {projectDescription && (
              <p className="truncate text-sm text-gray-500">
                {projectDescription}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content: Left Panel + Right Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel: Team (collapsible, AI Insights pattern) */}
        <div
          className={cn(
            'flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-300',
            leftPanelCollapsed ? 'w-12' : 'w-[340px]'
          )}
        >
          {leftPanelCollapsed ? (
            <div className="flex h-full flex-col items-center py-4">
              <button
                onClick={toggleLeftPanel}
                className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                title={t('common.expand') || '展开'}
              >
                <Maximize2 className="h-5 w-5" />
              </button>
              <div className="mt-4 flex flex-col items-center gap-2">
                <span
                  className="text-xs text-gray-500"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  {t('aiResearch.layout.researchTeam') || '研究团队'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t('aiResearch.layout.researchTeam') || '研究团队'}
                </span>
                <button
                  onClick={toggleLeftPanel}
                  className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title={t('common.collapse') || '收起'}
                >
                  <Minimize2 className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <AgentPanel
                  messages={
                    viewingSession?.discussion
                      ? (viewingSession.discussion as unknown as import('@/hooks').DiscussionMessage[])
                      : isIterating
                        ? iterativeState.discussion.messages
                        : discussionState.messages
                  }
                  typingAgent={
                    viewingSession
                      ? null
                      : isIterating
                        ? iterativeState.discussion.typingAgent
                        : discussionState.typingAgent
                  }
                  directions={
                    viewingSession?.directions?.directions
                      ? viewingSession.directions.directions.map(
                          (d: { title: string }) => d.title
                        )
                      : isIterating
                        ? iterativeState.discussion.directions
                        : discussionState.directions
                  }
                  currentPhase={
                    viewingSession
                      ? viewingSession.status === 'COMPLETED'
                        ? 'completed'
                        : 'idle'
                      : isIterating
                        ? iterativeState.discussion.phase
                        : discussionState.phase
                  }
                  isActive={isSearching || isIterating}
                  hasSession={sessions.length > 0 || !!viewingSession}
                  onStart={() => {
                    const q = query || projectName;
                    handleStartResearch(q);
                  }}
                  onContinue={() => {
                    const q = query || projectName;
                    handleStartResearch(q);
                  }}
                  onStop={isIterating ? stopIterative : stop}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab Bar */}
          <div
            className="flex items-center gap-1 border-b border-gray-200 bg-white px-6"
            role="tablist"
            aria-label="Research tabs"
          >
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => handleTabClick(tab.key)}
                  className={cn(
                    'relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {isActive && (
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />
                  )}
                  {tabBadges[tab.key] && !isActive && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {loadingSessions ? (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
              </div>
            ) : (
              <>
                {/* Discussion Tab */}
                {activeTab === 'discussion' && (
                  <DiscussionChat
                    state={
                      isIterating ? iterativeState.discussion : discussionState
                    }
                    query={query}
                    isSearching={isSearching || isIterating}
                    isIterating={isIterating}
                    onSendFeedback={sendFeedback}
                    awaitingFeedback={
                      isIterating ? iterativeState.awaitingFeedback : null
                    }
                    sessions={sessions}
                    onStartResearch={handleStartResearch}
                    onStop={isIterating ? stopIterative : stop}
                    onViewSession={handleViewSession}
                    onDeleteSession={handleDeleteSession}
                    viewingSession={viewingSession}
                    onBackToList={handleBackToList}
                    className="h-full"
                  />
                )}

                {/* Insights Tab */}
                {activeTab === 'insights' && (
                  <div className="h-full overflow-y-auto">
                    <div className="mx-auto max-w-4xl p-6">
                      <InsightsPanel
                        ideas={insights}
                        isLoading={insightsLoading}
                        isExtracting={isExtractingInsights}
                        onUpdateIdea={handleUpdateInsight}
                        onExtractIdeas={handleExtractInsights}
                        activeSessionId={activeSessionId}
                      />
                    </div>
                  </div>
                )}

                {/* Ideas Tab */}
                {activeTab === 'ideas' && (
                  <div className="h-full overflow-y-auto">
                    <div className="mx-auto max-w-4xl p-6">
                      <IdeasPanel
                        ideas={creativeIdeas}
                        isLoading={ideasLoading}
                        isExtracting={isExtractingIdeas}
                        onUpdateIdea={handleUpdateCreativeIdea}
                        onExtractCreativeIdeas={handleExtractCreativeIdeas}
                        onGenerateDemo={handleGenerateDemo}
                        generatingIdeaId={generatingIdeaId}
                        demos={demos}
                      />
                    </div>
                  </div>
                )}

                {/* Demos Tab */}
                {activeTab === 'demos' && (
                  <div className="h-full overflow-y-auto">
                    <div className="mx-auto max-w-4xl p-6">
                      <DemosPanel
                        projectId={projectId}
                        demos={demos}
                        onDeleteDemo={handleDeleteDemo}
                        isLoading={demosLoading}
                      />
                    </div>
                  </div>
                )}

                {/* Iterations Tab */}
                {activeTab === 'iterations' && (
                  <div className="h-full overflow-y-auto">
                    <div className="mx-auto max-w-5xl p-6">
                      {iterativeState.iterations.length > 0 ? (
                        <IterationTimeline
                          iterations={iterativeState.iterations}
                          currentRound={iterativeState.currentRound}
                          exitReason={iterativeState.exitReason}
                          finalScore={iterativeState.finalScore}
                          isActive={isIterating}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-gray-500">
                          <RefreshCw className="mb-4 h-12 w-12 text-gray-300" />
                          <p className="text-lg font-medium">
                            {t('aiResearch.iterations.empty') || '暂无迭代记录'}
                          </p>
                          <p className="mt-2 text-sm text-gray-400">
                            {t('aiResearch.iterations.emptyHint') ||
                              '使用迭代模式启动研究以查看自动优化过程'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Report Tab */}
                {activeTab === 'report' && (
                  <div className="h-full overflow-y-auto">
                    <div className="mx-auto max-w-4xl p-6">
                      <ReportPanel
                        report={currentReport || null}
                        projectId={projectId}
                        sessionId={currentSessionId}
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ResearchProjectLayout;
