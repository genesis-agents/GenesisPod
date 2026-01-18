'use client';

import { Layers, MousePointerClick, Eye, Sparkles } from 'lucide-react';
import { ARCHITECTURE_LAYERS } from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import ArchitectureLayer from './ArchitectureLayer';

export default function ArchitectureDiagram() {
  const { t } = useTranslation();

  // Count total cards
  const totalCards = ARCHITECTURE_LAYERS.reduce(
    (acc, layer) => acc + layer.cards.length,
    0
  );
  const clickableCards = ARCHITECTURE_LAYERS.reduce(
    (acc, layer) => acc + layer.cards.filter((c) => c.clickable).length,
    0
  );

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-br from-slate-50 via-gray-50/80 to-slate-100/90">
      {/* Decorative background elements */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 opacity-50 blur-3xl" />
        <div className="absolute -left-40 top-1/3 h-60 w-60 rounded-full bg-gradient-to-br from-amber-100 to-orange-100 opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 right-1/4 h-80 w-80 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 opacity-40 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-gray-200/60 bg-white/80 px-6 py-8 shadow-sm backdrop-blur-xl">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between">
            {/* Left: Title section */}
            <div className="flex items-center gap-5">
              {/* Premium icon badge */}
              <div className="relative">
                <div className="absolute -inset-2 animate-pulse rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 opacity-20 blur-xl" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 shadow-2xl shadow-indigo-500/40">
                  <Layers className="h-8 w-8 text-white" />
                  {/* Sparkle decoration */}
                  <Sparkles className="absolute -right-1 -top-1 h-5 w-5 text-amber-400" />
                </div>
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                  {t('admin.architecture.title')}
                </h1>
                <p className="mt-2 max-w-lg text-sm leading-relaxed text-gray-500">
                  {t('admin.architecture.subtitle')}
                </p>
              </div>
            </div>

            {/* Right: Stats badges */}
            <div className="hidden items-center gap-3 md:flex">
              <div className="rounded-2xl bg-gradient-to-br from-gray-50 to-white px-5 py-3 shadow-lg ring-1 ring-gray-100">
                <div className="text-2xl font-bold text-gray-900">
                  {ARCHITECTURE_LAYERS.length}
                </div>
                <div className="text-xs font-medium text-gray-500">Layers</div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 px-5 py-3 shadow-lg ring-1 ring-indigo-100">
                <div className="text-2xl font-bold text-indigo-600">
                  {totalCards}
                </div>
                <div className="text-xs font-medium text-indigo-500">
                  Modules
                </div>
              </div>
              <div className="rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 px-5 py-3 shadow-lg ring-1 ring-emerald-100">
                <div className="text-2xl font-bold text-emerald-600">
                  {clickableCards}
                </div>
                <div className="text-xs font-medium text-emerald-500">
                  Configurable
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Architecture Layers */}
      <main className="relative flex-1 overflow-auto px-6 py-10">
        <div className="mx-auto max-w-6xl">
          {/* 3D Stack Effect Container */}
          <div className="relative">
            {/* Background depth shadow */}
            <div className="absolute inset-0 translate-y-6 rounded-3xl bg-gray-900/5 blur-2xl" />

            {/* Layers Stack */}
            <div className="relative space-y-0">
              {ARCHITECTURE_LAYERS.map((layer, index) => (
                <ArchitectureLayer
                  key={layer.id}
                  layer={layer}
                  layerIndex={index}
                  totalLayers={ARCHITECTURE_LAYERS.length}
                  showArrow={index < ARCHITECTURE_LAYERS.length - 1}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mx-auto mt-12 max-w-6xl">
          <div className="flex flex-wrap items-center justify-center gap-6 rounded-2xl bg-white/70 px-8 py-5 shadow-lg ring-1 ring-gray-100 backdrop-blur-xl">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Legend
            </span>
            <div className="h-6 w-px bg-gray-200" />

            {/* Clickable indicator */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-cyan-500 shadow-md">
                <MousePointerClick className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-700">
                  {t('admin.architecture.legend.clickable')}
                </div>
                <div className="text-xs text-gray-400">
                  Click to configure settings
                </div>
              </div>
            </div>

            <div className="h-6 w-px bg-gray-200" />

            {/* Read-only indicator */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-gray-300 to-gray-400 opacity-60 shadow-md">
                <Eye className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-500">
                  {t('admin.architecture.legend.readOnly')}
                </div>
                <div className="text-xs text-gray-400">
                  View only, configured elsewhere
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer note */}
        <div className="mx-auto mt-6 max-w-6xl text-center">
          <p className="text-xs text-gray-400">
            DeepDive Engine Architecture • Click on any configurable module to
            manage its settings
          </p>
        </div>
      </main>
    </div>
  );
}
