'use client';

import Link from 'next/link';
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
        'flex items-center gap-2.5 rounded-lg border px-3 py-2 transition-all',
        colors.bg,
        colors.border,
        colors.hoverBg,
        colors.hoverBorder,
        colors.cursor,
        card.clickable && 'shadow-sm hover:shadow'
      )}
    >
      <Icon className={cn('h-4 w-4 flex-shrink-0', colors.icon)} />
      <span className={cn('text-sm font-medium', colors.text)}>
        {t(card.i18nKey)}
      </span>
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
