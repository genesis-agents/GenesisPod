'use client';

import { MousePointerClick, Eye, Layers } from 'lucide-react';
import { ARCHITECTURE_LAYERS } from '@/lib/features/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { useApiGet } from '@/hooks/core';
import ArchitectureLayer from './ArchitectureLayer';

export default function ArchitectureDiagram() {
  const { t } = useTranslation();

  // Fetch module-level stats for all cards
  const { data: overviewStats } = useApiGet<Record<string, number>>(
    '/admin/overview-stats'
  );

  // Count total cards
  const totalCards = ARCHITECTURE_LAYERS.reduce((acc, layer) => {
    if (layer.cards) {
      return acc + layer.cards.length;
    }
    if (layer.groups) {
      return acc + layer.groups.reduce((g, group) => g + group.cards.length, 0);
    }
    return acc;
  }, 0);

  const clickableCards = ARCHITECTURE_LAYERS.reduce((acc, layer) => {
    if (layer.cards) {
      return acc + layer.cards.filter((c) => c.clickable).length;
    }
    if (layer.groups) {
      return (
        acc +
        layer.groups.reduce(
          (g, group) => g + group.cards.filter((c) => c.clickable).length,
          0
        )
      );
    }
    return acc;
  }, 0);

  return (
    <div className="flex min-h-full flex-col bg-gray-50/50">
      {/* Header - Consistent with other admin pages */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-6 py-5 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          {/* Left: Title section with icon */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
              <Layers className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {t('admin.architecture.title')}
              </h1>
              <p className="text-sm text-gray-500">
                {t('admin.architecture.subtitle')}
              </p>
            </div>
          </div>

          {/* Right: Stats pills */}
          <div className="hidden items-center gap-3 md:flex">
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5">
              <span className="text-sm font-semibold text-gray-700">
                {ARCHITECTURE_LAYERS.length}
              </span>
              <span className="text-sm text-gray-500">Layers</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5">
              <span className="text-sm font-semibold text-gray-700">
                {totalCards}
              </span>
              <span className="text-sm text-gray-500">Modules</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1.5">
              <span className="text-sm font-semibold text-indigo-700">
                {clickableCards}
              </span>
              <span className="text-sm text-indigo-600">Configurable</span>
            </div>
          </div>
        </div>
      </header>

      {/* Architecture Layers - Compact spacing */}
      <main className="flex-1 overflow-auto px-4 py-4">
        <div className="mx-auto max-w-5xl">
          {/* Layers */}
          <div className="space-y-0">
            {ARCHITECTURE_LAYERS.map((layer, index) => (
              <ArchitectureLayer
                key={layer.id}
                layer={layer}
                showArrow={index < ARCHITECTURE_LAYERS.length - 1}
                overviewStats={overviewStats ?? undefined}
              />
            ))}
          </div>

          {/* Legend - Compact pills design */}
          <div className="mt-4 flex items-center justify-center gap-4">
            <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-100">
                <MousePointerClick className="h-3 w-3 text-blue-600" />
              </div>
              <span className="text-xs text-gray-600">
                {t('admin.architecture.legend.clickable')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 shadow-sm">
              <div className="flex h-5 w-5 items-center justify-center rounded bg-gray-100">
                <Eye className="h-3 w-3 text-gray-400" />
              </div>
              <span className="text-xs text-gray-500">
                {t('admin.architecture.legend.readOnly')}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
