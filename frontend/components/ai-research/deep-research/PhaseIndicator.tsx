'use client';

import { motion } from 'framer-motion';
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
    <div className="border-b border-gray-200 bg-white px-6 py-4">
      <div className="mx-auto flex max-w-4xl items-center justify-between">
        {PHASES.map((phase, index) => {
          const isCompleted = currentIndex > index;
          const isCurrent = currentIndex === index;
          const Icon = phase.icon;

          return (
            <div key={phase.key} className="flex flex-1 items-center">
              <div className="relative flex flex-col items-center gap-2">
                {/* Icon Circle */}
                <motion.div
                  className={cn(
                    'relative z-10 flex h-10 w-10 items-center justify-center rounded-full',
                    isCompleted && 'bg-green-500 text-white',
                    isCurrent &&
                      'bg-gradient-to-br from-purple-500 to-indigo-600 text-white',
                    !isCompleted && !isCurrent && 'bg-gray-200 text-gray-400'
                  )}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </motion.div>

                {/* Label */}
                <span
                  className={cn(
                    'whitespace-nowrap text-xs font-medium',
                    isCurrent && 'text-purple-600',
                    isCompleted && 'text-green-600',
                    !isCompleted && !isCurrent && 'text-gray-400'
                  )}
                >
                  {phase.label}
                </span>
              </div>

              {/* Connector Line */}
              {index < PHASES.length - 1 && (
                <div className="relative top-[-16px] mx-4 h-0.5 flex-1">
                  <div className="absolute inset-0 bg-gray-200" />
                  {isCompleted && (
                    <motion.div
                      className="absolute inset-0 bg-green-500"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      style={{ transformOrigin: 'left' }}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
