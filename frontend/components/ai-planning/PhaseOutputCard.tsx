'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import type { PlanPhaseStatus } from '@/lib/api/ai-planning';

interface PhaseOutputCardProps {
  phase: number;
  phaseKey: string;
  status: PlanPhaseStatus;
}

export default function PhaseOutputCard({
  phase,
  phaseKey,
  status,
}: PhaseOutputCardProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const isCompleted = status.status === 'completed';
  const isActive = status.status === 'active';

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        isCompleted
          ? 'border-green-200 bg-green-50/50'
          : isActive
            ? 'border-amber-200 bg-amber-50/50'
            : 'border-gray-100 bg-gray-50/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
              isCompleted
                ? 'bg-green-500 text-white'
                : isActive
                  ? 'bg-amber-400 text-white'
                  : 'bg-gray-200 text-gray-400'
            }`}
          >
            {isCompleted ? (
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              phase
            )}
          </span>
          <span className="text-sm font-medium text-gray-700">
            {t(`aiPlanning.phases.${phaseKey}`)}
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            isCompleted
              ? 'bg-green-100 text-green-700'
              : isActive
                ? 'bg-amber-100 text-amber-700'
                : 'bg-gray-100 text-gray-500'
          }`}
        >
          {t(`aiPlanning.phaseStatus.${status.status}`)}
        </span>
      </div>

      {status.summary && (
        <div className="mt-2">
          <p
            className={`text-xs text-gray-600 ${!expanded ? 'line-clamp-2' : ''}`}
          >
            {status.summary}
          </p>
          {status.summary.length > 120 && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs font-medium text-amber-600 hover:text-amber-700"
            >
              {expanded
                ? t('aiPlanning.actions.collapse')
                : t('aiPlanning.actions.viewOutput')}
            </button>
          )}
        </div>
      )}

      {isActive && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
          {t('aiPlanning.phaseStatus.active')}
        </div>
      )}
    </div>
  );
}
