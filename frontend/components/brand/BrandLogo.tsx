'use client';

import Image from 'next/image';
import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  variant?: 'icon' | 'full';
  iconClassName?: string;
  className?: string;
  nameAddon?: React.ReactNode;
  /** 覆盖 config.brand.subtitle；传 null 隐藏副标题行 */
  subtitle?: React.ReactNode;
}

export function BrandLogo({
  variant = 'icon',
  iconClassName = 'h-10 w-10',
  className = '',
  nameAddon,
  subtitle,
}: BrandLogoProps) {
  const isFull = variant === 'full';

  return (
    <div
      className={`flex items-center ${isFull ? 'gap-2.5' : ''} ${className}`}
    >
      <div
        className="flex-shrink-0"
        style={{
          filter: 'drop-shadow(0 1px 2px rgba(11,30,63,0.18))',
        }}
      >
        <Image
          src="/favicon.svg"
          alt={config.brand.name}
          width={32}
          height={32}
          className={iconClassName}
          priority
        />
      </div>

      {isFull && (
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span
              className="logo-shimmer text-[18px] font-extrabold tracking-tight"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            >
              {config.brand.name}
            </span>
            {nameAddon}
          </div>
          {subtitle !== undefined
            ? subtitle
            : config.brand.subtitle && (
                <span className="text-[9px] font-semibold tracking-[0.15em] text-gray-400">
                  {config.brand.subtitle}
                </span>
              )}
        </div>
      )}
    </div>
  );
}
