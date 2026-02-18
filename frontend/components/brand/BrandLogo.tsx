'use client';

import { useId } from 'react';
import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  variant?: 'icon' | 'full';
  iconClassName?: string;
  className?: string;
  nameAddon?: React.ReactNode;
}

function NodeRingIcon({ className = 'h-8 w-8' }: { className?: string }) {
  const id = useId();
  const gradId = `logoGrad${id}`;
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0F2A46" />
          <stop offset="40%" stopColor="#2BB7DA" />
          <stop offset="100%" stopColor="#7C5BFE" />
        </linearGradient>
      </defs>
      <circle
        cx="16"
        cy="16"
        r="10"
        stroke={`url(#${gradId})`}
        strokeWidth="2"
        fill="none"
      />
      <circle cx="16" cy="6" r="3" fill="#0F2A46" />
      <circle cx="26" cy="16" r="3" fill="#2BB7DA" />
      <circle cx="16" cy="26" r="3" fill="#7C5BFE" />
      <circle cx="6" cy="16" r="3" fill="#2BB7DA" />
      <circle cx="16" cy="16" r="3" fill={`url(#${gradId})`} />
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
        className="flex-shrink-0"
        style={{
          filter:
            'drop-shadow(0 0 6px rgba(43,183,218,0.5)) drop-shadow(0 0 10px rgba(124,91,254,0.35))',
        }}
      >
        <NodeRingIcon className={iconClassName} />
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
