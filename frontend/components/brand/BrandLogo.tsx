'use client';

import Image from 'next/image';
import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  variant?: 'icon' | 'full';
  iconClassName?: string;
  className?: string;
  nameAddon?: React.ReactNode;
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
        className={`${iconClassName} relative flex-shrink-0`}
        style={{
          filter:
            'drop-shadow(0 0 6px rgba(99,102,241,0.5)) drop-shadow(0 0 12px rgba(139,92,246,0.35)) drop-shadow(0 0 3px rgba(6,182,212,0.4))',
        }}
      >
        <Image
          src={config.brand.logo.path}
          alt={config.brand.fullName}
          fill
          className="object-contain"
          priority
        />
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
