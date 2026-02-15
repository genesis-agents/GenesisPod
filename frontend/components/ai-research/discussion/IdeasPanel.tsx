'use client';

/**
 * IdeasPanel - Research Ideas card grid with detail view
 *
 * Displays AI-extracted research ideas as structured cards.
 * Click a card to expand full detail view with description, tags, and actions.
 * Data source: ResearchIdea entities from the API (via useResearchIdeas hook).
 */

import { useState, useMemo } from 'react';
import {
  Crown,
  Search,
  BarChart3,
  PenLine,
  ShieldCheck,
  Lightbulb,
  Star,
  Archive,
  Play,
  Loader2,
  Sparkles,
  Target,
  MessageSquare,
  ChevronRight,
  X,
  Tag,
  Zap,
  TrendingUp,
  AlertTriangle,
  Compass,
  Layers,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { ResearchIdea } from '@/hooks/features/useResearchIdeas';

// ==================== Types ====================

interface IdeasPanelProps {
  ideas: ResearchIdea[];
  isLoading: boolean;
  isExtracting?: boolean;
  onUpdateIdea: (
    ideaId: string,
    data: { status?: 'DISCOVERED' | 'STARRED' | 'ARCHIVED' }
  ) => void;
  onGenerateDemo?: (ideaId: string) => void;
  onExtractIdeas?: (sessionId: string) => void;
  activeSessionId?: string | null;
  className?: string;
}

type FilterKey = 'all' | 'DISCOVERED' | 'STARRED' | 'ARCHIVED';

// ==================== Constants ====================

const ROLE_ICON: Record<string, LucideIcon> = {
  director: Crown,
  researcher: Search,
  analyst: BarChart3,
  writer: PenLine,
  reviewer: ShieldCheck,
};

const ROLE_COLORS: Record<
  string,
  { bg: string; text: string; border: string }
> = {
  director: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
  },
  researcher: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  analyst: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  writer: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  reviewer: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
};

const STATUS_CONFIG: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  DISCOVERED: {
    icon: Sparkles,
    label: '\u65b0\u53d1\u73b0',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  STARRED: {
    icon: Star,
    label: '\u5df2\u6536\u85cf',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  ARCHIVED: {
    icon: Archive,
    label: '\u5df2\u5f52\u6863',
    color: 'bg-gray-100 text-gray-500 border-gray-200',
  },
};

// Tag icon mapping for idea type tags
const TAG_ICON: Record<string, LucideIcon> = {
  '\u6280\u672f\u6d1e\u5bdf': Zap,
  '\u5e02\u573a\u673a\u4f1a': TrendingUp,
  '\u6218\u7565\u5efa\u8bae': Target,
  '\u98ce\u9669\u9884\u8b66': AlertTriangle,
  '\u7814\u7a76\u65b9\u5411': Compass,
  '\u8de8\u9886\u57df\u53d1\u73b0': Layers,
};

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '\u5168\u90e8' },
  { key: 'DISCOVERED', label: '\u65b0\u53d1\u73b0' },
  { key: 'STARRED', label: '\u5df2\u6536\u85cf' },
  { key: 'ARCHIVED', label: '\u5df2\u5f52\u6863' },
];

// ==================== Component ====================

export function IdeasPanel({
  ideas,
  isLoading,
  isExtracting = false,
  onUpdateIdea,
  onExtractIdeas,
  activeSessionId,
  className,
}: IdeasPanelProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredIdeas = useMemo(() => {
    if (filter === 'all') return ideas;
    return ideas.filter((idea) => idea.status === filter);
  }, [ideas, filter]);

  const stats = useMemo(() => {
    const discovered = ideas.filter((i) => i.status === 'DISCOVERED').length;
    const starred = ideas.filter((i) => i.status === 'STARRED').length;
    const withDemos = ideas.filter((i) => i.demos && i.demos.length > 0).length;
    return { total: ideas.length, discovered, starred, withDemos };
  }, [ideas]);

  const handleToggleStar = (idea: ResearchIdea) => {
    const newStatus = idea.status === 'STARRED' ? 'DISCOVERED' : 'STARRED';
    onUpdateIdea(idea.id, { status: newStatus });
  };

  const toggleExpand = (ideaId: string) => {
    setExpandedId((prev) => (prev === ideaId ? null : ideaId));
  };

  // Extracting state overlay
  if (isExtracting) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center py-16',
          className
        )}
      >
        <div className="mb-4 rounded-2xl bg-purple-50 p-5">
          <Loader2 className="h-10 w-10 animate-spin text-purple-500" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          AI \u6b63\u5728\u63d0\u70bc\u7814\u7a76\u521b\u610f...
        </h3>
        <p className="max-w-md text-center text-sm text-gray-500">
          \u5206\u6790\u591a Agent
          \u8ba8\u8bba\u5185\u5bb9\uff0c\u63d0\u70bc\u6709\u4ef7\u503c\u7684\u7814\u7a76\u6d1e\u5bdf\u548c\u521b\u65b0\u65b9\u5411
        </p>
      </div>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center py-16',
          className
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  // Empty state
  if (ideas.length === 0) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center py-16',
          className
        )}
      >
        <div className="mb-4 rounded-2xl bg-purple-50 p-4">
          <Lightbulb className="h-12 w-12 text-purple-500" />
        </div>
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          \u6682\u65e0\u7814\u7a76\u521b\u610f
        </h3>
        <p className="mb-6 max-w-md text-center text-sm text-gray-500">
          \u5f00\u59cb\u4e00\u6b21\u8ba8\u8bba\uff0c\u7136\u540e\u70b9\u51fb\u201c\u63d0\u53d6\u521b\u610f\u201d\u8ba9
          AI \u4ece\u8ba8\u8bba\u4e2d\u63d0\u70bc\u7814\u7a76\u6d1e\u5bdf
        </p>
        {activeSessionId && onExtractIdeas && (
          <button
            onClick={() => onExtractIdeas(activeSessionId)}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            <Sparkles className="h-4 w-4" />
            \u4ece\u6700\u8fd1\u8ba8\u8bba\u4e2d\u63d0\u53d6\u521b\u610f
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with stats */}
      <div className="rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-purple-100 p-2">
              <Target className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                \u7814\u7a76\u521b\u610f
              </h3>
              <p className="mt-1 text-sm text-gray-600">
                AI
                \u4ece\u8ba8\u8bba\u4e2d\u63d0\u70bc\u7684\u7814\u7a76\u6d1e\u5bdf\u548c\u521b\u65b0\u65b9\u5411
              </p>
            </div>
          </div>
          {activeSessionId && onExtractIdeas && (
            <button
              onClick={() => onExtractIdeas(activeSessionId)}
              disabled={isExtracting}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition-colors',
                isExtracting
                  ? 'cursor-not-allowed bg-purple-400'
                  : 'bg-purple-600 hover:bg-purple-700'
              )}
            >
              {isExtracting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isExtracting
                ? 'AI \u63d0\u53d6\u4e2d...'
                : '\u91cd\u65b0\u63d0\u53d6'}
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-3">
          <StatBadge
            icon={Lightbulb}
            label="\u603b\u521b\u610f"
            count={stats.total}
            color="purple"
          />
          <StatBadge
            icon={Star}
            label="\u5df2\u6536\u85cf"
            count={stats.starred}
            color="amber"
          />
          <StatBadge
            icon={Play}
            label="\u5df2\u751f\u6210\u6f14\u793a"
            count={stats.withDemos}
            color="blue"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {FILTER_TABS.map((tab) => {
          const count =
            tab.key === 'all'
              ? ideas.length
              : ideas.filter((i) => i.status === tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                filter === tab.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              )}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-gray-400">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Ideas List */}
      <div className="space-y-3">
        {filteredIdeas.map((idea) => (
          <IdeaCard
            key={idea.id}
            idea={idea}
            isExpanded={expandedId === idea.id}
            onToggleExpand={() => toggleExpand(idea.id)}
            onToggleStar={() => handleToggleStar(idea)}
            onArchive={() => onUpdateIdea(idea.id, { status: 'ARCHIVED' })}
          />
        ))}
      </div>

      {/* Filtered empty */}
      {filteredIdeas.length === 0 && ideas.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">
            \u6ca1\u6709\u7b26\u5408\u7b5b\u9009\u6761\u4ef6\u7684\u521b\u610f
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== Sub Components ====================

function IdeaCard({
  idea,
  isExpanded,
  onToggleExpand,
  onToggleStar,
  onArchive,
}: {
  idea: ResearchIdea;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleStar: () => void;
  onArchive: () => void;
}) {
  const RoleIcon = ROLE_ICON[idea.agentRole || ''] || Lightbulb;
  const roleColors = ROLE_COLORS[idea.agentRole || ''] || {
    bg: 'bg-gray-50',
    text: 'text-gray-700',
    border: 'border-gray-200',
  };
  const statusCfg = STATUS_CONFIG[idea.status] || STATUS_CONFIG.DISCOVERED;
  const StatusIcon = statusCfg.icon;
  const hasDemos = idea.demos && idea.demos.length > 0;

  // Find a type tag (first tag that matches TAG_ICON keys)
  const typeTag = idea.tags.find((t) => t in TAG_ICON);
  const TypeIcon = typeTag ? TAG_ICON[typeTag] : null;
  const otherTags = idea.tags.filter((t) => t !== typeTag);

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-white transition-all',
        idea.status === 'ARCHIVED'
          ? 'border-gray-200 opacity-60'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm',
        isExpanded && 'border-purple-200 shadow-md'
      )}
    >
      {/* Compact card header - always visible, clickable */}
      <button
        onClick={onToggleExpand}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        {/* Type icon */}
        <div
          className={cn(
            'mt-0.5 flex-shrink-0 rounded-lg border p-2',
            TypeIcon ? roleColors.bg : 'bg-gray-50',
            TypeIcon ? roleColors.border : 'border-gray-200'
          )}
        >
          {TypeIcon ? (
            <TypeIcon className={cn('h-4 w-4', roleColors.text)} />
          ) : (
            <Lightbulb className="h-4 w-4 text-gray-500" />
          )}
        </div>

        {/* Title + preview */}
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            {typeTag && (
              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {typeTag}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                statusCfg.color
              )}
            >
              <StatusIcon className="h-2.5 w-2.5" />
              {statusCfg.label}
            </span>
          </div>
          <h4 className="text-sm font-semibold leading-snug text-gray-900">
            {idea.title}
          </h4>
          {!isExpanded && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-500">
              {idea.description}
            </p>
          )}
        </div>

        {/* Expand chevron */}
        <ChevronRight
          className={cn(
            'mt-1 h-4 w-4 flex-shrink-0 text-gray-400 transition-transform',
            isExpanded && 'rotate-90'
          )}
        />
      </button>

      {/* Expanded detail view */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50/30">
          {/* Full description */}
          <div className="px-4 pb-3 pt-4">
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-700">
              {idea.description}
            </p>
          </div>

          {/* Tags */}
          {(otherTags.length > 0 || idea.agentName) && (
            <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
              {/* Agent source */}
              {idea.agentName && (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium',
                    roleColors.bg,
                    roleColors.text,
                    roleColors.border
                  )}
                >
                  <RoleIcon className="h-3 w-3" />
                  {idea.agentName}
                </span>
              )}

              {/* Domain tags */}
              {otherTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-600"
                >
                  <Tag className="h-3 w-3" />
                  {tag}
                </span>
              ))}

              {/* Demo count */}
              {hasDemos && (
                <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                  <Play className="h-3 w-3" />
                  {idea.demos!.length} \u6f14\u793a
                </span>
              )}
            </div>
          )}

          {/* Actions bar */}
          <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleStar();
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                idea.status === 'STARRED'
                  ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <Star
                className="h-3.5 w-3.5"
                fill={idea.status === 'STARRED' ? 'currentColor' : 'none'}
              />
              {idea.status === 'STARRED'
                ? '\u5df2\u6536\u85cf'
                : '\u6536\u85cf'}
            </button>

            <button
              disabled
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-400"
              title="\u6f14\u793a\u751f\u6210\u529f\u80fd\u5f00\u53d1\u4e2d"
            >
              <Play className="h-3.5 w-3.5" />
              \u751f\u6210\u6f14\u793a\uff08\u5373\u5c06\u63a8\u51fa\uff09
            </button>

            <div className="flex-1" />

            {idea.status !== 'ARCHIVED' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive();
                }}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50"
              >
                <Archive className="h-3.5 w-3.5" />
                \u5f52\u6863
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
              className="rounded-lg border border-gray-200 bg-white p-1.5 text-gray-400 transition-colors hover:bg-gray-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatBadge({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: LucideIcon;
  label: string;
  count: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700',
    amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        colorMap[color] || colorMap.gray
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {count} {label}
    </span>
  );
}

export default IdeasPanel;
