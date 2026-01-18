'use client';

import { ChevronDown } from 'lucide-react';
import {
  type ArchitectureLayer as LayerType,
  LAYER_COLORS,
} from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';
import ArchitectureCard from './ArchitectureCard';

interface ArchitectureLayerProps {
  layer: LayerType;
  layerIndex: number;
  totalLayers: number;
  showArrow?: boolean;
}

export default function ArchitectureLayer({
  layer,
  layerIndex,
  totalLayers,
  showArrow = true,
}: ArchitectureLayerProps) {
  const { t } = useTranslation();
  const colors = LAYER_COLORS[layer.color];

  // Calculate z-index for stacking effect (top layer has highest z-index)
  const zIndex = totalLayers - layerIndex;

  return (
    <div className="relative" style={{ zIndex }}>
      {/* Layer Container with 3D depth effect */}
      <div
        className={cn(
          'relative rounded-2xl border shadow-lg transition-all duration-300',
          'bg-gradient-to-b',
          colors.bg,
          colors.border,
          // Add depth shadow based on layer position
          layerIndex === 0 && 'shadow-amber-200/50',
          layerIndex === 1 && 'shadow-violet-200/50',
          layerIndex === 2 && 'shadow-blue-200/50',
          layerIndex === 3 && 'shadow-emerald-200/50'
        )}
      >
        {/* Layer Header with gradient */}
        <div
          className={cn(
            'flex items-center justify-between rounded-t-xl border-b px-5 py-4',
            'bg-gradient-to-r',
            colors.headerBg,
            colors.headerBorder
          )}
        >
          <div className="flex items-center gap-3">
            {/* Layer number badge */}
            <div
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold shadow-sm',
                layerIndex === 0 && 'bg-amber-500 text-white',
                layerIndex === 1 && 'bg-violet-500 text-white',
                layerIndex === 2 && 'bg-blue-500 text-white',
                layerIndex === 3 && 'bg-emerald-500 text-white'
              )}
            >
              {totalLayers - layerIndex}
            </div>
            <div>
              <h3 className={cn('text-sm font-bold', colors.headerText)}>
                {t(layer.titleKey)}
              </h3>
              {layer.subtitleKey && (
                <p className="mt-0.5 text-xs text-gray-500/80">
                  {t(layer.subtitleKey)}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="p-5">
          <div className="flex flex-wrap gap-2.5">
            {layer.cards.map((card) => (
              <ArchitectureCard key={card.id} card={card} />
            ))}
          </div>
        </div>
      </div>

      {/* Connection Arrow */}
      {showArrow && (
        <div className="relative flex justify-center py-3">
          {/* Vertical line */}
          <div className="absolute left-1/2 top-0 h-full w-0.5 -translate-x-1/2 bg-gradient-to-b from-gray-300 to-gray-200" />
          {/* Arrow icon */}
          <div className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-gray-200">
            <ChevronDown className="h-5 w-5 text-gray-400" />
          </div>
        </div>
      )}
    </div>
  );
}
