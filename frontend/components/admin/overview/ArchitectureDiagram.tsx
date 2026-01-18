'use client';

import { Settings } from 'lucide-react';
import { ARCHITECTURE_LAYERS } from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import ArchitectureLayer from './ArchitectureLayer';

export default function ArchitectureDiagram() {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-full flex-col bg-gray-50/50">
      {/* Header */}
      <header className="border-b border-gray-100 bg-white/80 px-6 py-5 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-200/50">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {t('admin.architecture.title')}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {t('admin.architecture.subtitle')}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Architecture Layers */}
      <main className="flex-1 overflow-auto px-6 py-8">
        <div className="mx-auto max-w-5xl space-y-0">
          {ARCHITECTURE_LAYERS.map((layer, index) => (
            <ArchitectureLayer
              key={layer.id}
              layer={layer}
              showArrow={index < ARCHITECTURE_LAYERS.length - 1}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="mx-auto mt-8 max-w-5xl">
          <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded border border-gray-300 bg-white shadow-sm" />
              <span>{t('admin.architecture.legend.clickable')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded border border-gray-100 bg-gray-50/50" />
              <span>{t('admin.architecture.legend.readOnly')}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
