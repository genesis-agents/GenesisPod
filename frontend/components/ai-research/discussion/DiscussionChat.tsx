'use client';

/**
 * DiscussionChat - Pure chat area for discussion-driven research
 *
 * Extracted from the original DiscussionChat: only the chat message stream,
 * search progress bar, and typing indicator. No embedded AgentPanel or
 * ReportPanel (those are in the outer ResearchProjectLayout).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2,
  AlertCircle,
  X,
  Search,
  Sparkles,
  History,
  Trash2,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { DiscussionResearchState } from '@/hooks';
import { PhaseIndicator } from './PhaseIndicator';
import { ChatMessage } from './ChatMessage';
import { PhaseTransition } from './PhaseTransition';
import ClientDate from '@/components/common/ClientDate';
import type { ResearchSession } from '../types';

// ==================== Types ====================

interface DiscussionChatProps {
  projectId: string;
  state: DiscussionResearchState;
  query: string;
  isSearching: boolean;
  sessions: ResearchSession[];
  onStartResearch: (query: string) => void;
  onStop: () => void;
  onViewSession: (session: ResearchSession) => void;
  onDeleteSession: (sessionId: string) => void | Promise<void>;
  viewingSession: ResearchSession | null;
  onBackToList: () => void;
  className?: string;
}

// ==================== Component ====================

export function DiscussionChat({
  projectId,
  state,
  query,
  isSearching,
  sessions,
  onStartResearch,
  onStop,
  onViewSession,
  onDeleteSession,
  viewingSession,
  onBackToList,
  className,
}: DiscussionChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Determine view mode
  const isResearching = isSearching && state.phase !== 'idle';
  const isViewingHistory = viewingSession !== null && !isResearching;
  const showList = !isResearching && !isViewingHistory;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [state.messages, state.typingAgent, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setAutoScroll(isNearBottom);
  };

  const handleSubmit = useCallback(() => {
    const trimmed = searchInput.trim();
    if (!trimmed || isSearching) return;
    setSearchInput('');
    onStartResearch(trimmed);
  }, [searchInput, isSearching, onStartResearch]);

  const handleDelete = useCallback(
    async (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (deletingId) return;
      setDeletingId(sessionId);
      try {
        await onDeleteSession(sessionId);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, onDeleteSession]
  );

  // ==================== List View ====================
  if (showList) {
    return (
      <div className={cn('flex h-full flex-col overflow-hidden', className)}>
        {/* Search Input */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-white px-6 py-4">
          <div className="mx-auto max-w-3xl">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="输入研究问题，开始多 Agent 讨论..."
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-12 pr-24 text-sm text-gray-900 placeholder-gray-500 transition-colors focus:border-purple-400 focus:outline-none focus:ring-2 focus:ring-purple-100"
              />
              <button
                onClick={handleSubmit}
                disabled={!searchInput.trim() || isSearching}
                className={cn(
                  'absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all',
                  searchInput.trim() && !isSearching
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : 'cursor-not-allowed bg-gray-100 text-gray-400'
                )}
              >
                <Sparkles className="h-4 w-4" />
                研究
              </button>
            </div>
          </div>
        </div>

        {/* Session History */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-100">
                  <Search className="h-8 w-8 text-purple-500" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-gray-900">
                  开始你的第一次研究
                </h3>
                <p className="max-w-md text-sm text-gray-500">
                  输入一个研究问题，AI
                  研究团队将展开多角度讨论，深度搜索并产出研究报告
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="mb-3 flex items-center gap-2 text-sm text-gray-500">
                  <History className="h-4 w-4" />
                  <span>历史研究 ({sessions.length})</span>
                </div>
                {sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => onViewSession(session)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-purple-200 hover:bg-purple-50/30"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-100">
                      <Search className="h-5 w-5 text-purple-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-medium text-gray-900">
                        {session.query}
                      </h4>
                      <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            session.status === 'COMPLETED'
                              ? 'bg-green-100 text-green-700'
                              : session.status === 'FAILED'
                                ? 'bg-red-100 text-red-700'
                                : 'bg-blue-100 text-blue-700'
                          )}
                        >
                          {session.status === 'COMPLETED'
                            ? '已完成'
                            : session.status === 'FAILED'
                              ? '失败'
                              : '进行中'}
                        </span>
                        <ClientDate
                          date={session.createdAt}
                          format="relative"
                        />
                        {session.sourcesUsed > 0 && (
                          <span>{session.sourcesUsed} 来源</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(session.id, e)}
                      disabled={deletingId === session.id}
                      className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      {deletingId === session.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </button>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== Viewing History ====================
  if (isViewingHistory && viewingSession) {
    const historyMessages = (viewingSession.discussion || []).map((msg) => ({
      ...msg,
      agentRole: msg.agentRole as import('@/hooks').DiscussionRole,
      phase: msg.phase as import('@/hooks').DiscussionPhase,
      messageType: msg.messageType as import('@/hooks').DiscussionMessageType,
      metadata: msg.metadata as import('@/hooks').DiscussionMessage['metadata'],
    }));

    return (
      <div className={cn('flex h-full flex-col overflow-hidden', className)}>
        {/* Back header */}
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button
            onClick={onBackToList}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-gray-900">
              {viewingSession.query}
            </h3>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <ClientDate date={viewingSession.createdAt} format="relative" />
              {viewingSession.sourcesUsed > 0 && (
                <span>{viewingSession.sourcesUsed} 来源</span>
              )}
            </div>
          </div>
        </div>

        {/* History messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mx-auto max-w-3xl">
            {historyMessages.map((message) => {
              if (message.messageType === 'system') {
                return (
                  <PhaseTransition
                    key={message.id}
                    phase={message.phase}
                    summary={message.content}
                    directions={message.metadata?.directions}
                  />
                );
              }
              return <ChatMessage key={message.id} message={message} />;
            })}
          </div>
        </div>
      </div>
    );
  }

  // ==================== Active Research View ====================
  return (
    <div className={cn('flex h-full flex-col overflow-hidden', className)}>
      {/* Phase Indicator - top bar (flex-shrink-0 keeps it fixed) */}
      <PhaseIndicator currentPhase={state.phase} />

      {/* Search Progress Bar */}
      {state.phase === 'execution' && state.searchProgress && (
        <div className="flex-shrink-0 border-b border-blue-200 bg-blue-50 px-6 py-2.5">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-600" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-blue-900">
                {state.searchProgress.message}
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-blue-200">
                <div
                  className="h-1.5 rounded-full bg-blue-600 transition-all duration-500"
                  style={{
                    width: `${state.searchProgress.totalRounds > 0 ? (state.searchProgress.currentRound / state.searchProgress.totalRounds) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <span className="text-xs font-medium text-blue-600">
              {state.searchProgress.currentRound}/
              {state.searchProgress.totalRounds}
            </span>
          </div>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4" onScroll={handleScroll}>
        <div className="mx-auto max-w-3xl">
          {/* Query Header */}
          <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">{query}</h2>
          </div>

          {/* Messages */}
          {state.messages.map((message) => {
            if (message.messageType === 'system') {
              return (
                <PhaseTransition
                  key={message.id}
                  phase={message.phase}
                  summary={message.content}
                  directions={message.metadata?.directions}
                />
              );
            }
            return <ChatMessage key={message.id} message={message} />;
          })}

          {/* Typing Indicator */}
          {state.typingAgent && (
            <div className="my-4 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{state.typingAgent.name} 正在思考...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Error Banner */}
      {state.error && (
        <div className="border-t border-red-200 bg-red-50 px-6 py-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0 text-red-600" />
            <p className="flex-1 text-sm text-red-800">{state.error}</p>
            <button
              onClick={onStop}
              className="flex-shrink-0 rounded p-1 transition-colors hover:bg-red-100"
            >
              <X className="h-4 w-4 text-red-600" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
