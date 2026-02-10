'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  ArrowRight,
  RefreshCw,
  Download,
  Loader2,
  X,
  Wrench,
  Zap,
  Cpu,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';
import type { PlanDetail } from '@/lib/api/ai-planning';
import { PHASE_KEYS } from '@/lib/constants/ai-planning';
import {
  PLANNING_ROLES_CONFIG,
  getActiveAgentIndicesForPhase,
} from '@/lib/constants/planning-roles';

interface PlanTeamPanelProps {
  plan: PlanDetail;
  isAdvancing: boolean;
  onStart: () => void;
  onAdvance: () => void;
  onRetry: (phase: number) => void;
  onExport: () => void;
}

/** SVG node positions for the 5 agents */
const NODE_POSITIONS = [
  { x: 160, y: 50 }, // Leader - top center
  { x: 80, y: 110 }, // Researcher - middle left
  { x: 240, y: 110 }, // Analyst - middle right
  { x: 80, y: 160 }, // Copywriter - bottom left
  { x: 240, y: 160 }, // Debater - bottom right
];

/** Connection paths from leader to each other agent */
const CONNECTION_PATHS = [
  'M 160 50 Q 120 70, 80 110',
  'M 160 50 Q 200 70, 240 110',
  'M 160 50 Q 100 110, 80 160',
  'M 160 50 Q 220 110, 240 160',
];

export function PlanTeamPanel({
  plan,
  isAdvancing,
  onStart,
  onAdvance,
  onRetry,
  onExport,
}: PlanTeamPanelProps) {
  const { t } = useTranslation();
  const [selectedAgentIndex, setSelectedAgentIndex] = useState<number | null>(
    null
  );

  const currentStatus = plan.phaseStatus[plan.currentPhase];
  const isCurrentPhaseActive = currentStatus?.status === 'active';
  const isCurrentPhaseCompleted = currentStatus?.status === 'completed';
  const allPhasesCompleted =
    plan.currentPhase === plan.totalPhases && isCurrentPhaseCompleted;
  const hasMorePhases = plan.currentPhase < plan.totalPhases;

  const completedPhasesCount = Object.values(plan.phaseStatus).filter(
    (status) => status.status === 'completed'
  ).length;

  const progressPercentage =
    plan.totalPhases > 0
      ? Math.round((completedPhasesCount / plan.totalPhases) * 100)
      : 0;

  const getCurrentPhaseName = () => {
    if (plan.currentPhase === 0) return t('aiPlanning.status.notStarted');
    if (plan.currentPhase >= 1 && plan.currentPhase <= PHASE_KEYS.length - 1) {
      const phaseKey = PHASE_KEYS[plan.currentPhase];
      return t(`aiPlanning.phases.${phaseKey}`);
    }
    return `Phase ${plan.currentPhase}`;
  };

  const getStatusText = () => {
    if (plan.currentPhase === 0) return t('aiPlanning.status.notStarted');
    if (isCurrentPhaseActive) return t('aiPlanning.status.inProgress');
    if (isCurrentPhaseCompleted) return t('aiPlanning.status.completed');
    return t('aiPlanning.status.notStarted');
  };

  const activeAgentIndices = isCurrentPhaseActive
    ? getActiveAgentIndicesForPhase(plan.currentPhase)
    : [];

  return (
    <div className="flex h-full flex-col border-r border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {t('aiPlanning.team.title')}
        </h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Team Canvas SVG */}
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="mb-3 text-sm font-medium text-gray-700">
            {t('aiPlanning.team.canvas')}
          </h3>
          <div className="relative">
            <svg
              viewBox="0 0 320 200"
              className="w-full"
              style={{ maxHeight: '200px' }}
            >
              <defs>
                <pattern
                  id="plan-grid"
                  width="20"
                  height="20"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="10" cy="10" r="1" fill="#e5e7eb" />
                </pattern>
                {activeAgentIndices.length > 0 && (
                  <style>
                    {`
                      @keyframes plan-pulse {
                        0%, 100% { opacity: 1; r: 20; }
                        50% { opacity: 0.5; r: 24; }
                      }
                      .plan-pulse-ring {
                        animation: plan-pulse 2s ease-in-out infinite;
                      }
                    `}
                  </style>
                )}
                {/* Gradient definitions */}
                {PLANNING_ROLES_CONFIG.map((role) => (
                  <linearGradient
                    key={`grad-${role.key}`}
                    id={`plan-grad-${role.key}`}
                    x1="0%"
                    y1="0%"
                    x2="100%"
                    y2="100%"
                  >
                    <stop offset="0%" stopColor={role.colorHex} />
                    <stop
                      offset="100%"
                      stopColor={role.colorHex}
                      stopOpacity="0.8"
                    />
                  </linearGradient>
                ))}
              </defs>

              <rect width="320" height="200" fill="url(#plan-grid)" />

              {/* Connection paths */}
              {CONNECTION_PATHS.map((d, i) => (
                <path
                  key={i}
                  d={d}
                  stroke="#cbd5e1"
                  strokeWidth="2"
                  fill="none"
                  strokeDasharray="4 4"
                />
              ))}

              {/* Agent nodes */}
              {PLANNING_ROLES_CONFIG.map((role, index) => {
                const pos = NODE_POSITIONS[index];
                const isActive = activeAgentIndices.includes(index);
                const initial =
                  plan.members[index]?.displayName?.[0]?.toUpperCase() ||
                  role.key[0].toUpperCase();

                return (
                  <g
                    key={role.key}
                    className="cursor-pointer"
                    onClick={() => setSelectedAgentIndex(index)}
                  >
                    {isActive && (
                      <circle
                        cx={pos.x}
                        cy={pos.y}
                        r="20"
                        fill="none"
                        stroke={role.colorHex}
                        strokeWidth="2"
                        className="plan-pulse-ring"
                      />
                    )}
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="18"
                      fill="white"
                      stroke="#e5e7eb"
                      strokeWidth="2"
                    />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r="16"
                      fill={`url(#plan-grad-${role.key})`}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 5}
                      textAnchor="middle"
                      className="fill-white text-xs font-semibold"
                    >
                      {initial}
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y + 25}
                      textAnchor="middle"
                      className="fill-gray-600 text-xs"
                    >
                      {t(`aiPlanning.roles.${role.nameKey}`)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Legend */}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-purple-500" />
                {t('aiPlanning.team.legend.leader')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                {t('aiPlanning.team.legend.working')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                {t('aiPlanning.team.legend.completed')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
                {t('aiPlanning.team.legend.idle')}
              </span>
            </div>
          </div>
        </div>

        {/* Current Phase Status */}
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">
                <span className="mr-2 inline-block h-2 w-2 rounded-full bg-blue-500" />
                Phase {plan.currentPhase}/{plan.totalPhases} ·{' '}
                {getCurrentPhaseName()}
              </span>
            </div>
            <div className="text-xs text-gray-600">
              {t('aiPlanning.panel.status')}: {getStatusText()}
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-gray-600">
                <span>{t('aiPlanning.panel.progress')}</span>
                <span>{progressPercentage}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {t('aiPlanning.panel.phasesCompleted', {
                  completed: completedPhasesCount,
                  total: plan.totalPhases,
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            {/* Start/Advance Button */}
            <button
              onClick={plan.currentPhase === 0 ? onStart : onAdvance}
              disabled={
                isAdvancing ||
                isCurrentPhaseActive ||
                (!hasMorePhases && isCurrentPhaseCompleted)
              }
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-3 transition-all',
                plan.currentPhase === 0
                  ? 'border-blue-600 bg-blue-500 text-white hover:bg-blue-600'
                  : isCurrentPhaseCompleted && hasMorePhases
                    ? 'border-amber-600 bg-amber-500 text-white hover:bg-amber-600'
                    : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400',
                (isAdvancing ||
                  isCurrentPhaseActive ||
                  (!hasMorePhases && isCurrentPhaseCompleted)) &&
                  'cursor-not-allowed opacity-50'
              )}
            >
              {isAdvancing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : plan.currentPhase === 0 ? (
                <Play className="h-5 w-5" />
              ) : (
                <ArrowRight className="h-5 w-5" />
              )}
              <span className="text-xs font-medium">
                {plan.currentPhase === 0
                  ? t('aiPlanning.actions.startPlanning')
                  : t('aiPlanning.actions.advancePhase')}
              </span>
            </button>

            {/* Retry Button */}
            <button
              onClick={() => onRetry(plan.currentPhase)}
              disabled={
                isAdvancing ||
                plan.currentPhase === 0 ||
                (!isCurrentPhaseActive && !isCurrentPhaseCompleted)
              }
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-3 transition-all',
                isCurrentPhaseActive || isCurrentPhaseCompleted
                  ? 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                  : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400',
                isAdvancing && 'cursor-not-allowed opacity-50'
              )}
            >
              <RefreshCw className="h-5 w-5" />
              <span className="text-xs font-medium">
                {t('aiPlanning.actions.retryPhase')}
              </span>
            </button>

            {/* Export Button */}
            <button
              onClick={onExport}
              disabled={!allPhasesCompleted}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-lg border p-3 transition-all',
                allPhasesCompleted
                  ? 'border-green-600 bg-green-500 text-white hover:bg-green-600'
                  : 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
              )}
            >
              <Download className="h-5 w-5" />
              <span className="text-xs font-medium">
                {t('aiPlanning.actions.export')}
              </span>
            </button>
          </div>
        </div>

        {/* Roles, Skills & Tools */}
        <div className="px-4 py-3">
          <h3 className="mb-3 text-sm font-medium text-gray-700">
            {t('aiPlanning.team.roles')}
          </h3>
          <div className="space-y-2">
            {PLANNING_ROLES_CONFIG.map((role, index) => {
              const member = plan.members[index];
              return (
                <button
                  key={role.key}
                  type="button"
                  className="w-full rounded-lg border border-gray-100 bg-gray-50 p-3 text-left transition-colors hover:border-gray-200 hover:bg-gray-100"
                  onClick={() => setSelectedAgentIndex(index)}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white',
                        role.gradient
                      )}
                    >
                      {member?.displayName?.[0]?.toUpperCase() ||
                        role.key[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {t(`aiPlanning.roles.${role.nameKey}`)}
                        </span>
                        {member?.aiModel && (
                          <span className="truncate rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {member.aiModel}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                        {t(`aiPlanning.roles.${role.descriptionKey}`)}
                      </p>
                    </div>
                  </div>

                  {/* Skills & Tools tags */}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {role.skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600"
                      >
                        <Zap className="h-2.5 w-2.5" />
                        {skill}
                      </span>
                    ))}
                    {role.tools.map((tool) => (
                      <span
                        key={tool}
                        className="inline-flex items-center gap-0.5 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-600"
                      >
                        <Wrench className="h-2.5 w-2.5" />
                        {tool}
                      </span>
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Agent Detail Modal */}
      {selectedAgentIndex !== null && (
        <AgentDetailModal
          role={PLANNING_ROLES_CONFIG[selectedAgentIndex]}
          member={plan.members[selectedAgentIndex]}
          onClose={() => setSelectedAgentIndex(null)}
        />
      )}
    </div>
  );
}

/** Agent detail modal - shown when clicking an agent node or member card */
function AgentDetailModal({
  role,
  member,
  onClose,
}: {
  role: (typeof PLANNING_ROLES_CONFIG)[number];
  member?: { id: string; displayName: string; aiModel: string };
  onClose: () => void;
}) {
  const { t } = useTranslation();

  // ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br text-base font-bold text-white',
                role.gradient
              )}
            >
              {member?.displayName?.[0]?.toUpperCase() ||
                role.key[0].toUpperCase()}
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-900">
                {t(`aiPlanning.roles.${role.nameKey}`)}
              </h3>
              <p className="text-xs text-gray-500">
                {t('aiPlanning.team.agentDetail')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Description */}
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500">
            {t('aiPlanning.team.responsibilities')}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {t(`aiPlanning.roles.${role.descriptionKey}`)}
          </p>
        </div>

        {/* Skills */}
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500">
            {t('aiPlanning.team.skills')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {role.skills.map((skill) => (
              <span
                key={skill}
                className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
              >
                <Zap className="h-3 w-3" />
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Tools */}
        <div className="mt-4">
          <p className="text-xs font-medium text-gray-500">
            {t('aiPlanning.team.tools')}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {role.tools.map((tool) => (
              <span
                key={tool}
                className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700"
              >
                <Wrench className="h-3 w-3" />
                {tool}
              </span>
            ))}
          </div>
        </div>

        {/* AI Model */}
        {member?.aiModel && (
          <div className="mt-4">
            <p className="text-xs font-medium text-gray-500">AI Model</p>
            <div className="mt-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                <Cpu className="h-3 w-3" />
                {member.aiModel}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default PlanTeamPanel;
