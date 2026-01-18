'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { type ArchitectureCard as CardType } from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';

interface ArchitectureCardProps {
  card: CardType;
}

export default function ArchitectureCard({ card }: ArchitectureCardProps) {
  const { t } = useTranslation();
  const Icon = card.icon;

  const cardContent = (
    <div
      className={cn(
        'group flex items-center gap-2.5 rounded-md border px-3 py-2.5 transition-all duration-150',
        card.clickable
          ? [
              'cursor-pointer border-gray-200 bg-white',
              'hover:border-gray-300 hover:shadow-sm',
            ]
          : ['cursor-default border-gray-100 bg-gray-50/50']
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md',
          card.clickable
            ? 'bg-gray-100 text-gray-600'
            : 'bg-gray-100/50 text-gray-400'
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Label */}
      <span
        className={cn(
          'flex-1 truncate text-sm',
          card.clickable
            ? 'font-medium text-gray-700 group-hover:text-gray-900'
            : 'text-gray-500'
        )}
      >
        {t(card.i18nKey)}
      </span>

      {/* Arrow indicator for clickable cards */}
      {card.clickable && (
        <ArrowRight
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-gray-300 transition-all duration-150',
            'group-hover:translate-x-0.5 group-hover:text-gray-500'
          )}
        />
      )}
    </div>
  );

  if (card.clickable && card.href) {
    return (
      <Link href={card.href} className="block">
        {cardContent}
      </Link>
    );
  }

  return <div>{cardContent}</div>;
}
