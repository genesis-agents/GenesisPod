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

  return (
    <div className="relative">
      {/* Layer Container - Clean, minimal design */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {/* Layer Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-3">
            {/* Level badge */}
            <span
              className={cn(
                'rounded-md px-2 py-1 text-xs font-medium',
                styles.badge
              )}
            >
              L{layer.level}
            </span>

            {/* Title and description */}
            <div>
              <h3 className="text-sm font-medium text-gray-900">
                {t(layer.titleKey)}
              </h3>
              {layer.subtitleKey && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {t(layer.subtitleKey)}
                </p>
              )}
            </div>
          </div>

          {/* Card count */}
          <span className="text-xs text-gray-400">{cardCount} modules</span>
        </div>

        {/* Cards Grid */}
        <div className="p-5">
          {/* Regular cards */}
          {layer.cards && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
              {layer.cards.map((card) => (
                <ArchitectureCard key={card.id} card={card} />
              ))}
            </div>
          )}

          {/* Grouped cards (for AI Apps layer) */}
          {layer.groups && (
            <div className="space-y-4">
              {layer.groups.map((group) => (
                <div key={group.id}>
                  {/* Group title */}
                  <div className="mb-2 text-xs font-medium text-gray-400">
                    {t(group.titleKey)}
                  </div>
                  {/* Group cards */}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                    {group.cards.map((card) => (
                      <ArchitectureCard key={card.id} card={card} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Connection Arrow */}
      {showArrow && (
        <div className="flex justify-center py-3">
          <div className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white">
            <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
          </div>
        </div>
      )}
    </div>
  );
}
