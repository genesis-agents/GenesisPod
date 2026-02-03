'use client';

import { ScenarioTemplate } from '../types';
import { useI18n } from '@/lib/i18n';

interface TemplateCardProps {
  template: ScenarioTemplate;
  onClick: () => void;
}

export function TemplateCard({ template, onClick }: TemplateCardProps) {
  const { t } = useI18n();
  return (
    <div
      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
      onClick={onClick}
    >
      {/* Icon & Badge */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl">
          🏭
        </div>
        {template.badge && (
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
            {template.badge}
          </span>
        )}
      </div>

      {/* Title & Description */}
      <h4 className="truncate text-base font-semibold text-gray-900">
        {template.name}
      </h4>
      <p className="text-xs text-gray-500">
        {template.industry} · {template.region || 'Global'}
      </p>
      <p className="mt-2 line-clamp-2 text-sm text-gray-600">
        {template.description}
      </p>

      {/* Stats */}
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
          {t('aiSimulation.templateCard.companies')}{' '}
          {template.companies?.length || 0}
        </span>
        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
          {t('aiSimulation.templateCard.roles')} {template.agents?.length || 0}
        </span>
      </div>
    </div>
  );
}
