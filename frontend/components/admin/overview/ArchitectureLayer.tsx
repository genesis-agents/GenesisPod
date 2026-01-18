'use client';

import { ChevronDown } from 'lucide-react';
import {
  type ArchitectureLayer as LayerType,
  LAYER_STYLES,
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
  const styles = LAYER_STYLES[layer.level];

  // Count cards
  const cardCount = layer.cards
    ? layer.cards.length
    : layer.groups
      ? layer.groups.reduce((acc, g) => acc + g.cards.length, 0)
      : 0;

  // Count clickable cards
  const clickableCount = layer.cards
    ? layer.cards.filter((c) => c.clickable).length
    : layer.groups
      ? layer.groups.reduce(
          (acc, g) => acc + g.cards.filter((c) => c.clickable).length,
          0
        )
      : 0;

  return (
    <div className="relative">
      {/* Layer Container - Enhanced design with gradient background */}
      <div
        className={cn(
          'overflow-hidden rounded-xl border shadow-sm',
          styles.border,
          styles.bg
        )}
      >
        {/* Layer Header with accent bar */}
        <div className="flex">
          {/* Left accent bar */}
          <div className={cn('w-1.5 flex-shrink-0', styles.accentBar)} />

          {/* Header content */}
          <div className="flex flex-1 items-center justify-between px-5 py-4">
            <div className="flex items-center gap-4">
              {/* Level badge - larger and more prominent */}
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold shadow-sm',
                  styles.badge
                )}
              >
                L{layer.level}
              </span>

              {/* Title and description */}
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {t(layer.titleKey)}
                </h3>
                {layer.subtitleKey && (
                  <p className="mt-0.5 text-sm text-gray-500">
                    {t(layer.subtitleKey)}
                  </p>
                )}
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-gray-700">{cardCount}</span>
                <span className="text-gray-400">modules</span>
              </div>
              {clickableCount > 0 && (
                <>
                  <div className="h-4 w-px bg-gray-200" />
                  <div className="flex items-center gap-1.5">
                    <span className={cn('font-medium', styles.accent)}>
                      {clickableCount}
                    </span>
                    <span className="text-gray-400">configurable</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Cards Grid */}
        <div className="px-5 pb-5">
          {/* Regular cards */}
          {layer.cards && (
            <div className="flex flex-wrap gap-3">
              {layer.cards.map((card) => (
                <ArchitectureCard
                  key={card.id}
                  card={card}
                  layerLevel={layer.level}
                />
              ))}
            </div>
          )}

          {/* Grouped cards (for AI Apps layer) */}
          {layer.groups && (
            <div className="space-y-5">
              {layer.groups.map((group) => (
                <div key={group.id}>
                  {/* Group title with subtle line */}
                  <div className="mb-3 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {t(group.titleKey)}
                    </span>
                    <div className="h-px flex-1 bg-gray-200/50" />
                  </div>
                  {/* Group cards */}
                  <div className="flex flex-wrap gap-3">
                    {group.cards.map((card) => (
                      <ArchitectureCard
                        key={card.id}
                        card={card}
                        layerLevel={layer.level}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connection Arrow - Enhanced design */}
      {showArrow && (
        <div className="flex justify-center py-4">
          <div className="flex flex-col items-center">
            {/* Dotted line */}
            <div className="h-3 w-px border-l-2 border-dashed border-gray-300" />
            {/* Arrow circle */}
            <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-gray-200 bg-white shadow-sm">
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </div>
            {/* Dotted line */}
            <div className="h-3 w-px border-l-2 border-dashed border-gray-300" />
          </div>
        </div>
      )}
    </div>
  );
}
