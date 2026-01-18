'use client';

import { MousePointerClick, Eye } from 'lucide-react';
import { ARCHITECTURE_LAYERS } from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import ArchitectureLayer from './ArchitectureLayer';

export default function ArchitectureDiagram() {
  const { t } = useTranslation();

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
      {/* Header - Sticky, left-aligned, minimal */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-6 py-5 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center justify-between">
            {/* Left: Title section - left aligned, no colorful icons */}
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {t('admin.architecture.title')}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {t('admin.architecture.subtitle')}
              </p>
            </div>

            {/* Right: Simple stats */}
            <div className="hidden items-center gap-4 text-sm md:flex">
              <div className="flex items-center gap-2 text-gray-500">
                <span className="font-medium text-gray-900">
                  {ARCHITECTURE_LAYERS.length}
                </span>
                <span>Layers</span>
              </div>
              <div className="h-4 w-px bg-gray-200" />
              <div className="flex items-center gap-2 text-gray-500">
                <span className="font-medium text-gray-900">{totalCards}</span>
                <span>Modules</span>
              </div>
              <div className="h-4 w-px bg-gray-200" />
              <div className="flex items-center gap-2 text-gray-500">
                <span className="font-medium text-gray-900">
                  {clickableCards}
                </span>
                <span>Configurable</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Architecture Layers - Scrollable */}
      <main className="flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto max-w-6xl">
          {/* Layers */}
          <div className="space-y-6">
            {ARCHITECTURE_LAYERS.map((layer, index) => (
              <ArchitectureLayer
                key={layer.id}
                layer={layer}
                showArrow={index < ARCHITECTURE_LAYERS.length - 1}
              />
            ))}
          </div>

          {/* Legend - Simple, minimal */}
          <div className="mt-8 flex items-center justify-center gap-8 text-sm">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white">
                <MousePointerClick className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <span className="text-gray-600">
                {t('admin.architecture.legend.clickable')}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 bg-gray-50">
                <Eye className="h-3.5 w-3.5 text-gray-400" />
              </div>
              <span className="text-gray-500">
                {t('admin.architecture.legend.readOnly')}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
