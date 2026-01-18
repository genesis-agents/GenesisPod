'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import {
  type ArchitectureCard as CardType,
  CARD_COLORS,
} from '@/lib/admin/architecture';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';

interface ArchitectureCardProps {
  card: CardType;
}

export default function ArchitectureCard({ card }: ArchitectureCardProps) {
  const { t } = useTranslation();
  const Icon = card.icon;
  const colors = card.clickable ? CARD_COLORS.clickable : CARD_COLORS.readOnly;

  const cardContent = (
    <div
      className={cn(
        'group flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-all duration-200',
        colors.bg,
        colors.border,
        colors.cursor,
        card.clickable && [
          'shadow-sm ring-1 ring-gray-900/5',
          'hover:shadow-md hover:ring-gray-900/10',
          'hover:-translate-y-0.5',
          'hover:border-gray-300',
        ]
      )}
    >
      <div
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg transition-colors',
          card.clickable ? 'bg-gray-100 group-hover:bg-gray-200' : 'bg-gray-50'
        )}
      >
        <Icon className={cn('h-4 w-4 flex-shrink-0', colors.icon)} />
      </div>
      <span className={cn('text-sm font-medium', colors.text)}>
        {t(card.i18nKey)}
      </span>
      {card.clickable && (
        <ExternalLink className="ml-auto h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
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

  return cardContent;
}
