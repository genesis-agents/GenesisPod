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
 * Genesis.ai brand logo — tech squirrel with circuit-trace tail and sparkle effects.
 */
export function BrandLogo({
  variant = 'icon',
  iconClassName = 'h-8 w-8',
  className = '',
  gradientId = 'brand',
  nameAddon,
}: BrandLogoProps) {
  const isFull = variant === 'full';

  return (
    <div
      className={`flex items-center ${isFull ? 'gap-2.5' : ''} ${className}`}
    >
      <svg
        className={`${iconClassName} flex-shrink-0`}
        viewBox="0 0 32 32"
        fill="none"
      >
        <defs>
          <linearGradient
            id={`bodyGrad-${gradientId}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="100%"
          >
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="50%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#A78BFA" />
          </linearGradient>
          <linearGradient
            id={`tailGrad-${gradientId}`}
            x1="0%"
            y1="100%"
            x2="100%"
            y2="0%"
          >
            <stop offset="0%" stopColor="#06B6D4" />
            <stop offset="40%" stopColor="#8B5CF6" />
            <stop offset="100%" stopColor="#EC4899" />
          </linearGradient>
          {isFull && (
            <radialGradient
              id={`sparkle-${gradientId}`}
              cx="50%"
              cy="50%"
              r="50%"
            >
              <stop offset="0%" stopColor="#EC4899" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#EC4899" stopOpacity="0" />
            </radialGradient>
          )}
        </defs>

        {/* Sparkle glow behind tail (full variant only) */}
        {isFull && (
          <circle
            cx="8"
            cy="12"
            r="10"
            fill={`url(#sparkle-${gradientId})`}
            className="opacity-40 transition-opacity group-hover:opacity-70"
          />
        )}

        {/* Tail — circuit traces */}
        <path
          d="M10 22 Q6 20 5 16 Q4 11 7 8 Q9 5.5 12 6"
          stroke={`url(#tailGrad-${gradientId})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M10 22 Q7 18 7.5 14 Q8 10 11 8.5"
          stroke={`url(#tailGrad-${gradientId})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M10 22 Q9 17 10 14 Q11 11 13.5 10"
          stroke={`url(#tailGrad-${gradientId})`}
          strokeWidth="1.6"
          strokeLinecap="round"
          fill="none"
        />

        {/* Circuit nodes on tail — colorful sparkle dots */}
        <circle
          cx="12"
          cy="6"
          r="1.3"
          fill="#06B6D4"
          className={isFull ? 'group-hover:r-[1.8] transition-all' : undefined}
        />
        <circle cx="7" cy="8" r="1.3" fill="#8B5CF6" />
        <circle cx="5" cy="16" r="1.3" fill="#EC4899" />
        <circle cx="7.5" cy="14" r="1.1" fill="#A78BFA" />
        <circle cx="11" cy="8.5" r="1.1" fill="#6366F1" />
        <circle cx="10" cy="14" r="1.1" fill="#06B6D4" />
        <circle cx="13.5" cy="10" r="1.1" fill="#EC4899" />

        {/* Sparkle halos on primary nodes */}
        <circle cx="12" cy="6" r="2.5" fill="#06B6D4" opacity="0.15" />
        <circle cx="7" cy="8" r="2.5" fill="#8B5CF6" opacity="0.15" />
        <circle cx="5" cy="16" r="2.5" fill="#EC4899" opacity="0.15" />

        {/* Body */}
        <ellipse
          cx="15"
          cy="22"
          rx="4.5"
          ry="5"
          fill={`url(#bodyGrad-${gradientId})`}
        />

        {/* Head */}
        <ellipse
          cx="19"
          cy="14.5"
          rx="4"
          ry="4.5"
          fill={`url(#bodyGrad-${gradientId})`}
        />

        {/* Ear */}
        <path d="M21 10.5 L22.5 7.5 L20 9.5" fill="#8B5CF6" />

        {/* Eye */}
        <circle cx="20.5" cy="13.5" r="1" fill="white" />
        <circle cx="20.8" cy="13.5" r="0.5" fill="#1E1B4B" />

        {/* Nose */}
        <circle cx="22.5" cy="15.5" r="0.6" fill="#C4B5FD" />

        {/* Front paw holding acorn */}
        <path
          d="M20 18 Q22 19 22.5 20.5"
          stroke={`url(#bodyGrad-${gradientId})`}
          strokeWidth="1.4"
          strokeLinecap="round"
          fill="none"
        />
        <circle cx="23" cy="21" r="1.2" fill="#F59E0B" />
      </svg>

      {isFull && (
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
