'use client';

import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  variant?: 'icon' | 'full';
  iconClassName?: string;
  className?: string;
  nameAddon?: React.ReactNode;
}

function OrbitalIcon({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <ellipse
        cx="22"
        cy="22"
        rx="20"
        ry="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.9"
        className="text-cyan-400"
      />
      <ellipse
        cx="22"
        cy="22"
        rx="20"
        ry="9"
        stroke="currentColor"
        strokeWidth="2.5"
        opacity="0.5"
        transform="rotate(60 22 22)"
        className="text-cyan-400"
      />
      <circle
        cx="22"
        cy="22"
        r="6"
        className="text-violet-500"
        fill="currentColor"
      />
    </svg>
  );
}

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
      <div
        className={`flex-shrink-0`}
        style={{
          filter:
            'drop-shadow(0 0 6px rgba(139,92,246,0.5)) drop-shadow(0 0 12px rgba(139,92,246,0.3)) drop-shadow(0 0 3px rgba(6,182,212,0.4))',
        }}
      >
        <OrbitalIcon className={iconClassName} />
      </div>

      {isFull && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className="logo-shimmer text-[16px] font-extrabold tracking-tight"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {config.brand.name}
            </span>
            {nameAddon}
          </div>
          {config.brand.subtitle && (
            <span className="text-[9px] font-semibold tracking-[0.15em] text-gray-400">
              {config.brand.subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
