'use client';

/**
 * AI Slides V5.0 - Left Panel
 *
 * Contains:
 * - FileSummary (page count, file size)
 * - AISuggestions (smart suggestions)
 * - AI Slides / Chat tabs
 * - InputBox with ⊕ import button
 */

import React, { useState, useCallback } from 'react';
import { MessageSquare, Presentation } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { FileSummary } from './FileSummary';
import { AISuggestions } from './AISuggestions';
import { InputBox } from './InputBox';

type TabType = 'slides' | 'chat';

interface LeftPanelProps {
  // File summary props
  pageCount: number;
  fileSize?: string;

  // Suggestions
  onSuggestionExecute?: (suggestion: {
    id: string;
    action: string;
  }) => Promise<void>;

  // Input
  onSubmit: (message: string, mode: 'professional' | 'creative') => void;
  onImportClick: () => void;

  // Chat (optional, for future)
  chatMessages?: Array<{ role: string; content: string }>;

  // State
  loading?: boolean;
  disabled?: boolean;
  className?: string;
}

export function LeftPanel({
  pageCount,
  fileSize,
  onSuggestionExecute,
  onSubmit,
  onImportClick,
  chatMessages = [],
  loading = false,
  disabled = false,
  className,
}: LeftPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('slides');

  const handleSuggestionExecute = useCallback(
    async (suggestion: { id: string; action: string }) => {
      if (onSuggestionExecute) {
        await onSuggestionExecute(suggestion);
      }
    },
    [onSuggestionExecute]
  );

  return (
    <div
      className={cn(
        'flex h-full w-[340px] flex-shrink-0 flex-col border-r border-slate-200 bg-slate-50',
        className
      )}
    >
      {/* File Summary - only show when there are pages */}
      {pageCount > 0 && (
        <div className="flex-shrink-0 p-4 pb-2">
          <FileSummary pageCount={pageCount} fileSize={fileSize} />
        </div>
      )}

      {/* AI Suggestions - only show when there are pages */}
      {pageCount > 0 && (
        <div className="flex-shrink-0 px-4 pb-2">
          <AISuggestions
            onExecute={handleSuggestionExecute}
            disabled={disabled || loading}
          />
        </div>
      )}

      {/* Divider */}
      <div className="mx-4 my-2 border-t border-slate-200" />

      {/* Tab Switcher: AI Slides | Chat */}
      <div className="flex-shrink-0 px-4">
        <div className="flex rounded-lg bg-slate-200 p-1">
          <button
            onClick={() => setActiveTab('slides')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
              activeTab === 'slides'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <Presentation className="h-4 w-4" />
            AI Slides
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={cn(
              'flex flex-1 items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition-colors',
              activeTab === 'chat'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            )}
          >
            <MessageSquare className="h-4 w-4" />
            Chat
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'slides' ? (
          // AI Slides Tab - Input Box
          <div className="flex flex-1 flex-col justify-end p-4">
            <InputBox
              onSubmit={onSubmit}
              onImportClick={onImportClick}
              placeholder="输入您的需求..."
              disabled={disabled}
              loading={loading}
            />
          </div>
        ) : (
          // Chat Tab
          <div className="flex flex-1 flex-col p-4">
            {/* Chat messages area */}
            <div className="mb-4 flex-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
              {chatMessages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  输入消息与 Agent 对话
                </div>
              ) : (
                <div className="space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      className={cn(
                        'rounded-lg p-2 text-sm',
                        msg.role === 'user'
                          ? 'ml-8 bg-orange-100 text-orange-900'
                          : 'mr-8 bg-slate-100 text-slate-700'
                      )}
                    >
                      {msg.content}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Chat input */}
            <InputBox
              onSubmit={(message) => onSubmit(message, 'professional')}
              onImportClick={onImportClick}
              placeholder="@Agent 发送消息..."
              disabled={disabled}
              loading={loading}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default LeftPanel;
