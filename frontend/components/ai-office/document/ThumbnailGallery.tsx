'use client';

/**
 * ThumbnailGallery - Genspark 风格可展开缩略图画廊
 * 支持网格视图、拖拽排序、点击跳转
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  Squares2X2Icon,
  Bars3Icon,
  CheckIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/lib/utils/common';

interface ThumbnailItem {
  index: number;
  title: string;
  subtitle?: string;
  purpose?: string;
  isActive?: boolean;
}

interface ThumbnailGalleryProps {
  items: ThumbnailItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  className?: string;
}

type ViewMode = 'strip' | 'grid';

// 幻灯片类型标签映射
const purposeLabels: Record<string, { label: string; color: string }> = {
  title: { label: '标题', color: 'bg-purple-100 text-purple-700' },
  agenda: { label: '议程', color: 'bg-blue-100 text-blue-700' },
  section_header: { label: '章节', color: 'bg-indigo-100 text-indigo-700' },
  content: { label: '内容', color: 'bg-gray-100 text-gray-600' },
  comparison: { label: '对比', color: 'bg-orange-100 text-orange-700' },
  timeline: { label: '时间线', color: 'bg-cyan-100 text-cyan-700' },
  statistics: { label: '数据', color: 'bg-green-100 text-green-700' },
  quote: { label: '引用', color: 'bg-pink-100 text-pink-700' },
  team: { label: '团队', color: 'bg-amber-100 text-amber-700' },
  image_focus: { label: '图片', color: 'bg-teal-100 text-teal-700' },
  chart: { label: '图表', color: 'bg-lime-100 text-lime-700' },
  closing: { label: '结束', color: 'bg-rose-100 text-rose-700' },
  qna: { label: 'Q&A', color: 'bg-violet-100 text-violet-700' },
};

export default function ThumbnailGallery({
  items,
  currentIndex,
  onSelect,
  className,
}: ThumbnailGalleryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('strip');

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={cn('bg-white', className)}>
      {/* 折叠时的简洁视图 */}
      {!isExpanded && (
        <button
          onClick={() => setIsExpanded(true)}
          className="flex w-full items-center justify-center gap-2 py-2 text-xs text-gray-500 transition-colors hover:bg-gray-50"
        >
          <span>展开缩略图 ({items.length} 页)</span>
          <ChevronDownIcon className="h-3 w-3" />
        </button>
      )}

      {/* 展开后的完整视图 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* 头部工具栏 */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-gray-500">
                  所有幻灯片
                </span>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {items.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* 视图切换 */}
                <div className="flex rounded-lg border border-gray-200 p-0.5">
                  <button
                    onClick={() => setViewMode('strip')}
                    className={cn(
                      'rounded-md p-1.5 transition-colors',
                      viewMode === 'strip'
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-400 hover:text-gray-600'
                    )}
                    title="条状视图"
                  >
                    <Bars3Icon className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setViewMode('grid')}
                    className={cn(
                      'rounded-md p-1.5 transition-colors',
                      viewMode === 'grid'
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-400 hover:text-gray-600'
                    )}
                    title="网格视图"
                  >
                    <Squares2X2Icon className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* 收起按钮 */}
                <button
                  onClick={() => setIsExpanded(false)}
                  className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <ChevronUpIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 缩略图内容 */}
            <div className="p-3">
              {viewMode === 'strip' ? (
                // 条状视图（水平滚动）
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {items.map((item) => (
                    <ThumbnailCard
                      key={item.index}
                      item={item}
                      isActive={item.index === currentIndex}
                      onClick={() => onSelect(item.index)}
                      compact
                    />
                  ))}
                </div>
              ) : (
                // 网格视图
                <div className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto">
                  {items.map((item) => (
                    <ThumbnailCard
                      key={item.index}
                      item={item}
                      isActive={item.index === currentIndex}
                      onClick={() => onSelect(item.index)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* 页码指示器 */}
            <div className="flex items-center justify-center gap-1 border-t border-gray-100 py-2">
              <span className="text-sm font-medium text-blue-600">
                {currentIndex + 1}
              </span>
              <span className="text-sm text-gray-400">/</span>
              <span className="text-sm text-gray-500">{items.length}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// 缩略图卡片组件
function ThumbnailCard({
  item,
  isActive,
  onClick,
  compact = false,
}: {
  item: ThumbnailItem;
  isActive: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  const purposeInfo = item.purpose
    ? purposeLabels[item.purpose] || {
        label: item.purpose,
        color: 'bg-gray-100 text-gray-600',
      }
    : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex-shrink-0 rounded-lg border-2 transition-all',
        compact ? 'w-28' : 'w-full',
        isActive
          ? 'border-blue-500 bg-blue-50 shadow-md'
          : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'
      )}
    >
      {/* 卡片内容 */}
      <div className={cn('p-2 text-left', compact ? '' : 'aspect-video')}>
        {/* 页码和选中指示 */}
        <div className="mb-1 flex items-center justify-between">
          <span
            className={cn(
              'text-[10px] font-medium',
              isActive ? 'text-blue-600' : 'text-gray-400'
            )}
          >
            {item.index + 1}
          </span>
          {isActive && (
            <div className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-500">
              <CheckIcon className="h-2.5 w-2.5 text-white" />
            </div>
          )}
        </div>

        {/* 标题 */}
        <div
          className={cn(
            'line-clamp-2 text-xs font-medium leading-tight',
            isActive ? 'text-blue-900' : 'text-gray-900'
          )}
        >
          {item.title}
        </div>

        {/* 类型标签 */}
        {purposeInfo && !compact && (
          <div className="mt-1.5">
            <span
              className={cn(
                'inline-block rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                purposeInfo.color
              )}
            >
              {purposeInfo.label}
            </span>
          </div>
        )}
      </div>

      {/* 悬停效果 */}
      <div
        className={cn(
          'absolute inset-0 rounded-lg opacity-0 transition-opacity group-hover:opacity-100',
          'pointer-events-none bg-gradient-to-t from-blue-500/5 to-transparent'
        )}
      />
    </button>
  );
}
