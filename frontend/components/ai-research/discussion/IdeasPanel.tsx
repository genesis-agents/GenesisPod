'use client';

/**
 * IdeasPanel - Research Ideas card grid
 *
 * Displays ideas extracted from discussion sessions as actionable cards.
 * Supports: status management, "Generate Demo" action, card grid layout.
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
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { ResearchIdea } from '@/hooks/features/useResearchIdeas';

// ==================== Types ====================

interface IdeasPanelProps {
  ideas: ResearchIdea[];
  isLoading: boolean;
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

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  director: { bg: 'bg-purple-100', text: 'text-purple-700' },
  researcher: { bg: 'bg-blue-100', text: 'text-blue-700' },
  analyst: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  writer: { bg: 'bg-amber-100', text: 'text-amber-700' },
  reviewer: { bg: 'bg-rose-100', text: 'text-rose-700' },
};

const STATUS_CONFIG: Record<
  string,
  { icon: LucideIcon; label: string; color: string }
> = {
  DISCOVERED: {
    icon: Sparkles,
    label: '新发现',
    color: 'bg-blue-50 text-blue-700',
  },
  STARRED: {
    icon: Star,
    label: '已收藏',
    color: 'bg-amber-50 text-amber-700',
  },
  ARCHIVED: {
    icon: Archive,
    label: '已归档',
    color: 'bg-gray-100 text-gray-500',
  },
};

const FILTER_TABS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'DISCOVERED', label: '新发现' },
  { key: 'STARRED', label: '已收藏' },
  { key: 'ARCHIVED', label: '已归档' },
];

// ==================== Component ====================

export function IdeasPanel({
  ideas,
  isLoading,
  onUpdateIdea,
  onExtractIdeas,
  activeSessionId,
  className,
}: IdeasPanelProps) {
  const [filter, setFilter] = useState<FilterKey>('all');

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
          暂无研究创意
        </h3>
        <p className="mb-6 max-w-md text-center text-sm text-gray-500">
          开始一次讨论，AI 团队将自动从讨论中提炼创意
        </p>
        {activeSessionId && onExtractIdeas && (
          <button
            onClick={() => onExtractIdeas(activeSessionId)}
            className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-purple-700"
          >
            <Sparkles className="h-4 w-4" />
            从最近讨论中提取创意
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
              <h3 className="font-semibold text-gray-900">研究创意</h3>
              <p className="mt-1 text-sm text-gray-600">
                从讨论中提炼的创意和研究方向
              </p>
            </div>
          </div>
          {activeSessionId && onExtractIdeas && (
            <button
              onClick={() => onExtractIdeas(activeSessionId)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-purple-700"
            >
              <Sparkles className="h-3.5 w-3.5" />
              提取创意
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 flex flex-wrap gap-3">
          <StatBadge
            icon={Lightbulb}
            label="总创意"
            count={stats.total}
            color="purple"
          />
          <StatBadge
            icon={Star}
            label="已收藏"
            count={stats.starred}
            color="amber"
          />
          <StatBadge
            icon={Play}
            label="已生成演示"
            count={stats.withDemos}
            color="blue"
          />
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {FILTER_TABS.map((tab) => (
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
            {tab.key !== 'all' && (
              <span className="ml-1.5 text-xs text-gray-400">
                {
                  ideas.filter((i) => tab.key === 'all' || i.status === tab.key)
                    .length
                }
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Ideas Card Grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {filteredIdeas.map((idea) => {
          const RoleIcon = ROLE_ICON[idea.agentRole || ''] || Lightbulb;
          const roleColors = ROLE_COLORS[idea.agentRole || ''] || {
            bg: 'bg-gray-100',
            text: 'text-gray-700',
          };
          const statusCfg =
            STATUS_CONFIG[idea.status] || STATUS_CONFIG.DISCOVERED;
          const StatusIcon = statusCfg.icon;
          const hasDemos = idea.demos && idea.demos.length > 0;
          return (
            <div
              key={idea.id}
              className={cn(
                'group overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md',
                idea.status === 'ARCHIVED'
                  ? 'border-gray-200 opacity-60'
                  : 'border-gray-200'
              )}
            >
              {/* Card Header */}
              <div className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h4 className="line-clamp-2 flex-1 text-sm font-semibold text-gray-900">
                    {idea.title}
                  </h4>
                  <button
                    onClick={() => handleToggleStar(idea)}
                    className={cn(
                      'flex-shrink-0 rounded p-1 transition-colors',
                      idea.status === 'STARRED'
                        ? 'text-amber-500 hover:text-amber-600'
                        : 'text-gray-300 hover:text-amber-400'
                    )}
                  >
                    <Star
                      className="h-4 w-4"
                      fill={idea.status === 'STARRED' ? 'currentColor' : 'none'}
                    />
                  </button>
                </div>

                <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-gray-600">
                  {idea.description}
                </p>

                {/* Tags row */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Agent role badge */}
                  {idea.agentRole && idea.agentName && (
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                        roleColors.bg,
                        roleColors.text
                      )}
                    >
                      <RoleIcon className="h-3 w-3" />
                      {idea.agentName}
                    </span>
                  )}

                  {/* Status badge */}
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                      statusCfg.color
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </span>

                  {/* Demo count */}
                  {hasDemos && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                      <Play className="h-3 w-3" />
                      {idea.demos!.length} 演示
                    </span>
                  )}
                </div>
              </div>

              {/* Card Actions */}
              <div className="flex items-center gap-2 border-t border-gray-100 bg-gray-50/50 px-4 py-2.5">
                <button
                  disabled
                  className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400"
                  title="演示生成功能开发中"
                >
                  <Play className="h-3.5 w-3.5" />
                  生成演示（即将推出）
                </button>

                {idea.status !== 'ARCHIVED' && (
                  <button
                    onClick={() =>
                      onUpdateIdea(idea.id, { status: 'ARCHIVED' })
                    }
                    className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                    title="归档"
                  >
                    <Archive className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filtered empty */}
      {filteredIdeas.length === 0 && ideas.length > 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-10 text-center">
          <MessageSquare className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 text-sm text-gray-500">没有符合筛选条件的创意</p>
        </div>
      )}
    </div>
  );
}

// ==================== Sub Components ====================

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
