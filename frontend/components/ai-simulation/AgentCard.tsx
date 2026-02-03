'use client';

import { useState, useMemo } from 'react';
import {
  ScenarioFormAgent,
  ScenarioFormCompany,
} from '@/app/ai-simulation/types';
import { safeJson } from '@/app/ai-simulation/utils';
import { useI18n } from '@/lib/i18n/i18n-context';

interface AgentPersona {
  traits?: string;
  biases?: string;
  pressure?: string;
  timePref?: string;
  riskTolerance?: number;
  compliance?: number;
  [key: string]: string | number | undefined;
}

interface AgentCardProps {
  index: number;
  agent: ScenarioFormAgent;
  companies: ScenarioFormCompany[];
  teamColors: Record<string, string>;
  onUpdate: (value: ScenarioFormAgent) => void;
  onRemove: () => void;
}

export function AgentCard({
  index,
  agent,
  companies,
  teamColors,
  onUpdate,
  onRemove,
}: AgentCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  // 解析persona JSON - 使用useMemo确保响应式更新
  const persona = useMemo<AgentPersona>(() => {
    return agent.persona ? safeJson<AgentPersona>(agent.persona, {}) : {};
  }, [agent.persona]);

  const updatePersona = (key: string, value: string | number) => {
    const newPersona = { ...persona, [key]: value };
    onUpdate({ ...agent, persona: JSON.stringify(newPersona) });
  };

  const teamInfo: Record<
    string,
    { label: string; color: string; bgColor: string; icon: string }
  > = {
    BLUE: {
      label: t('aiSimulation.editor.agents.teams.blue'),
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      icon: '🔵',
    },
    RED: {
      label: t('aiSimulation.editor.agents.teams.red'),
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      icon: '🔴',
    },
    GREEN: {
      label: t('aiSimulation.editor.agents.teams.green'),
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      icon: '🟢',
    },
    WHITE: {
      label: t('aiSimulation.editor.agents.teams.white'),
      color: 'text-gray-700',
      bgColor: 'bg-gray-100',
      icon: '⚪',
    },
    CHAOS: {
      label: t('aiSimulation.editor.agents.teams.chaos'),
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
      icon: '🟣',
    },
  };

  const currentTeam = teamInfo[agent.team] || teamInfo.BLUE;

  // 边框颜色映射
  const borderColorMap: Record<string, string> = {
    BLUE: 'border-blue-200',
    RED: 'border-red-200',
    GREEN: 'border-green-200',
    WHITE: 'border-gray-200',
    CHAOS: 'border-purple-200',
  };

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
        borderColorMap[agent.team] || 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-4 p-4">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${currentTeam.bgColor}`}
        >
          {currentTeam.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <select
              value={agent.team}
              onChange={(e) =>
                onUpdate({
                  ...agent,
                  team: e.target.value as ScenarioFormAgent['team'],
                })
              }
              className={`rounded-lg border-none px-2 py-1 text-xs font-semibold ${currentTeam.bgColor} ${currentTeam.color} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
            >
              <option value="BLUE">
                {t('aiSimulation.editor.agents.teamsShort.blue')}
              </option>
              <option value="RED">
                {t('aiSimulation.editor.agents.teamsShort.red')}
              </option>
              <option value="GREEN">
                {t('aiSimulation.editor.agents.teamsShort.green')}
              </option>
              <option value="WHITE">
                {t('aiSimulation.editor.agents.teamsShort.white')}
              </option>
              <option value="CHAOS">🟣 Chaos</option>
            </select>
            <input
              value={agent.role}
              onChange={(e) => onUpdate({ ...agent, role: e.target.value })}
              placeholder={t('aiSimulation.editor.agents.rolePlaceholder')}
              className="flex-1 border-none bg-transparent text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <select
              value={agent.companyName || ''}
              onChange={(e) =>
                onUpdate({ ...agent, companyName: e.target.value })
              }
              className="rounded border-none bg-gray-100 px-2 py-0.5 text-xs text-gray-600 focus:outline-none"
            >
              <option value="">
                {t('aiSimulation.editor.agents.noCompany')}
              </option>
              {companies.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {persona.riskTolerance !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  persona.riskTolerance > 70
                    ? 'bg-red-100 text-red-700'
                    : persona.riskTolerance > 40
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                }`}
              >
                {t('aiSimulation.editor.agents.personaFields.riskAppetite')}{' '}
                {persona.riskTolerance}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              expanded
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {expanded
              ? t('aiSimulation.editor.agents.collapse')
              : t('aiSimulation.editor.agents.expandPersona')}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded - Persona详情 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          {/* {t("aiSimulation.editor.agents.personaSections.traits")} */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-indigo-600">
                🎭
              </span>
              性格与偏见
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.agents.personaFields.traits')}
                </label>
                <input
                  type="text"
                  value={persona.traits || ''}
                  onChange={(e) => updatePersona('traits', e.target.value)}
                  placeholder={t(
                    'aiSimulation.editor.agents.personaPlaceholders.traits'
                  )}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.agents.personaFields.biases')}
                </label>
                <input
                  type="text"
                  value={persona.biases || ''}
                  onChange={(e) => updatePersona('biases', e.target.value)}
                  placeholder={t(
                    'aiSimulation.editor.agents.personaPlaceholders.biases'
                  )}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 压力与{t("aiSimulation.editor.agents.personaFields.timePref")} */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-orange-600">
                ⏱️
              </span>
              {t('aiSimulation.editor.agents.personaSections.pressure')}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.agents.personaFields.pressure')}
                </label>
                <input
                  type="text"
                  value={persona.pressure || ''}
                  onChange={(e) => updatePersona('pressure', e.target.value)}
                  placeholder={t(
                    'aiSimulation.editor.agents.personaPlaceholders.pressure'
                  )}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  时间偏好
                </label>
                <select
                  value={persona.timePref || ''}
                  onChange={(e) => updatePersona('timePref', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">
                    {t(
                      'aiSimulation.editor.agents.personaPlaceholders.selectTime'
                    )}
                  </option>
                  <option value="短期">
                    {t('aiSimulation.editor.agents.timePreferences.short')}
                  </option>
                  <option value="中期">
                    {t('aiSimulation.editor.agents.timePreferences.medium')}
                  </option>
                  <option value="长期">
                    {t('aiSimulation.editor.agents.timePreferences.long')}
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* 风险与合规 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-600">
                ⚠️
              </span>
              {t('aiSimulation.editor.agents.personaSections.risk')}
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-gray-500">
                    {t(
                      'aiSimulation.editor.agents.personaFields.riskTolerance'
                    )}
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      (persona.riskTolerance || 50) > 70
                        ? 'bg-red-100 text-red-700'
                        : (persona.riskTolerance || 50) > 40
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {persona.riskTolerance || 50}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={persona.riskTolerance || 50}
                  onChange={(e) =>
                    updatePersona('riskTolerance', parseInt(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-red-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>
                    {t('aiSimulation.editor.agents.riskLabels.conservative')}
                  </span>
                  <span>
                    {t('aiSimulation.editor.agents.riskLabels.aggressive')}
                  </span>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-gray-500">
                    {t('aiSimulation.editor.agents.personaFields.compliance')}
                  </label>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      (persona.compliance || 50) > 70
                        ? 'bg-green-100 text-green-700'
                        : (persona.compliance || 50) > 40
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {persona.compliance || 50}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={persona.compliance || 50}
                  onChange={(e) =>
                    updatePersona('compliance', parseInt(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-green-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>
                    {t('aiSimulation.editor.agents.riskLabels.flexible')}
                  </span>
                  <span>
                    {t('aiSimulation.editor.agents.riskLabels.strict')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* {t("aiSimulation.editor.agents.personaSections.privateMemory")} */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-gray-600">
                🔒
              </span>
              {t('aiSimulation.editor.agents.memoryPrivate')}
            </h4>
            <textarea
              value={
                typeof agent.memoryPrivate === 'object'
                  ? JSON.stringify(agent.memoryPrivate, null, 2)
                  : agent.memoryPrivate || ''
              }
              onChange={(e) =>
                onUpdate({ ...agent, memoryPrivate: e.target.value })
              }
              placeholder={t(
                'aiSimulation.editor.agents.memoryPrivatePlaceholder'
              )}
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* AI提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{t('aiSimulation.editor.agents.personaTooltip')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
