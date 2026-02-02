'use client';

import { ScenarioCard, ScenarioRun } from '@/app/ai-simulation/types';
import { useI18n } from '@/lib/i18n';

interface ScenarioCardItemProps {
  scenario: ScenarioCard;
  latestRun: ScenarioRun | null;
  onView: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

export function ScenarioCardItem({
  scenario,
  latestRun,
  onView,
  onEdit,
  onDelete,
}: ScenarioCardItemProps) {
  const { t } = useI18n();

  return (
    <div
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
      onClick={onView}
    >
      {/* Action Buttons - 悬浮显示 */}
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-all group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-blue-50 hover:shadow-md"
          title={t('aiSimulation.scenarioCard.editScenario')}
        >
          <svg
            className="h-4 w-4 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        </button>
        <button
          onClick={onDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/90 shadow-sm backdrop-blur-sm transition-all hover:bg-red-50 hover:shadow-md"
          title={t('aiSimulation.scenarioCard.deleteScenario')}
        >
          <svg
            className="h-4 w-4 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      </div>

      {/* Icon & Status */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-2xl">
          ⚔️
        </div>
        {latestRun ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              latestRun.status === 'RUNNING'
                ? 'bg-green-100 text-green-700'
                : latestRun.status === 'COMPLETED'
                  ? 'bg-blue-100 text-blue-700'
                  : latestRun.status === 'PAUSED'
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-purple-100 text-purple-700'
            }`}
          >
            {latestRun.status === 'RUNNING'
              ? t('aiSimulation.scenarioCard.statusRunning')
              : latestRun.status === 'COMPLETED'
                ? t('aiSimulation.scenarioCard.statusCompleted')
                : latestRun.status === 'PAUSED'
                  ? t('aiSimulation.scenarioCard.statusPaused')
                  : latestRun.status}
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            {t('aiSimulation.scenarioCard.statusNotRunning')}
          </span>
        )}
      </div>

      {/* Title & Industry */}
      <h4 className="truncate text-base font-semibold text-gray-900">
        {scenario.name}
      </h4>
      <p className="text-xs text-gray-500">
        {scenario.industry} · {scenario.region || 'Global'}
      </p>

      {/* Stats */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
          {t('aiSimulation.scenarioCard.companies')}{' '}
          {scenario.companies?.length || 0}
        </span>
        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
          {t('aiSimulation.scenarioCard.roles')} {scenario.agents?.length || 0}
        </span>
        {latestRun && latestRun.currentRound && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
            {t('aiSimulation.scenarioCard.round', {
              round: latestRun.currentRound,
            })}
          </span>
        )}
      </div>
    </div>
  );
}
