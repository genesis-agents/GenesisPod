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
  layerLevel: 1 | 2 | 3 | 4 | 5;
  fixedWidth?: boolean;
  overviewStats?: Record<string, number>;
}

export default function ArchitectureCard({
  card,
  layerLevel,
  fixedWidth = false,
  overviewStats,
}: ArchitectureCardProps) {
  const { t } = useTranslation();
  const Icon = card.icon;
  const styles = LAYER_STYLES[layerLevel];

  // Configurable cards (L1/L2) should be bigger
  const isConfigurable = fixedWidth && card.clickable;

  // Resolve stat values from the overview stats response
  const resolvedStats =
    card.stats && overviewStats
      ? card.stats.map((s) => ({
          label: s.label,
          value: overviewStats[s.key] ?? 0,
        }))
      : null;

  const cardContent = (
    <div
      className={cn(
        'group flex flex-col rounded-lg border transition-all duration-200',
        fixedWidth && 'w-full',
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
      {/* Top row: icon + label + arrow */}
      <div className="flex items-center gap-2">
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

        {/* Label */}
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm font-medium',
            card.clickable
              ? 'text-gray-700 group-hover:text-gray-900'
              : 'text-gray-500'
          )}
          title={t(card.i18nKey)}
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

      {/* Stats row */}
      {resolvedStats && resolvedStats.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {resolvedStats.map((s) => (
            <span
              key={s.label}
              className="flex items-baseline gap-1 whitespace-nowrap"
            >
              <span
                className={cn(
                  'text-xs font-semibold tabular-nums',
                  card.clickable ? styles.accent : 'text-gray-500'
                )}
              >
                {s.value.toLocaleString()}
              </span>
              <span className="text-[10px] text-gray-400">{s.label}</span>
            </span>
          ))}
        </div>
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
