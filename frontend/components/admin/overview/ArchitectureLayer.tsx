'use client';

import {
  type ArchitectureLayer as LayerType,
  LAYER_COLORS,
} from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';
import ArchitectureCard from './ArchitectureCard';

interface ArchitectureLayerProps {
  layer: LayerType;
  showArrow?: boolean;
}

export default function ArchitectureLayer({
  layer,
  showArrow = true,
}: ArchitectureLayerProps) {
  const { t } = useTranslation();
  const colors = LAYER_COLORS[layer.color];

  return (
    <div className="relative">
      {/* Layer Container */}
      <div className={cn('rounded-xl border-2', colors.bg, colors.border)}>
        {/* Layer Header */}
        <div
          className={cn(
            'flex items-center justify-between rounded-t-lg border-b px-4 py-3',
            colors.headerBg,
            colors.headerBorder
          )}
        >
          <div>
            <h3 className={cn('text-sm font-semibold', colors.headerText)}>
              {t(layer.titleKey)}
            </h3>
            {layer.subtitleKey && (
              <p className="mt-0.5 text-xs text-gray-500">
                {t(layer.subtitleKey)}
              </p>
            )}
          </div>
        </div>

        {/* Cards Grid */}
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {layer.cards.map((card) => (
              <ArchitectureCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </div>

      {/* Arrow Down */}
      {showArrow && (
        <div className="flex justify-center py-2">
          <svg
            className={cn('h-6 w-6', colors.arrow)}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </div>
      )}
    </div>
  );
}
