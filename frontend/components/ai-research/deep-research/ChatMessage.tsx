'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  DiscussionMessage,
  DiscussionMessageType,
  DiscussionRole,
} from '@/hooks';

interface ChatMessageProps {
  message: DiscussionMessage;
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  crown: Crown,
  search: Search,
  'bar-chart-3': BarChart3,
  'pen-line': PenLine,
  'shield-check': ShieldCheck,
  info: Info,
};

const ROLE_COLORS: Record<DiscussionRole, { bg: string; text: string }> = {
  director: { bg: 'bg-purple-500', text: 'text-purple-600' },
  researcher: { bg: 'bg-blue-500', text: 'text-blue-600' },
  analyst: { bg: 'bg-amber-500', text: 'text-amber-600' },
  writer: { bg: 'bg-green-500', text: 'text-green-600' },
  reviewer: { bg: 'bg-teal-500', text: 'text-teal-600' },
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
  layout?: 'bubble' | 'compact' | 'divider';
} {
  switch (messageType) {
    case 'critique':
      return {
        borderClass: 'border-l-4 border-amber-400',
        bgClass: 'bg-white',
        layout: 'bubble',
      };
    case 'cross_check':
    case 'synthesis':
      return {
        borderClass: 'border-l-4 border-purple-400',
        bgClass: 'bg-white',
        layout: 'bubble',
      };
    case 'draft':
    case 'review':
      return {
        borderClass: 'border-l-4 border-green-400',
        bgClass: 'bg-white',
        layout: 'bubble',
      };
    case 'status':
      return { bgClass: 'bg-gray-100', layout: 'compact' };
    case 'system':
      return {
        bgClass: 'bg-gray-50 border-y-2 border-dashed border-gray-300',
        layout: 'divider',
      };
    case 'findings':
    case 'proposal':
    case 'idea':
    default:
      return { bgClass: 'bg-white border border-gray-200', layout: 'bubble' };
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

  if (style.layout === 'divider') {
    return (
      <motion.div
        className="my-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className={cn('px-4 py-3 text-center', style.bgClass)}>
          <p className="text-sm font-medium text-gray-600">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  if (style.layout === 'compact') {
    return (
      <motion.div
        className="my-2"
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <div className={cn('rounded-md px-4 py-2', style.bgClass)}>
          <p className="text-xs text-gray-600">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="my-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
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
          {/* Agent Name + Timestamp */}
          <div className="mb-1 flex items-baseline gap-2">
            <span className={cn('text-sm font-semibold', colors.text)}>
              {message.agentName}
            </span>
            <span className="text-xs text-gray-400">
              {formatTimestamp(message.timestamp)}
            </span>
          </div>

          {/* Message Bubble */}
          <div
            className={cn(
              'rounded-lg p-4 shadow-sm',
              style.bgClass,
              style.borderClass
            )}
          >
            <div className="prose prose-sm max-w-none">
              <div className="whitespace-pre-wrap leading-relaxed text-gray-800">
                {message.content}
              </div>
            </div>
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

              <AnimatePresence>
                {sourcesExpanded && (
                  <motion.div
                    key="sources"
                    className="mt-2 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
