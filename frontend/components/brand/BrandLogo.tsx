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

/** Compact 方形图标：单 italic `f` 居中。折叠 sidebar / favicon tab 等小尺寸场合用。 */
function FormulaIconCompact({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      className={className}
      aria-label={config.brand.name}
      role="img"
    >
      <text
        x="16"
        y="24"
        textAnchor="middle"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="26"
        fontStyle="italic"
        fill="#18181b"
      >
        f
      </text>
    </svg>
  );
}

/** Wide 矩形图标：完整公式 f(n,s) → {0,1}。展开 sidebar / 登录 hero 等大尺寸场合用。
 *  viewBox 高度收紧到 26（公式实际只占 22 高，padding 上下 2px），
 *  让 fontSize 22 在画布上占比 ≈85%，配合更高的 iconClassName 渲染像素更大。 */
function FormulaIconWide({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 130 26"
      className={className}
      aria-label={`${config.brand.name} formula`}
      role="img"
    >
      <text
        x="65"
        y="20"
        textAnchor="middle"
        textLength="118"
        lengthAdjust="spacingAndGlyphs"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontSize="22"
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
  iconClassName,
  className = '',
  nameAddon,
  subtitle,
}: BrandLogoProps) {
  const isFull = variant === 'full';

  // variant 自适应默认尺寸
  const Icon = isFull ? FormulaIconWide : FormulaIconCompact;
  const defaultIconClass = isFull ? 'h-12 w-auto' : 'h-8 w-8';
  const finalIconClass = iconClassName ?? defaultIconClass;

  return (
    <div className={`inline-flex flex-col items-start ${className}`}>
      <div
        className="flex-shrink-0"
        style={{ filter: 'drop-shadow(0 1px 2px rgba(24,24,27,0.15))' }}
      >
        <Icon className={finalIconClass} />
      </div>

      {isFull && (
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span
            className="logo-shimmer text-[16px] font-extrabold leading-none tracking-[0.06em]"
            style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
          >
            {config.brand.name}
          </span>
          {nameAddon}
          {subtitle !== null && subtitle !== undefined && (
            <span className="text-[7px] font-medium leading-none tracking-wider text-[#a19a8d]">
              {subtitle}
            </span>
          )}
          {subtitle === undefined && config.brand.subtitle && (
            <span className="text-[7px] font-medium leading-none tracking-wider text-[#a19a8d]">
              {config.brand.subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
