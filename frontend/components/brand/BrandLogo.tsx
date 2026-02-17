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
  iconClassName = 'h-10 w-10',
  className = '',
  nameAddon,
}: BrandLogoProps) {
  const isFull = variant === 'full';

  return (
    <div className={`flex items-center ${isFull ? 'gap-1' : ''} ${className}`}>
      <div
        className={`${iconClassName} relative flex-shrink-0`}
        style={{
          filter:
            'drop-shadow(0 0 4px rgba(6,182,212,0.4)) drop-shadow(0 0 8px rgba(139,92,246,0.3)) drop-shadow(0 0 2px rgba(236,72,153,0.3))',
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
        <div className="flex items-center gap-1.5">
          <span
            className="logo-shimmer text-[14px] font-bold tracking-tight"
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
