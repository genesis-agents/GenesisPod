'use client';

import Image from 'next/image';
import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  /** "icon" = icon only (collapsed), "full" = icon + text (expanded) */
  variant?: 'icon' | 'full';
  /** Icon size class, e.g. "h-8 w-8" */
  iconClassName?: string;
  /** Additional className on root element */
  className?: string;
  /** Unique gradient ID suffix to avoid SVG id collisions */
  gradientId?: string;
  /** Optional content rendered next to the brand name (e.g. version badge) */
  nameAddon?: React.ReactNode;
}

/**
 * Genesis.ai brand logo — uses the official logo image.
 * Supports icon-only (collapsed sidebar) and full (icon + text) variants.
 */
export function BrandLogo({
  variant = 'icon',
  iconClassName = 'h-8 w-8',
  className = '',
  nameAddon,
}: BrandLogoProps) {
  const isFull = variant === 'full';

  return (
    <div
      className={`flex items-center ${isFull ? 'gap-2.5' : ''} ${className}`}
    >
      <div className={`${iconClassName} relative flex-shrink-0`}>
        <Image
          src={config.brand.logo.path}
          alt={config.brand.fullName}
          fill
          className="object-contain"
          priority
        />
      </div>

      {isFull && (
        <div className="flex items-center gap-1">
          <span
            className="logo-shimmer text-[15px] font-bold tracking-tight"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {config.brand.fullName}
          </span>
          {nameAddon}
        </div>
      )}
    </div>
  );
}
