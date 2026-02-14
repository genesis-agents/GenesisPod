'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { DiscussionResearchState } from '@/hooks';
import { PhaseIndicator } from './PhaseIndicator';
import { AgentPanel } from './AgentPanel';
import { ChatMessage } from './ChatMessage';
import { PhaseTransition } from './PhaseTransition';

interface DiscussionChatProps {
  state: DiscussionResearchState;
  query: string;
  onStop: () => void;
  className?: string;
}

export function DiscussionChat({
  state,
  query,
  onStop,
  className,
}: DiscussionChatProps) {
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

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

  const showReportPanel =
    state.phase === 'synthesis' || state.phase === 'completed';

  return (
    <div className={cn('flex h-full flex-col bg-gray-50', className)}>
      {/* Phase Indicator */}
      <PhaseIndicator currentPhase={state.phase} />

      {/* Search Progress Bar */}
      {state.phase === 'execution' && state.searchProgress && (
        <div className="border-b border-blue-200 bg-blue-50 px-6 py-3">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
            <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-blue-900">
                {state.searchProgress.message}
              </p>
              <div className="mt-1 h-1.5 w-full rounded-full bg-blue-200">
                <motion.div
                  className="h-1.5 rounded-full bg-blue-600"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${state.searchProgress.totalRounds > 0 ? (state.searchProgress.currentRound / state.searchProgress.totalRounds) * 100 : 0}%`,
                  }}
                  transition={{ duration: 0.5 }}
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

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Agent Panel */}
        <AgentPanel
          messages={state.messages}
          typingAgent={state.typingAgent}
          directions={state.directions}
          currentPhase={state.phase}
        />

        {/* Chat Messages */}
        <div
          className="flex-1 overflow-y-auto px-6 py-4"
          onScroll={handleScroll}
        >
          <div className="mx-auto max-w-4xl">
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
              <motion.div
                className="my-4 flex items-center gap-2 text-sm text-gray-500"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{state.typingAgent.name} 正在思考...</span>
              </motion.div>
            )}

            <div ref={chatEndRef} />
          </div>
        </div>

        {/* Report Panel (Synthesis Phase) */}
        <AnimatePresence>
          {showReportPanel && (
            <motion.div
              className="w-[400px] overflow-y-auto border-l border-gray-200 bg-white"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="p-6">
                <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-gray-900">
                  <span>研究报告</span>
                  {state.phase === 'synthesis' && (
                    <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
                  )}
                </h3>

                {/* Report Content */}
                {state.report ? (
                  <div className="space-y-6">
                    <div>
                      <h4 className="mb-2 text-sm font-semibold text-gray-900">
                        执行摘要
                      </h4>
                      <div className="prose prose-sm whitespace-pre-wrap text-gray-700">
                        {state.report.executiveSummary}
                      </div>
                    </div>

                    {state.report.sections.map((section, index) => (
                      <div key={index}>
                        <h5 className="mb-2 text-sm font-semibold text-gray-900">
                          {section.title}
                        </h5>
                        <div className="prose prose-sm whitespace-pre-wrap text-gray-700">
                          {section.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  // Streaming Report Content
                  <div className="space-y-4">
                    {Object.entries(state.reportContent).map(
                      ([section, content]) => (
                        <div key={section}>
                          <h5 className="mb-2 text-sm font-semibold text-gray-900">
                            {section}
                          </h5>
                          <div className="prose prose-sm relative whitespace-pre-wrap text-gray-700">
                            {content}
                            {state.phase === 'synthesis' && (
                              <motion.span
                                className="ml-0.5 inline-block h-4 w-1 bg-purple-600"
                                animate={{ opacity: [1, 0, 1] }}
                                transition={{ repeat: Infinity, duration: 1 }}
                              />
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Banner */}
      {state.error && (
        <div className="border-t border-red-200 bg-red-50 px-6 py-3">
          <div className="mx-auto flex max-w-4xl items-center gap-3">
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
