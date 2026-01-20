'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  type ArchitectureCard as CardType,
  LAYER_STYLES,
} from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';

interface ArchitectureCardProps {
  card: CardType;
  layerLevel: 1 | 2 | 3;
  fixedWidth?: boolean;
}

export default function ArchitectureCard({
  card,
  layerLevel,
  fixedWidth = false,
}: ArchitectureCardProps) {
  const { t } = useTranslation();
  const Icon = card.icon;
  const styles = LAYER_STYLES[layerLevel];

  // Configurable cards (L1/L2) should be bigger
  const isConfigurable = fixedWidth && card.clickable;

  const cardContent = (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg border transition-all duration-200',
        fixedWidth && 'w-full', // Fill grid cell width
        // Bigger padding for configurable L1/L2 cards
        isConfigurable ? 'px-4 py-3' : 'px-3 py-2',
        card.clickable
          ? [
              'cursor-pointer border-gray-200 bg-white shadow-sm',
              'hover:border-gray-300 hover:shadow-md',
              styles.hoverBorder,
            ]
          : ['cursor-default border-gray-100/50 bg-white/60']
      )}
    >
      {/* Icon with layer color - bigger for configurable cards */}
      <div
        className={cn(
          'flex flex-shrink-0 items-center justify-center rounded-lg transition-colors',
          isConfigurable ? 'h-9 w-9' : 'h-7 w-7',
          card.clickable ? styles.iconBg : 'bg-gray-100/80 text-gray-400'
        )}
      >
        <Icon className={isConfigurable ? 'h-5 w-5' : 'h-4 w-4'} />
      </div>

      {/* Label - consistent text-sm for all cards */}
      <span
        className={cn(
          'text-sm font-medium',
          card.clickable
            ? 'text-gray-700 group-hover:text-gray-900'
            : 'text-gray-500'
        )}
      >
        {t(card.i18nKey)}
      </span>

      {/* Arrow indicator for clickable cards */}
      {card.clickable && (
        <ArrowRight
          className={cn(
            'ml-auto flex-shrink-0 text-gray-300 transition-all duration-200',
            isConfigurable ? 'h-4 w-4' : 'h-3.5 w-3.5',
            'group-hover:translate-x-0.5',
            `group-hover:${styles.accent}`
          )}
        />
      )}
    </div>
  );

  if (card.clickable && card.href) {
    return (
      <Link href={card.href} className={cn('block', fixedWidth && 'w-full')}>
        {cardContent}
      </Link>
    );
  }

  return <div className={cn(fixedWidth && 'w-full')}>{cardContent}</div>;
}
