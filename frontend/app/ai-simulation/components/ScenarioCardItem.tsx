'use client';

import { ScenarioCard, ScenarioRun } from '../types';
import { useI18n } from '@/lib/i18n';
import { AssetCard, type AssetCardBadge } from '@/components/common/asset-card';

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

  const statusBadge: AssetCardBadge = latestRun
    ? {
        key: 'status',
        label:
          latestRun.status === 'RUNNING'
            ? t('aiSimulation.scenarioCard.statusRunning')
            : latestRun.status === 'COMPLETED'
              ? t('aiSimulation.scenarioCard.statusCompleted')
              : latestRun.status === 'PAUSED'
                ? t('aiSimulation.scenarioCard.statusPaused')
                : latestRun.status,
        className:
          latestRun.status === 'RUNNING'
            ? 'bg-green-100 text-green-700'
            : latestRun.status === 'COMPLETED'
              ? 'bg-blue-100 text-blue-700'
              : latestRun.status === 'PAUSED'
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-purple-100 text-purple-700',
      }
    : {
        key: 'status',
        label: t('aiSimulation.scenarioCard.statusNotRunning'),
        className: 'bg-gray-100 text-gray-600',
      };

  const stats = [
    {
      key: 'companies',
      icon: <span className="text-blue-600">·</span>,
      text: `${t('aiSimulation.scenarioCard.companies')} ${scenario.companies?.length || 0}`,
    },
    {
      key: 'roles',
      icon: <span className="text-purple-600">·</span>,
      text: `${t('aiSimulation.scenarioCard.roles')} ${scenario.agents?.length || 0}`,
    },
  ];

  if (latestRun?.currentRound) {
    stats.push({
      key: 'round',
      icon: <span className="text-green-600">·</span>,
      text: t('aiSimulation.scenarioCard.round', {
        round: latestRun.currentRound,
      }),
    });
  }

  return (
    <AssetCard
      title={scenario.name}
      description={`${scenario.industry} · ${scenario.region || 'Global'}`}
      icon={<span className="text-2xl">⚔️</span>}
      gradient="from-blue-500 to-purple-500"
      badges={[statusBadge]}
      isOwner
      onEdit={() => onEdit({ stopPropagation: () => {} } as React.MouseEvent)}
      onDelete={() =>
        onDelete({ stopPropagation: () => {} } as React.MouseEvent)
      }
      onClick={onView}
      stats={stats}
      labels={{
        edit: t('aiSimulation.scenarioCard.editScenario'),
        delete: t('aiSimulation.scenarioCard.deleteScenario'),
      }}
    />
  );
}
