'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import {
  type ArchitectureCard as CardType,
  CARD_COLOR_SCHEMES,
} from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';

interface ArchitectureCardProps {
  card: CardType;
}

export default function ArchitectureCard({ card }: ArchitectureCardProps) {
  const { t } = useTranslation();
  const Icon = card.icon;
  const colorScheme = card.color
    ? CARD_COLOR_SCHEMES[card.color]
    : CARD_COLOR_SCHEMES.slate;

  const cardContent = (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-300',
        colorScheme.bg,
        colorScheme.border,
        card.clickable
          ? [
              'cursor-pointer',
              'shadow-sm',
              colorScheme.bgHover,
              colorScheme.borderHover,
              'hover:shadow-lg',
              'hover:-translate-y-1',
              'hover:scale-[1.02]',
              'active:scale-[0.98]',
            ]
          : ['cursor-default', 'opacity-75']
      )}
    >
      {/* Icon with gradient background */}
      <div
        className={cn(
          'relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg shadow-md transition-all duration-300',
          colorScheme.iconBg,
          card.clickable && 'group-hover:scale-110 group-hover:shadow-lg'
        )}
      >
        <Icon className={cn('h-4.5 w-4.5', colorScheme.iconColor)} />
        {/* Shine effect */}
        <div className="absolute inset-0 rounded-lg bg-gradient-to-tr from-white/20 to-transparent" />
      </div>

      {/* Label */}
      <span
        className={cn(
          'text-sm font-semibold tracking-tight transition-colors',
          colorScheme.text,
          card.clickable && 'group-hover:text-gray-900'
        )}
      >
        {t(card.i18nKey)}
      </span>

      {/* Arrow indicator for clickable cards */}
      {card.clickable && (
        <ArrowRight
          className={cn(
            'ml-auto h-4 w-4 flex-shrink-0 transition-all duration-300',
            'text-gray-300 opacity-0',
            'group-hover:translate-x-1 group-hover:text-gray-500 group-hover:opacity-100'
          )}
        />
      )}

      {/* Subtle glow effect on hover */}
      {card.clickable && (
        <div
          className={cn(
            'absolute inset-0 -z-10 rounded-xl opacity-0 blur-xl transition-opacity duration-300',
            'group-hover:opacity-30',
            colorScheme.iconBg
          )}
        />
      )}
    </div>
  );

  if (card.clickable && card.href) {
    return (
      <Link href={card.href} className="block min-w-[160px] flex-1">
        {cardContent}
      </Link>
    );
  }

  return <div className="min-w-[120px] flex-1">{cardContent}</div>;
}
