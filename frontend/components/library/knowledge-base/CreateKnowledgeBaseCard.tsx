'use client';

import { Plus } from 'lucide-react';

interface CreateKnowledgeBaseCardProps {
  title: string;
  description: string;
  onClick: () => void;
}

/**
 * 网格首格的"新建"占位卡（虚线 → hover 实化）
 * 与 AI Research 创建项目卡同位
 */
export default function CreateKnowledgeBaseCard({
  title,
  description,
  onClick,
}: CreateKnowledgeBaseCardProps) {
  return (
    <button
      onClick={onClick}
      className="group flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50/40 p-6 text-center transition-all hover:border-violet-300 hover:bg-violet-50/30 hover:shadow-md"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm transition-all group-hover:bg-gradient-to-br group-hover:from-violet-500 group-hover:to-purple-600 group-hover:shadow-lg group-hover:shadow-violet-500/30">
        <Plus className="h-6 w-6 text-gray-400 transition-colors group-hover:text-white" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-700 group-hover:text-violet-600">
          {title}
        </p>
        <p className="mt-1 max-w-[200px] text-xs leading-relaxed text-gray-500">
          {description}
        </p>
      </div>
    </button>
  );
}
