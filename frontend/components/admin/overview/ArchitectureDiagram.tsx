'use client';

import { Settings, Layers } from 'lucide-react';
import { ARCHITECTURE_LAYERS } from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import ArchitectureLayer from './ArchitectureLayer';

export default function ArchitectureDiagram() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col bg-gradient-to-b from-slate-50 via-gray-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-gray-200/60 bg-white/90 px-6 py-6 shadow-sm backdrop-blur-md">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-5">
            <div className="relative">
              <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 opacity-20 blur-lg" />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 shadow-xl shadow-indigo-500/30">
                <Layers className="h-7 w-7 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                {t('admin.architecture.title')}
              </h1>
              <p className="mt-1.5 text-sm text-gray-500">
                {t('admin.architecture.subtitle')}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Architecture Layers */}
      <main className="flex-1 overflow-auto px-6 py-10">
        <div className="mx-auto max-w-5xl">
          {/* 3D Stack Effect Container */}
          <div className="relative">
            {/* Background depth shadow */}
            <div className="absolute inset-0 translate-y-4 rounded-3xl bg-gray-900/5 blur-xl" />

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
        <div className="mx-auto mt-10 max-w-5xl">
          <div className="flex items-center justify-center gap-8 rounded-xl bg-white/60 px-6 py-3 shadow-sm ring-1 ring-gray-900/5 backdrop-blur-sm">
            <div className="flex items-center gap-2.5">
              <div className="h-4 w-4 rounded-md border border-gray-300 bg-white shadow-sm ring-1 ring-gray-900/5" />
              <span className="text-sm font-medium text-gray-600">
                {t('admin.architecture.legend.clickable')}
              </span>
            </div>
            <div className="h-4 w-px bg-gray-200" />
            <div className="flex items-center gap-2.5">
              <div className="h-4 w-4 rounded-md border border-gray-200 bg-gray-100/80" />
              <span className="text-sm font-medium text-gray-400">
                {t('admin.architecture.legend.readOnly')}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
