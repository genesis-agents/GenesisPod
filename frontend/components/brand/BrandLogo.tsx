'use client';

import { config } from '@/lib/utils/config';

interface BrandLogoProps {
  variant?: 'icon' | 'full';
  iconClassName?: string;
  className?: string;
  /** 渲染在 GENESIS 字标右侧（baseline 对齐） */
  nameAddon?: React.ReactNode;
  /**
   * 渲染为 GENESIS 字标右侧的小角标（如 v40.11.0）。
   * 传 null 显式隐藏；传 undefined 走默认 config.brand.subtitle。
   */
  subtitle?: React.ReactNode;
}

/**
 * Inline formula SVG（不走 next/image，直接嵌入 DOM 让浏览器稳定渲染 <text>）。
 * f(n,s) → {0,1}：康威生命游戏状态转移函数。
 */
function FormulaIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      className={className}
      aria-label={config.brand.name}
      role="img"
    >
      <text
        x="32"
        y="38"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="11"
        fill="#18181b"
      >
        <tspan fontStyle="italic">f(n,s)</tspan>
        {' → {'}
        <tspan fill="#D97706" fontStyle="italic" fontWeight="700">
          0,1
        </tspan>
        {'}'}
      </text>
    </svg>
  );
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
    <div className={`inline-flex flex-col items-start ${className}`}>
      <div
        className="flex-shrink-0"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(24,24,27,0.15))' }}
      >
        <FormulaIcon className={iconClassName} />
      </div>

      {isFull && (
        <div className="mt-1.5 flex items-baseline gap-1">
          <span className="font-serif text-[15px] font-bold leading-none tracking-[0.06em] text-[#18181b]">
            {config.brand.name}
          </span>
          {nameAddon}
          {subtitle !== null && subtitle !== undefined && (
            <span className="text-[9px] font-medium leading-none tracking-wider text-[#a19a8d]">
              {subtitle}
            </span>
          )}
          {subtitle === undefined && config.brand.subtitle && (
            <span className="text-[9px] font-medium leading-none tracking-wider text-[#a19a8d]">
              {config.brand.subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
