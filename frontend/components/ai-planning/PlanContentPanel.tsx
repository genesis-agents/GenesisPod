'use client';

/**
 * PlanContentPanel - AI Planning right-side content panel
 *
 * Tab-based layout referencing TopicContentPanel:
 * 1. Phase Outputs - PhaseOutputCard list for all 6 phases
 * 2. Planning Report - Rendered report markdown (when available)
 * 3. Activity Log - Timeline of phase transitions
 *
 * Bottom: QuickCommandBar (disabled, placeholder for future chat)
 */

import { useState, useMemo } from 'react';
import { LayoutList, FileText, Clock, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils/common';
import { useTranslation } from '@/lib/i18n';
import type { PlanDetail } from '@/lib/api/ai-planning';
import { PHASE_KEYS } from '@/lib/constants/ai-planning';
import PhaseOutputCard from './PhaseOutputCard';

export type PlanContentTabType = 'phases' | 'report' | 'activity';

interface PlanContentPanelProps {
  plan: PlanDetail;
  className?: string;
  activeTab?: PlanContentTabType;
  onTabChange?: (tab: PlanContentTabType) => void;
}

export function PlanContentPanel({
  plan,
  className,
  activeTab: controlledTab,
  onTabChange,
}: PlanContentPanelProps) {
  const { t } = useTranslation();
  const [internalTab, setInternalTab] = useState<PlanContentTabType>('phases');

  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: PlanContentTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Count completed phases for badge
  const completedCount = Object.values(plan.phaseStatus).filter(
    (s) => s.status === 'completed'
  ).length;

  // Build activity log from phaseStatus completedAt timestamps
  const activityLog = useMemo(() => {
    const entries: Array<{
      id: string;
      time: string;
      label: string;
      type: 'created' | 'started' | 'completed';
    }> = [];

    // Plan created
    entries.push({
      id: 'created',
      time: plan.createdAt,
      label: t('aiPlanning.content.planCreated'),
      type: 'created',
    });

    // Phase transitions
    for (let phase = 1; phase <= plan.totalPhases; phase++) {
      const status = plan.phaseStatus[phase];
      if (!status) continue;

      const phaseKey = PHASE_KEYS[phase];
      const phaseName = t(`aiPlanning.phases.${phaseKey}`);

      if (status.status === 'active' || status.status === 'completed') {
        entries.push({
          id: `phase-${phase}-start`,
          time: plan.updatedAt, // approximate
          label: `${phaseName} ${t('aiPlanning.content.phaseStarted')}`,
          type: 'started',
        });
      }

      if (status.status === 'completed' && status.completedAt) {
        entries.push({
          id: `phase-${phase}-done`,
          time: status.completedAt,
          label: `${phaseName} ${t('aiPlanning.content.phaseCompleted')}`,
          type: 'completed',
        });
      }
    }

    // Sort by time descending (newest first)
    entries.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );

    return entries;
  }, [plan, t]);

  // Combine all completed phase summaries into a report
  const reportContent = useMemo(() => {
    const sections: string[] = [];

    for (let phase = 1; phase <= plan.totalPhases; phase++) {
      const status = plan.phaseStatus[phase];
      if (!status?.summary) continue;

      const phaseKey = PHASE_KEYS[phase];
      const phaseName = t(`aiPlanning.phases.${phaseKey}`);
      sections.push(`## ${phase}. ${phaseName}\n\n${status.summary}`);
    }

    return sections.length > 0 ? sections.join('\n\n---\n\n') : null;
  }, [plan, t]);

  // Tab config
  const tabs: Array<{
    key: PlanContentTabType;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
    {
      key: 'phases',
      label: t('aiPlanning.content.phaseOutputs'),
      icon: <LayoutList className="h-4 w-4" />,
      badge: completedCount > 0 ? completedCount : undefined,
    },
    {
      key: 'report',
      label: t('aiPlanning.content.planReport'),
      icon: <FileText className="h-4 w-4" />,
    },
    {
      key: 'activity',
      label: t('aiPlanning.content.activityLog'),
      icon: <Clock className="h-4 w-4" />,
      badge: activityLog.length > 0 ? activityLog.length : undefined,
    },
  ];

  return (
    <div className={cn('flex h-full flex-col bg-white', className)}>
      {/* Tab Header */}
      <div className="flex overflow-x-auto border-b border-gray-200 px-4">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-xs',
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-gray-100 text-gray-500'
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Phases Tab */}
        {activeTab === 'phases' && (
          <div className="space-y-3 p-4">
            {plan.currentPhase === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <LayoutList className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm">
                  {t('aiPlanning.content.notStartedHint')}
                </p>
              </div>
            ) : (
              [1, 2, 3, 4, 5, 6].map((phase) => {
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
              })
            )}
          </div>
        )}

        {/* Report Tab */}
        {activeTab === 'report' && (
          <div className="p-4">
            {reportContent ? (
              <div className="prose prose-sm max-w-none">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-semibold text-gray-900">
                    {plan.name}
                  </h3>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500">
                    {completedCount}/{plan.totalPhases}{' '}
                    {t('aiPlanning.panel.phasesCompleted')}
                  </span>
                </div>
                {plan.goal && (
                  <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                    <p className="text-sm font-medium text-blue-800">
                      {t('aiPlanning.create.goal')}
                    </p>
                    <p className="mt-1 text-sm text-blue-700">{plan.goal}</p>
                  </div>
                )}
                <div className="rounded-lg border border-gray-200 p-4">
                  <ReactMarkdown>{reportContent}</ReactMarkdown>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <FileText className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm">{t('aiPlanning.content.noReport')}</p>
              </div>
            )}
          </div>
        )}

        {/* Activity Log Tab */}
        {activeTab === 'activity' && (
          <div className="p-4">
            {activityLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <Clock className="mb-3 h-10 w-10 text-gray-300" />
                <p className="text-sm">{t('aiPlanning.content.noActivity')}</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute bottom-0 left-3 top-0 w-px bg-gray-200" />

                <div className="space-y-4">
                  {activityLog.map((entry) => (
                    <div key={entry.id} className="relative flex gap-3 pl-1">
                      {/* Dot */}
                      <div
                        className={cn(
                          'relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white',
                          entry.type === 'completed'
                            ? 'bg-green-500'
                            : entry.type === 'started'
                              ? 'bg-amber-400'
                              : 'bg-blue-400'
                        )}
                      />
                      {/* Content */}
                      <div className="flex-1 pb-1">
                        <p className="text-sm text-gray-700">{entry.label}</p>
                        <p className="text-xs text-gray-400">
                          {formatTime(entry.time)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom: QuickCommandBar placeholder */}
      <div className="shrink-0 border-t border-gray-200 bg-gray-50/50 px-4 py-3">
        <div className="flex gap-2">
          <div className="flex-1">
            <textarea
              rows={1}
              disabled
              placeholder={t('aiPlanning.content.inputPlaceholder')}
              className="w-full resize-none rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-gray-500 placeholder:text-gray-400 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:opacity-60"
            />
          </div>
          <button
            disabled
            className="shrink-0 self-end rounded-lg bg-blue-600 px-4 py-2.5 text-white opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Format ISO date string to localized time */
function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export default PlanContentPanel;
