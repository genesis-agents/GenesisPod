'use client';

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
 * Centralized brand logo component.
 * Extracts the inline SVG from Sidebar to a reusable component.
 */
export function BrandLogo({
  variant = 'icon',
  iconClassName = 'h-8 w-8',
  className = '',
  gradientId = 'brand',
  nameAddon,
}: BrandLogoProps) {
  return (
    <div
      className={`flex items-center ${variant === 'full' ? 'gap-2.5' : ''} ${className}`}
    >
      <svg
        className={`${iconClassName} flex-shrink-0`}
        viewBox="0 0 32 32"
        fill="none"
      >
        <defs>
          <linearGradient
            id={`logoGradient-${gradientId}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#0F2A46" />
            <stop offset="40%" stopColor="#2BB7DA" />
            <stop offset="100%" stopColor="#7C5BFE" />
          </linearGradient>
          {variant === 'full' && (
            <radialGradient id={`glow-${gradientId}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#7C5BFE" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#7C5BFE" stopOpacity="0" />
            </radialGradient>
          )}
        </defs>
        {variant === 'full' && (
          <circle
            cx="16"
            cy="16"
            r="14"
            fill={`url(#glow-${gradientId})`}
            className="opacity-50 group-hover:opacity-80"
          />
        )}
        <circle
          cx="16"
          cy="16"
          r="10"
          stroke={`url(#logoGradient-${gradientId})`}
          strokeWidth="2"
          fill="none"
          className={
            variant === 'full' ? 'group-hover:stroke-[#2BB7DA]' : undefined
          }
        />
        <circle
          cx="16"
          cy="6"
          r="3"
          fill="#0F2A46"
          className={
            variant === 'full'
              ? 'transition-colors group-hover:fill-[#2BB7DA]'
              : undefined
          }
        />
        <circle
          cx="26"
          cy="16"
          r="3"
          fill="#2BB7DA"
          className={
            variant === 'full'
              ? 'transition-colors group-hover:fill-[#7C5BFE]'
              : undefined
          }
        />
        <circle
          cx="16"
          cy="26"
          r="3"
          fill="#7C5BFE"
          className={
            variant === 'full'
              ? 'transition-colors group-hover:fill-[#0F2A46]'
              : undefined
          }
        />
        <circle
          cx="6"
          cy="16"
          r="3"
          fill="#2BB7DA"
          className={
            variant === 'full'
              ? 'transition-colors group-hover:fill-[#7C5BFE]'
              : undefined
          }
        />
        <circle
          cx="16"
          cy="16"
          r="3"
          fill={`url(#logoGradient-${gradientId})`}
          className={
            variant === 'full'
              ? 'transition-transform group-hover:scale-110'
              : undefined
          }
        />
      </svg>

      {variant === 'full' && (
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span
              className="logo-shimmer text-[15px] font-bold tracking-tight"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {config.brand.name}
            </span>
            {nameAddon}
          </div>
          <span className="logo-shimmer text-[9px] font-medium tracking-[0.15em]">
            {config.brand.subtitle}
          </span>
        </div>
      )}
    </div>
  );
}
