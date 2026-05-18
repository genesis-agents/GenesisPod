'use client';

interface TierBadgeProps {
  tier?: 1 | 2 | 3 | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TIER_CONFIG = {
  3: { stars: '⭐⭐⭐', colorClass: 'text-violet-600' },
  2: { stars: '⭐⭐', colorClass: 'text-blue-500' },
  1: { stars: '⭐', colorClass: 'text-slate-500' },
} as const;

const SIZE_CLASS = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
} as const;

let _warnedNullTier = false;

export function TierBadge({ tier, size = 'md', className }: TierBadgeProps) {
  if (tier == null) {
    if (!_warnedNullTier) {
      console.warn('[TierBadge] tier is null or undefined — not rendering');
      _warnedNullTier = true;
    }
    return null;
  }

  const { stars, colorClass } = TIER_CONFIG[tier];
  return (
    <span
      className={`inline-flex items-center font-medium ${colorClass} ${SIZE_CLASS[size]} ${className ?? ''}`}
      aria-label={`Tier ${tier}`}
    >
      {stars}
    </span>
  );
}
