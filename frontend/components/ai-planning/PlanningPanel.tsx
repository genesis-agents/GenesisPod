'use client';

import { useTranslation } from '@/lib/i18n';
import type { PlanDetail } from '@/lib/api/ai-planning';
import { PHASE_KEYS } from '@/lib/constants/ai-planning';
import PhaseOutputCard from './PhaseOutputCard';

interface PlanningPanelProps {
  plan: PlanDetail;
  onAdvance: () => void;
  onRetry: (phase: number) => void;
  onExport: () => void;
  isAdvancing: boolean;
}

export default function PlanningPanel({
  plan,
  onAdvance,
  onRetry,
  onExport,
  isAdvancing,
}: PlanningPanelProps) {
  const { t } = useTranslation();

  const currentStatus = plan.phaseStatus[plan.currentPhase];
  const isCurrentCompleted = currentStatus?.status === 'completed';
  const allCompleted =
    plan.currentPhase >= plan.totalPhases &&
    plan.phaseStatus[plan.totalPhases]?.status === 'completed';

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-100 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('aiPlanning.panel.title')}
        </h3>
        <p className="mt-0.5 text-xs text-gray-500">
          {t('aiPlanning.card.phase')} {plan.currentPhase}
          {t('aiPlanning.card.of')}
          {plan.totalPhases}
        </p>
      </div>

      {/* Phase outputs */}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {[1, 2, 3, 4, 5, 6].map((phase) => {
          const status = plan.phaseStatus[phase];
          if (!status) return null;
          return (
            <PhaseOutputCard
              key={phase}
              phase={phase}
              phaseKey={PHASE_KEYS[phase]}
              status={status}
            />
          );
        })}
      </div>

      {/* Actions */}
      <div className="space-y-2 border-t border-gray-100 p-4">
        {/* Advance button */}
        {isCurrentCompleted && !allCompleted && (
          <button
            type="button"
            onClick={onAdvance}
            disabled={isAdvancing}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
          >
            {isAdvancing ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            )}
            {t('aiPlanning.actions.advancePhase')}
          </button>
        )}

        {/* Retry button */}
        {currentStatus?.status === 'active' && (
          <button
            type="button"
            onClick={() => onRetry(plan.currentPhase)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            {t('aiPlanning.actions.retryPhase')}
          </button>
        )}

        {/* Export button */}
        {allCompleted && (
          <button
            type="button"
            onClick={onExport}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-green-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t('aiPlanning.actions.export')}
          </button>
        )}

        {/* Members */}
        {plan.members && plan.members.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-xs font-medium text-gray-500">
              {t('aiPlanning.members.title')}
            </p>
            <div className="space-y-1.5">
              {plan.members.map((member) => (
                <div key={member.id} className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-xs font-medium text-white">
                    {member.displayName[0]?.toUpperCase() || 'A'}
                  </div>
                  <span className="truncate text-xs text-gray-600">
                    {member.displayName}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
