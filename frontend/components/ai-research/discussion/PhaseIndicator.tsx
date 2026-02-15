'use client';

/**
 * PhaseIndicator - Research phase progress bar
 *
 * Layout: badge ── line ── badge ── line ── badge ── line ── badge
 * Connectors are fixed-width, badges are flex-shrink-0.
 */

import {
  Lightbulb,
  Search,
  MessageSquare,
  FileText,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { DiscussionPhase } from '@/hooks';

interface PhaseIndicatorProps {
  currentPhase: DiscussionPhase;
}

const PHASES = [
  { key: 'ideation', label: '创意构思', icon: Lightbulb },
  { key: 'execution', label: '深度搜索', icon: Search },
  { key: 'findings', label: '发现交叉', icon: MessageSquare },
  { key: 'synthesis', label: '综合成稿', icon: FileText },
] as const;

const PHASE_ORDER: Record<string, number> = {
  idle: -1,
  ideation: 0,
  execution: 1,
  findings: 2,
  synthesis: 3,
  completed: 4,
  error: -1,
};

export function PhaseIndicator({ currentPhase }: PhaseIndicatorProps) {
  const currentIndex = PHASE_ORDER[currentPhase] ?? -1;

  return (
    <div className="flex-shrink-0 border-b border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center">
        {PHASES.map((phase, index) => {
          const isCompleted = currentIndex > index;
          const isCurrent = currentIndex === index;
          const isPending = !isCompleted && !isCurrent;
          const Icon = phase.icon;

          // Connector fills between completed phases
          const connectorFilled = currentIndex > index;
          const connectorHalf = currentIndex === index;

          return (
            <div key={phase.key} className="contents">
              {/* Connector line (between badges) */}
              {index > 0 && (
                <div className="relative mx-1 h-0.5 flex-1">
                  <div className="absolute inset-0 rounded-full bg-gray-200" />
                  {connectorFilled && (
                    <div className="absolute inset-0 rounded-full bg-green-400 transition-all duration-500" />
                  )}
                  {connectorHalf && (
                    <div className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-amber-300 transition-all duration-500" />
                  )}
                </div>
              )}

              {/* Phase badge + label */}
              <div className="flex flex-shrink-0 items-center gap-1.5">
                <div
                  className={cn(
                    'relative flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-all duration-300',
                    isCompleted && 'bg-green-500 text-white',
                    isCurrent && 'bg-amber-400 text-white',
                    isPending && 'bg-gray-200 text-gray-400'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    <Icon className="h-3.5 w-3.5" />
                  )}
                  {isCurrent && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-amber-300 opacity-30" />
                  )}
                </div>
                <span
                  className={cn(
                    'hidden whitespace-nowrap text-xs font-medium sm:inline',
                    isCompleted && 'text-green-600',
                    isCurrent && 'text-amber-600',
                    isPending && 'text-gray-400'
                  )}
                >
                  {phase.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
