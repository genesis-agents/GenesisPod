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
    quality_met: 'Quality threshold reached',
    budget_exhausted: 'Maximum iterations reached',
    no_gaps: 'All gaps resolved',
    information_saturated: 'Information saturated',
    converged: 'Score converged',
    completed: 'Research completed',
    user_stopped: 'Stopped by user',
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
    <div className="flex flex-col gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
      <div className="flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-blue-400" />
        <span className="text-xs font-semibold text-blue-400">Data Layer</span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">
            {research.newSources}
          </span>{' '}
          sources
        </span>
        <span>
          <span className="font-medium text-foreground">
            {Math.round(research.informationGain * 100)}%
          </span>{' '}
          gain
        </span>
        <span>
          <span className="font-medium text-foreground">
            {research.queries.length}
          </span>{' '}
          queries
        </span>
      </div>

      {isExpanded && research.queries.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {research.queries.slice(0, 3).map((q, i) => (
            <p
              key={i}
              className="truncate rounded bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300"
              title={q}
            >
              {q}
            </p>
          ))}
          {research.queries.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{research.queries.length - 3} more
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
    <div className="flex flex-col gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
      <div className="flex items-center gap-1.5">
        <Lightbulb className="h-3.5 w-3.5 text-purple-400" />
        <span className="text-xs font-semibold text-purple-400">
          Cognitive Layer
        </span>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground">
            {isInit ? '' : '+'}
            {newInsightsCount}
          </span>{' '}
          insights
        </span>
        <span>
          <span className="font-medium text-foreground">
            {isInit ? '' : '+'}
            {newCreativeCount}
          </span>{' '}
          creative
        </span>
      </div>

      {isExpanded && displayItems.length > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {displayItems.slice(0, 3).map((item, i) => (
            <p
              key={i}
              className="truncate rounded bg-purple-500/10 px-2 py-0.5 text-xs text-purple-300"
              title={item.title}
            >
              {item.title}
            </p>
          ))}
          {displayItems.length > 3 && (
            <p className="text-xs text-muted-foreground">
              +{displayItems.length - 3} more
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
    <div
      className={cn(
        'flex flex-col gap-2 rounded-lg border p-3',
        'border-green-500/20 bg-green-500/5'
      )}
    >
      <div className="flex items-center gap-1.5">
        <Code2 className="h-3.5 w-3.5 text-green-400" />
        <span className="text-xs font-semibold text-green-400">
          Product Layer
        </span>
        {isGenerating && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-green-400" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="mb-1 flex items-baseline gap-1">
            <span className={cn('text-sm font-bold', getScoreColor(score))}>
              {score.toFixed(1)}%
            </span>
            <span className="text-xs text-muted-foreground">score</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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
        <span className="font-medium text-foreground">{totalGaps}</span> gap
        {totalGaps !== 1 ? 's' : ''} identified
      </div>

      {isExpanded && totalGaps > 0 && (
        <div className="mt-1 flex flex-col gap-1">
          {gaps.dataGaps.slice(0, 2).map((g, i) => (
            <p
              key={`d-${i}`}
              className="truncate rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-300"
              title={g}
            >
              {g}
            </p>
          ))}
          {gaps.ideaGaps.slice(0, 2).map((g, i) => (
            <p
              key={`i-${i}`}
              className="truncate rounded bg-green-500/10 px-2 py-0.5 text-xs text-green-300"
              title={g}
            >
              {g}
            </p>
          ))}
          {totalGaps > 4 && (
            <p className="text-xs text-muted-foreground">
              +{totalGaps - 4} more
            </p>
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
            'flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold',
            isCurrent && isActive
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground'
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
              ? 'Round 0 — Initial Analysis'
              : `Round ${iteration.round} — Iteration`}
          </span>

          {showDelta && (
            <span
              className={cn(
                'flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium',
                delta >= 0
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-red-500/10 text-red-500'
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
            <div className="flex items-center justify-center rounded-lg border border-dashed border-blue-500/20 p-3">
              <span className="text-xs text-muted-foreground">
                No data collected
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
            <div className="flex items-center justify-center rounded-lg border border-dashed border-purple-500/20 p-3">
              <span className="text-xs text-muted-foreground">
                No ideas yet
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
              ? 'bg-green-500/10 text-green-500'
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
      <div className="flex flex-1 items-center gap-3 pb-2">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {formatExitReason(exitReason)}
          </p>
          {finalScore !== null && (
            <p className={cn('text-xs font-medium', getScoreColor(finalScore))}>
              Final score: {finalScore.toFixed(1)}%
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
        <p className="text-sm text-muted-foreground">
          Waiting for first iteration...
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">
          Iteration History
        </h3>
        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {iterations.length} round{iterations.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Score progression summary */}
      {iterations.length > 1 && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Score progression</span>
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
                    title={`Round ${iter.round}: ${iter.score.toFixed(1)}%`}
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
                Processing next iteration...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
