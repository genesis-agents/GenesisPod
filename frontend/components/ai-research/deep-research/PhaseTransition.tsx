'use client';

import { motion } from 'framer-motion';
import { Lightbulb, Rocket, MessagesSquare, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type { DiscussionPhase } from '@/hooks';

interface PhaseTransitionProps {
  phase: DiscussionPhase;
  summary: string;
  directions?: string[];
}

const PHASE_CONFIG: Record<
  string,
  {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    gradient: string;
  }
> = {
  ideation: {
    icon: Lightbulb,
    label: '创意构思阶段',
    gradient: 'from-yellow-50 to-amber-50',
  },
  execution: {
    icon: Rocket,
    label: '深度搜索阶段',
    gradient: 'from-blue-50 to-indigo-50',
  },
  findings: {
    icon: MessagesSquare,
    label: '发现交叉阶段',
    gradient: 'from-purple-50 to-pink-50',
  },
  synthesis: {
    icon: BookOpen,
    label: '综合成稿阶段',
    gradient: 'from-green-50 to-emerald-50',
  },
};

export function PhaseTransition({
  phase,
  summary,
  directions,
}: PhaseTransitionProps) {
  const config = PHASE_CONFIG[phase];

  if (!config) {
    return null;
  }

  const Icon = config.icon;

  return (
    <motion.div
      className="my-8 flex justify-center"
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <div
        className={cn(
          'w-full max-w-2xl rounded-xl border-2 border-gray-200 bg-gradient-to-br p-6 shadow-lg',
          config.gradient
        )}
      >
        {/* Phase Icon and Label */}
        <div className="mb-4 flex items-center gap-3">
          <motion.div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-md"
            initial={{ rotate: -180, scale: 0 }}
            animate={{ rotate: 0, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <Icon className="h-6 w-6 text-purple-600" />
          </motion.div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">{config.label}</h3>
          </div>
        </div>

        {/* Summary */}
        <p className="mb-4 text-sm leading-relaxed text-gray-700">{summary}</p>

        {/* Research Directions */}
        {directions && directions.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-600">
              确定的研究方向
            </h4>
            <div className="space-y-2">
              {directions.map((direction, index) => (
                <motion.div
                  key={index}
                  className="flex items-start gap-2 rounded-lg bg-white p-3 shadow-sm"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                >
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="flex-1 pt-0.5 text-sm leading-snug text-gray-800">
                    {direction}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
