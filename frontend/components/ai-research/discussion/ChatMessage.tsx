'use client';

/**
 * ChatMessage - Discussion chat message bubble
 *
 * Features:
 * - Agent role color coding (icon + name)
 * - Message type styling (critique, synthesis, findings, etc.)
 * - AIMessageRenderer for Markdown content
 * - Expandable search source references
 */

import { useState } from 'react';
import {
  Crown,
  Search,
  BarChart3,
  PenLine,
  ShieldCheck,
  Info,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import AIMessageRenderer from '@/components/ui/AIMessageRenderer';
import type {
  DiscussionMessage,
  DiscussionMessageType,
  DiscussionRole,
} from '@/hooks';

interface ChatMessageProps {
  message: DiscussionMessage;
}

const ICON_MAP: Record<string, LucideIcon> = {
  crown: Crown,
  search: Search,
  'bar-chart-3': BarChart3,
  'pen-line': PenLine,
  'shield-check': ShieldCheck,
  info: Info,
};

const ROLE_COLORS: Record<
  DiscussionRole,
  { bg: string; text: string; border: string }
> = {
  director: {
    bg: 'bg-purple-500',
    text: 'text-purple-600',
    border: 'border-purple-400',
  },
  researcher: {
    bg: 'bg-blue-500',
    text: 'text-blue-600',
    border: 'border-blue-400',
  },
  analyst: {
    bg: 'bg-emerald-500',
    text: 'text-emerald-600',
    border: 'border-emerald-400',
  },
  writer: {
    bg: 'bg-amber-500',
    text: 'text-amber-600',
    border: 'border-amber-400',
  },
  reviewer: {
    bg: 'bg-rose-500',
    text: 'text-rose-600',
    border: 'border-rose-400',
  },
};

function formatTimestamp(timestamp: Date | string): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMessageStyle(messageType: DiscussionMessageType): {
  borderClass?: string;
  bgClass?: string;
  layout: 'bubble' | 'compact' | 'divider';
  accentIcon?: LucideIcon;
} {
  switch (messageType) {
    case 'critique':
      return {
        borderClass: 'border-l-4 border-amber-400',
        bgClass: 'bg-amber-50/40',
        layout: 'bubble',
        accentIcon: AlertTriangle,
      };
    case 'cross_check':
      return {
        borderClass: 'border-l-4 border-amber-400',
        bgClass: 'bg-white',
        layout: 'bubble',
        accentIcon: AlertTriangle,
      };
    case 'synthesis':
      return {
        borderClass: 'border-l-4 border-purple-400',
        bgClass: 'bg-purple-50/30',
        layout: 'bubble',
      };
    case 'draft':
    case 'review':
      return {
        borderClass: 'border-l-4 border-purple-400',
        bgClass: 'bg-white',
        layout: 'bubble',
      };
    case 'status':
      return { bgClass: 'bg-gray-100', layout: 'compact' };
    case 'system':
      return {
        bgClass: 'bg-gray-50 border-y border-dashed border-gray-300',
        layout: 'divider',
      };
    case 'findings':
      return {
        borderClass: 'border-l-4 border-blue-400',
        bgClass: 'bg-white border border-gray-100',
        layout: 'bubble',
      };
    case 'proposal':
    case 'idea':
    default:
      return {
        bgClass: 'bg-white border border-gray-100',
        layout: 'bubble',
      };
  }
}

export function ChatMessage({ message }: ChatMessageProps) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);
  const Icon = ICON_MAP[message.agentIcon] || Info;
  const colors = ROLE_COLORS[message.agentRole];
  const style = getMessageStyle(message.messageType);
  const hasSearchResults =
    message.metadata?.searchResults &&
    message.metadata.searchResults.length > 0;

  // System divider
  if (style.layout === 'divider') {
    return (
      <div className="my-6">
        <div className={cn('px-4 py-3 text-center', style.bgClass)}>
          <p className="text-sm font-medium text-gray-600">{message.content}</p>
        </div>
      </div>
    );
  }

  // Compact status message
  if (style.layout === 'compact') {
    return (
      <div className="my-2">
        <div className={cn('rounded-md px-4 py-2', style.bgClass)}>
          <p className="text-xs text-gray-600">{message.content}</p>
        </div>
      </div>
    );
  }

  // Full bubble message
  return (
    <div className="my-3">
      <div className="flex gap-3">
        {/* Agent Icon */}
        <div
          className={cn(
            'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-white',
            colors.bg
          )}
        >
          <Icon className="h-4 w-4" />
        </div>

        {/* Message Content */}
        <div className="min-w-0 flex-1">
          {/* Agent Name + Message Type + Timestamp */}
          <div className="mb-1 flex items-baseline gap-2">
            <span className={cn('text-sm font-semibold', colors.text)}>
              {message.agentName}
            </span>
            {style.accentIcon && (
              <style.accentIcon className="h-3 w-3 text-amber-500" />
            )}
            <span className="text-xs text-gray-400">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          {/* Message Bubble with Markdown */}
          <div
            className={cn(
              'rounded-lg p-4 shadow-sm',
              style.bgClass,
              style.borderClass
            )}
          >
            <AIMessageRenderer content={message.content} />
          </div>

          {/* Search Sources Footer */}
          {hasSearchResults && (
            <div className="mt-2">
              <button
                onClick={() => setSourcesExpanded(!sourcesExpanded)}
                className="flex items-center gap-1 text-xs text-gray-500 transition-colors hover:text-gray-700"
              >
                {sourcesExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
                <span>
                  {sourcesExpanded
                    ? '收起来源'
                    : `查看来源 (${message.metadata?.searchResults?.length ?? 0})`}
                </span>
              </button>

              {sourcesExpanded && (
                <div className="mt-2 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                  {(message.metadata?.searchResults ?? []).map(
                    (source, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-600">
                          {index + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            <span className="truncate">{source.title}</span>
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                          {source.snippet && (
                            <p className="mt-1 line-clamp-2 text-gray-600">
                              {source.snippet}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
