'use client';

import { type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils/common';

interface CreateCardProps {
  title: string;
  description?: string;
  onClick: () => void;
  icon?: ReactNode;
  className?: string;
}

/**
 * 通用「新建」占位卡 — 虚线 border → hover 渐变实化
 * 照 CreateKnowledgeBaseCard 视觉规范实现
 */
export function CreateCard({
  title,
  description,
  onClick,
  icon,
  className,
}: CreateCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group flex h-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/40 p-5 text-center transition-all hover:border-violet-300 hover:bg-violet-50/30 hover:shadow-md',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-purple-600 group-hover:shadow-lg group-hover:shadow-violet-500/30">
        {icon ?? (
          <Plus className="h-6 w-6 text-gray-400 transition-colors group-hover:text-white" />
        )}
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 group-hover:text-violet-600">
          {title}
        </p>
        {description && (
          <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-gray-500">
            {description}
          </p>
        )}
      </div>
    </button>
  );
}
