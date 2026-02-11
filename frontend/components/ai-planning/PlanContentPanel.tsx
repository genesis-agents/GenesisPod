'use client';

/**
 * PlanContentPanel - AI Planning right-side content panel
 *
 * Tab layout matching TopicContentPanel pattern:
 * 1. Tasks - 6-phase accordion with click-to-expand details
 * 2. Planning Report - Aggregated report markdown
 * 3. Activity Log - Timeline of phase transitions
 *
 * Bottom: QuickCommandBar (disabled, placeholder for future chat)
 */

import { useState, useMemo, useEffect } from 'react';
import { LayoutList, FileText, Clock, Send, ChevronDown } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils/common';
import { useTranslation } from '@/lib/i18n';
import type { PlanDetail } from '@/lib/api/ai-planning';
import { PHASE_KEYS } from '@/lib/constants/ai-planning';
import {
  PLANNING_ROLES_CONFIG,
  PLANNING_WORKFLOW_CONFIG,
  AGENT_KEY_TO_INDEX,
} from '@/lib/constants/planning-roles';

export type PlanContentTabType = 'phases' | 'report' | 'activity';

// Role icon mapping (shared with PlanTeamPanel)
const ROLE_ICON_MAP: Record<string, string> = {
  leader: '\u{1F451}',
  researcher: '\u{1F50D}',
  analyst: '\u{1F4CA}',
  copywriter: '\u{270D}\u{FE0F}',
  debater: '\u{2694}\u{FE0F}',
};

const PHASE_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  skipped: 'bg-gray-100 text-gray-500',
};

interface PlanContentPanelProps {
  plan: PlanDetail;
  className?: string;
  activeTab?: PlanContentTabType;
  onTabChange?: (tab: PlanContentTabType) => void;
  /** Phase to auto-expand (from left panel click) */
  selectedPhase?: number | null;
  onPhaseDeselect?: () => void;
}

export function PlanContentPanel({
  plan,
  className,
  activeTab: controlledTab,
  onTabChange,
  selectedPhase,
  onPhaseDeselect,
}: PlanContentPanelProps) {
  const { t } = useTranslation();
  const [internalTab, setInternalTab] = useState<PlanContentTabType>('phases');
  const [expandedPhase, setExpandedPhase] = useState<number | null>(null);

  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: PlanContentTabType) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };

  // Auto-expand phase when selected from left panel
  useEffect(() => {
    if (selectedPhase !== null && selectedPhase !== undefined) {
      setExpandedPhase(selectedPhase);
    }
  }, [selectedPhase]);

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

    entries.push({
      id: 'created',
      time: plan.createdAt,
      label: t('aiPlanning.content.planCreated'),
      type: 'created',
    });

    for (let phase = 1; phase <= plan.totalPhases; phase++) {
      const status = plan.phaseStatus[phase];
      if (!status) continue;

      const phaseKey = PHASE_KEYS[phase];
      const phaseName = t(`aiPlanning.phases.${phaseKey}`);

      if (status.status === 'active' || status.status === 'completed') {
        entries.push({
          id: `phase-${phase}-start`,
          time: plan.updatedAt,
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
      label: t('aiPlanning.content.tasks'),
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
        {/* Tasks Tab */}
        {activeTab === 'phases' && (
          <div className="p-4">
            {plan.currentPhase === 0 ? (
              <TasksEmptyState />
            ) : (
              <div className="space-y-3">
                {PLANNING_WORKFLOW_CONFIG.map((wf) => (
                  <PhaseTaskCard
                    key={wf.phase}
                    plan={plan}
                    workflow={wf}
                    isExpanded={expandedPhase === wf.phase}
                    onToggle={() => {
                      setExpandedPhase(
                        expandedPhase === wf.phase ? null : wf.phase
                      );
                      if (expandedPhase === wf.phase) {
                        onPhaseDeselect?.();
                      }
                    }}
                  />
                ))}
              </div>
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
                <div className="absolute bottom-0 left-3 top-0 w-px bg-gray-200" />
                <div className="space-y-4">
                  {activityLog.map((entry) => (
                    <div key={entry.id} className="relative flex gap-3 pl-1">
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

// ============================================
// Tasks Empty State (matching AI Insights pattern)
// ============================================

function TasksEmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center px-8 py-8">
      {/* Large circular icon */}
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-100">
        <LayoutList className="h-10 w-10 text-blue-500" />
      </div>

      <h3 className="mt-4 text-lg font-medium text-gray-900">
        {t('aiPlanning.content.waitingForStart')}
      </h3>
      <p className="mt-2 max-w-sm text-center text-sm text-gray-500">
        {t('aiPlanning.content.clickStartHint')}
      </p>

      {/* Workflow step cards */}
      <div className="mt-6 w-full max-w-md space-y-2.5">
        {PLANNING_WORKFLOW_CONFIG.map((wf) => {
          const agents = wf.agentKeys
            .map((key) => {
              const role = PLANNING_ROLES_CONFIG.find((r) => r.key === key);
              return role
                ? {
                    icon: ROLE_ICON_MAP[key] || '',
                    name: t(`aiPlanning.roles.${role.nameKey}`),
                  }
                : null;
            })
            .filter(Boolean) as Array<{ icon: string; name: string }>;

          return (
            <div
              key={wf.phase}
              className="rounded-lg border border-dashed border-gray-200 p-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                  {wf.phase}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-700">
                    {t(`aiPlanning.phases.${wf.key}`)}
                  </div>
                  <p className="text-xs text-gray-500">
                    {agents.map((a) => `${a.icon} ${a.name}`).join(' + ')}
                  </p>
                </div>
                {wf.parallel && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                    {t('aiPlanning.settings.parallelHint')}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// Phase Task Card (accordion detail)
// ============================================

function PhaseTaskCard({
  plan,
  workflow,
  isExpanded,
  onToggle,
}: {
  plan: PlanDetail;
  workflow: (typeof PLANNING_WORKFLOW_CONFIG)[number];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const status = plan.phaseStatus[workflow.phase];
  const phaseKey = PHASE_KEYS[workflow.phase];
  const isActive = status?.status === 'active';
  const isCompleted = status?.status === 'completed';
  const isCurrent = workflow.phase === plan.currentPhase;

  // Build agent info
  const agents = workflow.agentKeys
    .map((key) => {
      const role = PLANNING_ROLES_CONFIG.find((r) => r.key === key);
      if (!role) return null;
      const memberIndex = AGENT_KEY_TO_INDEX[key];
      const member = plan.members[memberIndex];
      return {
        icon: ROLE_ICON_MAP[key] || '',
        name: t(`aiPlanning.roles.${role.nameKey}`),
        description: t(`aiPlanning.roles.${role.descriptionKey}`),
        skills: role.skills,
        tools: role.tools,
        model: member?.aiModel,
      };
    })
    .filter(Boolean) as Array<{
    icon: string;
    name: string;
    description: string;
    skills: string[];
    tools: string[];
    model?: string;
  }>;

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        isActive
          ? 'border-blue-200 bg-blue-50/30'
          : isCompleted
            ? 'border-green-200 bg-green-50/30'
            : 'border-gray-100 bg-white'
      )}
    >
      {/* Header - clickable */}
      <div
        onClick={onToggle}
        className="flex cursor-pointer items-center gap-3 p-3"
      >
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium',
            isCompleted
              ? 'bg-green-500 text-white'
              : isActive
                ? 'bg-blue-500 text-white'
                : 'bg-gray-200 text-gray-500'
          )}
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
            workflow.phase
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">
              {t(`aiPlanning.phases.${phaseKey}`)}
            </span>
            {isCurrent && isActive && (
              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                {'\u25C0'} {t('aiPlanning.content.currentPhase')}
              </span>
            )}
            {workflow.parallel && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">
                {t('aiPlanning.settings.parallelHint')}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">
            {agents.map((a) => `${a.icon} ${a.name}`).join(' + ')}
          </p>
        </div>

        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_STATUS_COLORS[status?.status || 'pending']}`}
        >
          {t(`aiPlanning.phaseStatus.${status?.status || 'pending'}`)}
        </span>

        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-gray-400 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="space-y-3 border-t border-gray-100 p-3">
          {/* Phase description */}
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">
              {'\u{1F4CB}'} {t('aiPlanning.content.phaseDescription')}
            </div>
            <p className="text-sm text-gray-700">{agents[0]?.description}</p>
          </div>

          {/* Participating agents */}
          <div>
            <div className="mb-1.5 text-xs font-medium text-gray-500">
              {'\u{1F465}'} {t('aiPlanning.content.participatingAgents')}
            </div>
            <div className="space-y-2">
              {agents.map((agent) => (
                <div key={agent.name} className="rounded-lg bg-gray-50 p-2.5">
                  <div className="flex items-center gap-2">
                    <span>{agent.icon}</span>
                    <span className="text-sm font-medium text-gray-800">
                      {agent.name}
                    </span>
                    {agent.model && (
                      <span className="font-mono ml-auto rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-600">
                        {agent.model}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {agent.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-700"
                      >
                        {skill}
                      </span>
                    ))}
                    {agent.tools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] text-green-700"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Phase output (summary) */}
          {status?.summary && (
            <div>
              <div className="mb-1 text-xs font-medium text-gray-500">
                {'\u{1F4DD}'} {t('aiPlanning.content.phaseOutput')}
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{status.summary}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Active indicator */}
          {isActive && !status?.summary && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
              {t('aiPlanning.content.executing')}
            </div>
          )}

          {/* Completion time */}
          {status?.completedAt && (
            <div className="text-xs text-gray-400">
              {'\u{23F1}'} {t('aiPlanning.content.completedAt')}:{' '}
              {formatTime(status.completedAt)}
            </div>
          )}
        </div>
      )}
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
