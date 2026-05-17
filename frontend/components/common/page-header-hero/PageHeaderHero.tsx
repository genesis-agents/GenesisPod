'use client';

/**
 * PageHeaderHero
 *
 * AI App 主页统一的 hero 头部：圆角渐变 icon 方块 + 标题 + 副标题 + 右侧 actions slot。
 * 抽自 AI Insights / Playground (MissionGalleryView) / AI Radar 三处重复样式（2026-05-16）。
 *
 * 设计原则：
 * - 只承担 header 视觉骨架；search bar、tabs、统计条由调用方在 children 中传入或放在组件下方
 * - 颜色主题（iconGradient）由调用方注入，平台不硬编码（紫色/青色等业务气质各异）
 * - 不带 sticky / backdrop / border 等容器样式 —— 由调用方决定容器（fixed 滚动 / 普通容器）
 */

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/common';

export interface PageHeaderHeroProps {
  /** 主标题（"AI 雷达" / "AI 洞察" / "Agent Playground"） */
  title: string;
  /** 副标题，单行说明 */
  subtitle?: string;
  /**
   * Icon 节点（一般传 lucide 图标，h-7 w-7 + text-white）。
   * 不传则不渲染 icon 方块。
   */
  icon?: ReactNode;
  /**
   * Icon 方块的渐变 Tailwind 类（例 "from-violet-500 to-purple-600"）。
   * 默认 violet→purple，与 AI Insights 一致。
   */
  iconGradient?: string;
  /**
   * 阴影颜色 Tailwind 类（例 "shadow-violet-500/25"）。
   * 默认跟随 violet 主题。
   */
  iconShadowClass?: string;
  /** 右侧 actions slot（"新建"按钮 / Skills 按钮等） */
  actions?: ReactNode;
  /** 额外 className，加在根容器上 */
  className?: string;
  /** 在 header 主体下方追加内容（一般是 search bar） */
  children?: ReactNode;
}

export function PageHeaderHero({
  title,
  subtitle,
  icon,
  iconGradient = 'from-violet-500 to-purple-600',
  iconShadowClass = 'shadow-violet-500/25',
  actions,
  className,
  children,
}: PageHeaderHeroProps) {
  return (
    <div className={cn('px-8 py-6', className)}>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {icon && (
            <div
              className={cn(
                'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg',
                iconGradient,
                iconShadowClass
              )}
            >
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          <div className="flex flex-shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
      {children && <div className="mt-6">{children}</div>}
    </div>
  );
}
