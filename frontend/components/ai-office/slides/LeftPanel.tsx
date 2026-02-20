'use client';

/**
 * AI Slides V5.0 - Left Panel (AI Interaction Center)
 *
 * Contains:
 * - Header: "AI 修改助手" label + collapse toggle
 * - Quick command buttons (2x2 grid)
 * - Chat message list (flex-1, scrollable)
 * - Input area (fixed bottom)
 * - Action buttons: regenerate / save checkpoint / cancel
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Wrench,
  CheckCircle,
  BarChart3,
  RotateCcw,
  Save,
  Square,
  Send,
  ChevronLeft,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { useSlidesStore } from '@/stores';

// ============================================================================
// Types
// ============================================================================

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface QuickCommand {
  label: string;
  icon: React.ReactNode;
  message: string;
}

// ============================================================================
// Quick commands definition
// ============================================================================

const QUICK_COMMANDS: QuickCommand[] = [
  {
    label: '美化内容',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    message: '美化内容，优化当前页面的文字排版和视觉层次',
  },
  {
    label: '修复布局',
    icon: <Wrench className="h-3.5 w-3.5" />,
    message: '修复布局问题，确保元素对齐、间距合理、不溢出边界',
  },
  {
    label: '事实核查',
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    message: '检查当前页面内容的准确性，修正明显的事实错误',
  },
  {
    label: '全页优化',
    icon: <BarChart3 className="h-3.5 w-3.5" />,
    message: '全面优化当前页面，提升视觉表现、内容清晰度和整体质量',
  },
];

// ============================================================================
// TypingIndicator
// ============================================================================

function TypingIndicator() {
  return (
    <div className="mr-8 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
    </div>
  );
}

// ============================================================================
// LeftPanel
// ============================================================================

interface LeftPanelProps {
  className?: string;
  onCollapse?: () => void;
  onGenerate?: () => void;
  onCancel?: () => void;
  onCreateCheckpoint?: () => void;
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  onSendMessage: (msg: string) => void;
}

export function LeftPanel({
  className,
  onCollapse,
  onGenerate,
  onCancel,
  onCreateCheckpoint,
  chatMessages,
  chatLoading,
  onSendMessage,
}: LeftPanelProps) {
  const { generating } = useSlidesStore();

  const [inputValue, setInputValue] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, chatLoading]);

  const handleSend = useCallback(() => {
    const msg = inputValue.trim();
    if (!msg || chatLoading) return;
    setInputValue('');
    onSendMessage(msg);
  }, [inputValue, chatLoading, onSendMessage]);

  const handleQuickCommand = useCallback(
    (command: QuickCommand) => {
      if (chatLoading) return;
      onSendMessage(command.message);
    },
    [chatLoading, onSendMessage]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const canCancel = generating;

  return (
    <div
      className={cn(
        'flex h-full flex-col border-r border-slate-200 bg-white',
        className
      )}
    >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
        <span className="text-xs font-semibold text-slate-700">
          AI 修改助手
        </span>
        {onCollapse && (
          <button
            onClick={onCollapse}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            title="折叠面板"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Quick command grid */}
      <div className="grid flex-shrink-0 grid-cols-2 gap-1.5 border-b border-slate-100 p-2">
        {QUICK_COMMANDS.map((cmd) => (
          <button
            key={cmd.label}
            onClick={() => handleQuickCommand(cmd)}
            disabled={chatLoading}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-xs transition-colors',
              chatLoading
                ? 'cursor-not-allowed bg-slate-50 text-slate-300'
                : 'bg-white text-slate-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
            )}
          >
            {cmd.icon}
            <span>{cmd.label}</span>
          </button>
        ))}
      </div>

      {/* Message list */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {chatMessages.length === 0 && !chatLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-slate-400">
            <Sparkles className="h-6 w-6 text-slate-300" />
            <span>描述你想修改的内容，</span>
            <span>AI 将实时更新幻灯片</span>
          </div>
        ) : (
          <div className="space-y-2">
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm leading-relaxed',
                  msg.role === 'user'
                    ? 'ml-8 bg-blue-600 text-white'
                    : 'mr-8 border border-slate-200 bg-white text-slate-700'
                )}
              >
                {msg.content}
              </div>
            ))}
            {chatLoading && <TypingIndicator />}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 border-t border-slate-200 px-3 py-2">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="如：把第1页标题改为..."
            rows={2}
            disabled={chatLoading}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || chatLoading}
            className={cn(
              'self-end rounded-lg px-2.5 py-1.5 transition-colors',
              inputValue.trim() && !chatLoading
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400'
            )}
            title="发送"
          >
            {chatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Bottom action buttons */}
      <div className="flex-shrink-0 border-t border-slate-200 px-3 py-2">
        <div className="flex gap-1.5">
          <button
            onClick={onGenerate}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
            title="重新生成"
          >
            <RotateCcw className="h-3 w-3" />
            重新生成
          </button>
          <button
            onClick={onCreateCheckpoint}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 py-1.5 text-xs text-slate-600 transition-colors hover:bg-slate-50"
            title="保存节点"
          >
            <Save className="h-3 w-3" />
            保存节点
          </button>
          <button
            onClick={onCancel}
            disabled={!canCancel}
            className={cn(
              'flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs transition-colors',
              canCancel
                ? 'border-red-300 text-red-500 hover:bg-red-50'
                : 'cursor-not-allowed border-slate-200 text-slate-300'
            )}
            title="取消生成"
          >
            <Square className="h-3 w-3" />
            取消
          </button>
        </div>
      </div>
    </div>
  );
}

export default LeftPanel;
