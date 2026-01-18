'use client';

import { ChevronDown, Layers } from 'lucide-react';
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

// Layer badge gradient colors
const LAYER_BADGE_COLORS = {
  0: 'from-amber-500 to-orange-600',
  1: 'from-violet-500 to-purple-600',
  2: 'from-blue-500 to-indigo-600',
  3: 'from-emerald-500 to-teal-600',
} as const;

// Layer shadow colors
const LAYER_SHADOWS = {
  0: 'shadow-amber-500/20 hover:shadow-amber-500/30',
  1: 'shadow-violet-500/20 hover:shadow-violet-500/30',
  2: 'shadow-blue-500/20 hover:shadow-blue-500/30',
  3: 'shadow-emerald-500/20 hover:shadow-emerald-500/30',
} as const;

export default function ArchitectureLayer({
  layer,
  layerIndex,
  totalLayers,
  showArrow = true,
}: ArchitectureLayerProps) {
  const { t } = useTranslation();
  const colors = LAYER_COLORS[layer.color];
  const badgeGradient =
    LAYER_BADGE_COLORS[layerIndex as keyof typeof LAYER_BADGE_COLORS] ||
    LAYER_BADGE_COLORS[0];
  const layerShadow =
    LAYER_SHADOWS[layerIndex as keyof typeof LAYER_SHADOWS] || LAYER_SHADOWS[0];

  // Calculate z-index for stacking effect (top layer has highest z-index)
  const zIndex = totalLayers - layerIndex;

  return (
    <div className="relative" style={{ zIndex }}>
      {/* Layer Container with premium 3D effect */}
      <div
        className={cn(
          'relative rounded-2xl border-2 shadow-xl transition-all duration-500',
          'bg-gradient-to-br backdrop-blur-sm',
          colors.bg,
          colors.border,
          layerShadow,
          'hover:scale-[1.005]'
        )}
      >
        {/* Decorative gradient overlay */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-white/50 via-transparent to-transparent" />

        {/* Layer Header with gradient */}
        <div
          className={cn(
            'relative flex items-center justify-between rounded-t-xl border-b-2 px-6 py-5',
            'bg-gradient-to-r',
            colors.headerBg,
            colors.headerBorder
          )}
        >
          {/* Left side: Badge + Title */}
          <div className="flex items-center gap-4">
            {/* Layer number badge with premium gradient */}
            <div
              className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-xl shadow-lg',
                'bg-gradient-to-br',
                badgeGradient
              )}
            >
              <span className="text-sm font-bold text-white">
                L{totalLayers - layerIndex}
              </span>
              {/* Shine effect */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-tr from-white/30 to-transparent" />
            </div>

            {/* Title and description */}
            <div>
              <h3
                className={cn(
                  'text-base font-bold tracking-tight',
                  colors.headerText
                )}
              >
                {t(layer.titleKey)}
              </h3>
              {layer.subtitleKey && (
                <p className="mt-0.5 text-sm text-gray-500">
                  {t(layer.subtitleKey)}
                </p>
              )}
            </div>
          </div>

          {/* Right side: Card count badge */}
          <div className="flex items-center gap-2 rounded-full bg-white/60 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm backdrop-blur-sm">
            <Layers className="h-3.5 w-3.5" />
            <span>{layer.cards.length} modules</span>
          </div>
        </div>

        {/* Cards Grid with improved layout */}
        <div className="relative p-6">
          <div
            className={cn(
              'grid gap-3',
              // Responsive grid based on card count
              layer.cards.length <= 4
                ? 'grid-cols-2 md:grid-cols-4'
                : layer.cards.length <= 6
                  ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6'
                  : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'
            )}
          >
            {layer.cards.map((card) => (
              <ArchitectureCard key={card.id} card={card} />
            ))}
          </div>
        </div>

        {/* Bottom decorative line */}
        <div
          className={cn(
            'absolute bottom-0 left-6 right-6 h-0.5 rounded-full opacity-30',
            'bg-gradient-to-r',
            badgeGradient
          )}
        />
      </div>

      {/* Connection Arrow with animated gradient */}
      {showArrow && (
        <div className="relative flex justify-center py-4">
          {/* Animated gradient line */}
          <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 rounded-full bg-gradient-to-b from-gray-300 via-gray-200 to-gray-300" />

          {/* Arrow circle with pulse effect */}
          <div className="relative z-10">
            <div className="absolute inset-0 animate-ping rounded-full bg-gray-300/50" />
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-lg ring-2 ring-gray-100">
              <ChevronDown className="h-5 w-5 text-gray-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
