'use client';

import { cn } from '@/lib/utils/common';

/**
 * 可用主题配置
 */
export const SLIDE_THEMES = [
  {
    id: 'genspark-dark',
    name: '深邃蓝',
    description: '专业深色主题',
    preview: {
      bg: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      accent: '#F97316',
      text: '#F8FAFC',
    },
  },
  {
    id: 'tech-purple',
    name: '科技紫',
    description: '科技感主题',
    preview: {
      bg: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
      accent: '#A78BFA',
      text: '#F8FAFC',
    },
  },
  {
    id: 'executive-white',
    name: '商务白',
    description: '简洁商务主题',
    preview: {
      bg: 'linear-gradient(135deg, #FFFFFF 0%, #F1F5F9 100%)',
      accent: '#0EA5E9',
      text: '#1E293B',
    },
  },
  {
    id: 'nature-green',
    name: '自然绿',
    description: '清新自然主题',
    preview: {
      bg: 'linear-gradient(135deg, #064E3B 0%, #065F46 100%)',
      accent: '#34D399',
      text: '#F8FAFC',
    },
  },
  {
    id: 'warm-sunset',
    name: '暖阳橙',
    description: '温暖活力主题',
    preview: {
      bg: 'linear-gradient(135deg, #7C2D12 0%, #9A3412 100%)',
      accent: '#FB923C',
      text: '#F8FAFC',
    },
  },
] as const;

export type SlideThemeId = (typeof SLIDE_THEMES)[number]['id'];

interface ThemeSelectorProps {
  value: SlideThemeId;
  onChange: (themeId: SlideThemeId) => void;
  className?: string;
  compact?: boolean;
}

/**
 * 主题选择器组件
 * 用于在幻灯片生成时选择主题风格
 */
export function ThemeSelector({
  value,
  onChange,
  className,
  compact = false,
}: ThemeSelectorProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {!compact && (
        <label className="text-xs font-medium text-slate-400">主题风格</label>
      )}
      <div
        className={cn(
          'grid gap-2',
          compact ? 'grid-cols-5' : 'grid-cols-3 sm:grid-cols-5'
        )}
      >
        {SLIDE_THEMES.map((theme) => (
          <button
            key={theme.id}
            onClick={() => onChange(theme.id)}
            className={cn(
              'group relative flex flex-col overflow-hidden rounded-lg border-2 transition-all hover:scale-105',
              value === theme.id
                ? 'border-orange-500 ring-2 ring-orange-500/20'
                : 'border-slate-700 hover:border-slate-500'
            )}
            title={theme.description}
          >
            {/* 预览区域 */}
            <div
              className={cn(
                'relative aspect-[16/9] w-full',
                compact ? 'min-h-[40px]' : 'min-h-[60px]'
              )}
              style={{ background: theme.preview.bg }}
            >
              {/* 模拟内容 */}
              <div className="absolute inset-2 flex flex-col gap-1">
                <div
                  className="h-1 w-3/4 rounded-full"
                  style={{ background: theme.preview.text, opacity: 0.9 }}
                />
                <div
                  className="h-0.5 w-1/2 rounded-full"
                  style={{ background: theme.preview.text, opacity: 0.5 }}
                />
                <div className="mt-auto flex gap-1">
                  <div
                    className="h-2 w-2 rounded-sm"
                    style={{ background: theme.preview.accent }}
                  />
                  <div
                    className="h-2 w-2 rounded-sm"
                    style={{ background: theme.preview.accent, opacity: 0.6 }}
                  />
                </div>
              </div>

              {/* 选中标记 */}
              {value === theme.id && (
                <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-orange-500">
                  <svg
                    className="h-2.5 w-2.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
              )}
            </div>

            {/* 名称 */}
            {!compact && (
              <div className="bg-slate-800/50 px-2 py-1 text-center">
                <span className="text-[10px] font-medium text-slate-300">
                  {theme.name}
                </span>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 获取主题信息
 */
export function getThemeInfo(themeId: SlideThemeId) {
  return SLIDE_THEMES.find((t) => t.id === themeId) || SLIDE_THEMES[0];
}
