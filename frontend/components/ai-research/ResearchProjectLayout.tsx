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

import React, { useState, useCallback, useEffect } from 'react';
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
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useTranslation } from '@/lib/i18n';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';
import { useDiscussionResearch } from '@/hooks';
import { useResearchIdeas } from '@/hooks/features/useResearchIdeas';
import { useResearchDemos } from '@/hooks/features/useResearchDemos';
import type { ResearchSession } from './types';
import { AgentPanel } from './discussion/AgentPanel';
import { DiscussionChat } from './discussion/DiscussionChat';
import { InsightsPanel } from './discussion/InsightsPanel';
import { IdeasPanel } from './discussion/IdeasPanel';
import { DemosPanel } from './discussion/DemosPanel';
import { ReportPanel } from './discussion/ReportPanel';

// ==================== Types ====================

interface ResearchProjectLayoutProps {
  projectId: string;
  projectName: string;
  projectDescription: string | null;
  onBack: () => void;
}

type TabKey = 'discussion' | 'insights' | 'ideas' | 'demos' | 'report';

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
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [sessions, setSessions] = useState<ResearchSession[]>([]);
  const [viewingSession, setViewingSession] = useState<ResearchSession | null>(
    null
  );
  const [query, setQuery] = useState('');
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [isExtractingInsights, setIsExtractingInsights] = useState(false);
  const [isExtractingIdeas, setIsExtractingIdeas] = useState(false);

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
  });

  // Load sessions from API
  useEffect(() => {
    const controller = new AbortController();

    async function loadSessions() {
      setLoadingSessions(true);
      try {
        const res = await fetch(
          `${config.apiBaseUrl}/api/v1/ai-studio/projects/${projectId}/deep-research/sessions`,
          { headers: { ...getAuthHeader() }, signal: controller.signal }
        );
        if (res.ok) {
          const result = await res.json();
          const raw = result?.data ?? result;
          const list = Array.isArray(raw) ? raw : (raw?.data ?? []);
          setSessions(list);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        logger.error('Failed to load research sessions:', err);
      } finally {
        if (!controller.signal.aborted) {
          setLoadingSessions(false);
        }
      }
    }
    loadSessions();

    return () => controller.abort();
  }, [projectId]);

  // Handlers for DiscussionChat
  const researchLanguage = locale === 'zh' ? 'zh-CN' : 'en-US';

  const handleStartResearch = useCallback(
    (q: string) => {
      setQuery(q);
      startResearch(q, { language: researchLanguage });
    },
    [startResearch, researchLanguage]
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
          if (viewingSession?.id === sessionId) {
            setViewingSession(null);
          }
        }
      } catch (err) {
        logger.error('Failed to delete session:', err);
      }
    },
    [projectId, viewingSession]
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

  const handleGenerateDemo = useCallback(
    (ideaId: string) => {
      void generateDemo(ideaId);
    },
    [generateDemo]
  );

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
                      : discussionState.messages
                  }
                  typingAgent={
                    viewingSession ? null : discussionState.typingAgent
                  }
                  directions={
                    viewingSession?.directions?.directions
                      ? viewingSession.directions.directions.map(
                          (d: { title: string }) => d.title
                        )
                      : discussionState.directions
                  }
                  currentPhase={
                    viewingSession
                      ? viewingSession.status === 'COMPLETED'
                        ? 'completed'
                        : 'idle'
                      : discussionState.phase
                  }
                  isActive={isSearching}
                  hasSession={sessions.length > 0 || !!viewingSession}
                  onStart={() => {
                    const q = query || projectName;
                    handleStartResearch(q);
                  }}
                  onContinue={() => {
                    const q = query || projectName;
                    handleStartResearch(q);
                  }}
                  onStop={stop}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-6">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
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
                    state={discussionState}
                    query={query}
                    isSearching={isSearching}
                    sessions={sessions}
                    onStartResearch={handleStartResearch}
                    onStop={stop}
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
