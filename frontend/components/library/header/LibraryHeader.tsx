'use client';

import { BookOpen, Plus, Search, X } from 'lucide-react';
import { BRAND_GRADIENT } from '../_design/tokens';

interface LibraryHeaderProps {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  primaryAction?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * 知识库统一 Header（与 AI Office / AI Research 同构）
 * - 左：渐变方块 logo + 标题 + 副标题
 * - 右：主 CTA
 * - 下：紧凑搜索框
 */
export default function LibraryHeader({
  title,
  subtitle,
  searchPlaceholder,
  searchQuery,
  onSearchChange,
  primaryAction,
}: LibraryHeaderProps) {
  return (
    <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/70 backdrop-blur-sm">
      <div className="px-8 pb-4 pt-6">
        {/* Title row */}
        <div className="mb-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${BRAND_GRADIENT.gradient} shadow-lg ${BRAND_GRADIENT.shadow}`}
            >
              <BookOpen className="h-7 w-7 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-500">{subtitle}</p>
            </div>
          </div>
          {primaryAction && (
            <button
              onClick={primaryAction.onClick}
              className={`inline-flex items-center gap-2 rounded-xl bg-gradient-to-r ${BRAND_GRADIENT.gradient} px-4 py-2.5 text-sm font-semibold text-white shadow-lg ${BRAND_GRADIENT.shadow} transition-all hover:shadow-xl`}
            >
              <Plus className="h-4 w-4" />
              {primaryAction.label}
            </button>
          )}
        </div>

        {/* Search bar (单行紧凑) */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm shadow-sm placeholder:text-gray-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
