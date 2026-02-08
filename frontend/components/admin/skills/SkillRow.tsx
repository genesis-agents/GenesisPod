'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import {
  CheckCircle,
  XCircle,
  Edit3,
  ChevronDown,
  ChevronRight,
  Link,
  Wrench,
  Sparkles,
  Tag,
  BarChart2,
} from 'lucide-react';
import { SKILL_LAYERS } from './skill-layers';
import type { SkillConfig } from './types';

interface SkillRowProps {
  skill: SkillConfig;
  onToggle: (skillId: string, enabled: boolean) => void;
  onEdit: (skill: SkillConfig) => void;
  usageCount?: number;
  successRate?: number;
  avgDuration?: number | null;
}

export function SkillRow({
  skill,
  onToggle,
  onEdit,
  usageCount,
  successRate,
  avgDuration,
}: SkillRowProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const layerInfo =
    SKILL_LAYERS.find((l) => l.id === skill.layer) || SKILL_LAYERS[0];
  const LayerIcon = layerInfo.icon;

  const hasDependencies =
    skill.requiredTools.length > 0 || skill.requiredSkills.length > 0;

  return (
    <div className="group border-b border-gray-100 transition-colors hover:bg-gray-50">
      <div className="flex items-center gap-4 px-4 py-4">
        {/* Status Indicator */}
        <div className="flex-shrink-0">
          {skill.enabled ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
              <XCircle className="h-5 w-5 text-gray-400" />
            </div>
          )}
        </div>

        {/* Skill Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium text-gray-900">
              {skill.displayName || skill.name}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${layerInfo.badge}`}
            >
              <LayerIcon className="mr-1 inline h-3 w-3" />
              {t(layerInfo.labelKey)}
            </span>
            {skill.domain && (
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">
                {skill.domain}
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-gray-500">
            {skill.description}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {skill.tags.slice(0, 4).map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
              >
                <Tag className="mr-0.5 h-3 w-3" />
                {tag}
              </span>
            ))}
            {skill.tags.length > 4 && (
              <span className="text-xs text-gray-400">
                +{skill.tags.length - 4}
              </span>
            )}
          </div>
        </div>

        {/* Dependencies & Usage Stats */}
        <div className="hidden flex-shrink-0 flex-col items-end gap-1 sm:flex">
          {/* Usage Count */}
          {usageCount !== undefined && usageCount > 0 && (
            <div className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-600">
              <BarChart2 className="h-3 w-3" />
              <span>
                {usageCount.toLocaleString()} {t('admin.skills.usageCount')}
              </span>
            </div>
          )}
          {/* Success Rate Badge */}
          {successRate !== undefined &&
            usageCount !== undefined &&
            usageCount > 0 && (
              <div
                className={`rounded-lg px-2 py-1 text-xs font-medium ${
                  successRate >= 90
                    ? 'bg-green-50 text-green-700'
                    : successRate >= 70
                      ? 'bg-yellow-50 text-yellow-700'
                      : 'bg-red-50 text-red-700'
                }`}
              >
                {successRate}% success
              </div>
            )}
          {/* Avg Duration Badge */}
          {avgDuration !== undefined &&
            avgDuration !== null &&
            usageCount !== undefined &&
            usageCount > 0 && (
              <div className="rounded-lg bg-gray-50 px-2 py-1 text-xs text-gray-600">
                ~{Math.round(avgDuration)}ms
              </div>
            )}
          {hasDependencies && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
            >
              <Link className="h-3 w-3" />
              {t('admin.skills.dependencies')} (
              {skill.requiredTools.length + skill.requiredSkills.length})
              {expanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            onClick={() => onEdit(skill)}
            className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            <Edit3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('admin.skills.edit')}</span>
          </button>
          <button
            onClick={() => onToggle(skill.skillId, !skill.enabled)}
            className={`relative h-6 w-11 rounded-full transition-colors ${
              skill.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <div
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                skill.enabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Expanded Dependencies */}
      {expanded && hasDependencies && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <div className="ml-14 space-y-2">
            {skill.requiredTools.length > 0 && (
              <div className="flex items-start gap-2">
                <Wrench className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <span className="text-xs font-medium text-gray-500">
                    {t('admin.skills.requiredTools')}:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.requiredTools.map((tool) => (
                      <span
                        key={tool}
                        className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
            {skill.requiredSkills.length > 0 && (
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 text-gray-400" />
                <div>
                  <span className="text-xs font-medium text-gray-500">
                    {t('admin.skills.requiredSkills')}:
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {skill.requiredSkills.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
