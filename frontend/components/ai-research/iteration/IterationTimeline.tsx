'use client';

import { useState } from 'react';
import {
  Search,
  Lightbulb,
  Code2,
  TrendingUp,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { IterationRound } from '@/hooks/features/useIterativeResearch';

// ==================== Types ====================

export type { IterationRound };

export interface IterationTimelineProps {
  iterations: IterationRound[];
  currentRound: number;
  exitReason: string | null;
  finalScore: number | null;
  isActive: boolean;
  className?: string;
}

// ==================== Helpers ====================

function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-500';
  if (score >= 40) return 'text-yellow-500';
  return 'text-red-500';
}

function getScoreBgColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getScoreBorderColor(score: number): string {
  if (score >= 70) return 'border-green-500/30';
  if (score >= 40) return 'border-yellow-500/30';
  return 'border-red-500/30';
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)}%`;
}

function formatExitReason(reason: string): string {
  const map: Record<string, string> = {
    quality_met: '质量达标',
    budget_exhausted: '达到最大迭代次数',
    no_gaps: '所有差距已解决',
    information_saturated: '信息饱和',
    converged: '分数收敛',
    completed: '研究完成',
    user_stopped: '用户停止',
  };
  return map[reason] ?? reason;
}

// ==================== Sub-components ====================

interface DataLayerCardProps {
  research: NonNullable<IterationRound['research']>;
  isExpanded: boolean;
}

function DataLayerCard({ research, isExpanded }: DataLayerCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-blue-700" />
        <span className="text-xs font-semibold text-blue-700">数据层</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">
            {research.newSources}
          </span>{' '}
          来源
        </span>
        <span>
          <span className="font-medium text-foreground">
            {Math.round(research.informationGain * 100)}%
          </span>{' '}
          信息增益
        </span>
        <span>
          <span className="font-medium text-foreground">
            {research.queries.length}
          </span>{' '}
          搜索
        </span>
      </div>

      {isExpanded && research.queries.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {research.queries.slice(0, 3).map((q, i) => (
            <p
              key={i}
              className="flex items-center gap-1 truncate rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-800"
              title={q}
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0 text-blue-500" />
              {q}
            </p>
          ))}
          {research.queries.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{research.queries.length - 3} 条
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface CognitiveLayerCardProps {
  ideas: NonNullable<IterationRound['ideas']>;
  isExpanded: boolean;
  isInit: boolean;
}

function CognitiveLayerCard({
  ideas,
  isExpanded,
  isInit,
}: CognitiveLayerCardProps) {
  const newInsightsCount = isInit
    ? ideas.totalInsights
    : ideas.newInsights.length;
  const newCreativeCount = isInit
    ? ideas.totalCreativeIdeas
    : ideas.newCreativeIdeas.length;
  const displayItems = isInit
    ? ideas.newInsights
    : [...ideas.newInsights, ...ideas.newCreativeIdeas];

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-purple-200 bg-purple-50 p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-purple-700" />
        <span className="text-xs font-semibold text-purple-700">认知层</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">
            {isInit ? '' : '+'}
            {newInsightsCount}
          </span>{' '}
          洞察
        </span>
        <span>
          <span className="font-medium text-foreground">
            {isInit ? '' : '+'}
            {newCreativeCount}
          </span>{' '}
          创意
        </span>
      </div>

      {isExpanded && displayItems.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {displayItems.slice(0, 3).map((item, i) => (
            <p
              key={i}
              className="flex items-center gap-1 truncate rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-800"
              title={item.title}
            >
              <Lightbulb className="h-3 w-3 flex-shrink-0 text-purple-500" />
              {item.title}
            </p>
          ))}
          {displayItems.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{displayItems.length - 3} 条
            </p>
          )}
        </div>
      )}
    </div>
  );
}

interface ProductLayerCardProps {
  round: IterationRound;
  isExpanded: boolean;
}

function ProductLayerCard({ round, isExpanded }: ProductLayerCardProps) {
  const { score, gaps, demo } = round;
  const totalGaps = gaps.dataGaps.length + gaps.ideaGaps.length;
  const isGenerating = demo?.status === 'generating';

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 shadow-sm">
      <div className="flex items-center gap-1.5">
        <Code2 className="h-3.5 w-3.5 text-amber-700" />
        <span className="text-xs font-semibold text-amber-700">质量评估</span>
        {isGenerating && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-amber-600" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="mb-1 flex items-baseline gap-1">
            <span className={cn('text-sm font-bold', getScoreColor(score))}>
              {score.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">得分</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-amber-100">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                getScoreBgColor(score)
              )}
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{totalGaps}</span>{' '}
        个待改进项
      </div>

      {isExpanded && totalGaps > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {gaps.dataGaps.slice(0, 2).map((g, i) => (
            <p
              key={`d-${i}`}
              className="flex items-center gap-1 truncate rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
              title={g}
            >
              <AlertCircle className="h-3 w-3 flex-shrink-0 text-amber-600" />
              {g}
            </p>
          ))}
          {gaps.ideaGaps.slice(0, 2).map((g, i) => (
            <p
              key={`i-${i}`}
              className="flex items-center gap-1 truncate rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
              title={g}
            >
              <Lightbulb className="h-3 w-3 flex-shrink-0 text-amber-600" />
              {g}
            </p>
          ))}
          {totalGaps > 4 && (
            <p className="text-xs text-muted-foreground">+{totalGaps - 4} 条</p>
          )}
        </div>
      )}
    </div>
  );
}

// ==================== Round Row ====================

interface RoundRowProps {
  iteration: IterationRound;
  isCurrent: boolean;
  isLast: boolean;
  isActive: boolean;
  defaultExpanded: boolean;
}

function RoundRow({
  iteration,
  isCurrent,
  isLast,
  isActive,
  defaultExpanded,
}: RoundRowProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isInit = iteration.round === 0;
  const delta = iteration.score - iteration.previousScore;
  const showDelta = !isInit && Math.abs(delta) > 0.01;

  return (
    <div className="relative flex gap-4">
      {/* Timeline connector */}
      {!isLast && (
        <div className="absolute left-5 top-10 h-full w-px bg-border" />
      )}

      {/* Round badge */}
      <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-bold',
            isCurrent && isActive
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-foreground'
          )}
        >
          {isCurrent && isActive ? (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary-foreground opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary-foreground" />
            </span>
          ) : (
            iteration.round
          )}
        </div>
      </div>

      {/* Round content */}
      <div className="mb-6 min-w-0 flex-1">
        {/* Round header */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mb-3 flex w-full items-center gap-2 text-left"
        >
          <span className="text-sm font-semibold text-foreground">
            {isInit
              ? '第 0 轮 — 初始分析'
              : `第 ${iteration.round} 轮 — 迭代优化`}
          </span>

          {showDelta && (
            <span
              className={cn(
                'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                delta >= 0
                  ? 'bg-green-500/10 text-green-600'
                  : 'bg-red-500/10 text-red-600'
              )}
            >
              <TrendingUp
                className={cn('h-3 w-3', delta < 0 && 'rotate-180')}
              />
              {formatDelta(delta)}
            </span>
          )}

          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(iteration.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>

          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          )}
        </button>

        {/* Three-layer cards */}
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          {iteration.research ? (
            <DataLayerCard
              research={iteration.research}
              isExpanded={expanded}
            />
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-blue-200 p-3">
              <span className="text-xs text-muted-foreground">
                初始轮无搜索数据
              </span>
            </div>
          )}

          {iteration.ideas ? (
            <CognitiveLayerCard
              ideas={iteration.ideas}
              isExpanded={expanded}
              isInit={isInit}
            />
          ) : (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-purple-200 p-3">
              <span className="text-xs text-muted-foreground">
                暂无创意数据
              </span>
            </div>
          )}

          <ProductLayerCard round={iteration} isExpanded={expanded} />
        </div>
      </div>
    </div>
  );
}

// ==================== Exit Footer ====================

interface ExitFooterProps {
  exitReason: string;
  finalScore: number | null;
}

function ExitFooter({ exitReason, finalScore }: ExitFooterProps) {
  const isSuccess =
    exitReason === 'quality_met' ||
    exitReason === 'no_gaps' ||
    exitReason === 'completed';

  return (
    <div className="relative flex gap-4">
      {/* Badge */}
      <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            isSuccess
              ? 'bg-green-50 text-green-700'
              : 'bg-muted text-muted-foreground'
          )}
        >
          {isSuccess ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertCircle className="h-5 w-5" />
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex flex-1 items-center gap-3 rounded-lg border px-3 py-2',
          isSuccess
            ? 'border-green-200 bg-green-50'
            : 'border-border bg-muted/30'
        )}
      >
        <div>
          <p
            className={cn(
              'text-sm font-semibold',
              isSuccess ? 'text-green-800' : 'text-foreground'
            )}
          >
            {formatExitReason(exitReason)}
          </p>
          {finalScore !== null && (
            <p className={cn('text-xs font-medium', getScoreColor(finalScore))}>
              最终得分: {finalScore.toFixed(1)}%
            </p>
          )}
        </div>

        {finalScore !== null && (
          <div
            className={cn(
              'ml-auto flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold',
              getScoreColor(finalScore),
              getScoreBorderColor(finalScore)
            )}
          >
            {finalScore.toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== Main Component ====================

export function IterationTimeline({
  iterations,
  currentRound,
  exitReason,
  finalScore,
  isActive,
  className,
}: IterationTimelineProps) {
  if (iterations.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-2 py-12',
          className
        )}
      >
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">等待首轮迭代...</p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">迭代优化历程</h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {iterations.length} 轮
        </span>
      </div>

      {/* Score progression summary */}
      {iterations.length > 1 && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>分数趋势</span>
            <span>
              {iterations[0].score.toFixed(1)}% →{' '}
              {iterations[iterations.length - 1].score.toFixed(1)}%
            </span>
          </div>
          <div className="flex items-end gap-1" style={{ height: '32px' }}>
            {iterations.map((iter, i) => {
              const maxScore = Math.max(...iterations.map((it) => it.score), 1);
              const heightPct = (iter.score / maxScore) * 100;
              const isCurrent = iter.round === currentRound;
              return (
                <div
                  key={i}
                  className="flex flex-1 flex-col items-center justify-end"
                  style={{ height: '100%' }}
                >
                  <div
                    className={cn(
                      'w-full rounded-t transition-all duration-300',
                      isCurrent && isActive
                        ? 'bg-primary'
                        : getScoreBgColor(iter.score),
                      'opacity-80'
                    )}
                    style={{ height: `${heightPct}%`, minHeight: '4px' }}
                    title={`第 ${iter.round} 轮: ${iter.score.toFixed(1)}%`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex flex-col">
        {iterations.map((iteration, i) => {
          const isCurrent = iteration.round === currentRound;
          const isLastIteration = i === iterations.length - 1 && !exitReason;
          return (
            <RoundRow
              key={iteration.round}
              iteration={iteration}
              isCurrent={isCurrent}
              isLast={isLastIteration && !exitReason}
              isActive={isActive}
              defaultExpanded={isCurrent || i === iterations.length - 1}
            />
          );
        })}

        {/* Exit footer */}
        {exitReason && (
          <ExitFooter exitReason={exitReason} finalScore={finalScore} />
        )}

        {/* Active indicator when still running */}
        {isActive && !exitReason && (
          <div className="relative flex gap-4">
            <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
            <div className="flex flex-1 items-center pb-2">
              <p className="text-sm text-muted-foreground">
                正在处理下一轮迭代...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
