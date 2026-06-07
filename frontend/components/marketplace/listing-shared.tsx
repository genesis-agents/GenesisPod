'use client';

import {
  Bot,
  Sparkles,
  Wrench,
  Workflow,
  Star,
  type LucideIcon,
} from 'lucide-react';
import type { ListingKind } from './marketplace.types';

/** 各货架的图标 + 名称 + 强调色（token 化，不散落硬编码）。 */
export const KIND_META: Record<
  ListingKind,
  {
    label: string;
    Icon: LucideIcon;
    gradient: string;
    soft: string;
    text: string;
  }
> = {
  agent: {
    label: 'Agent',
    Icon: Bot,
    gradient: 'from-green-500 to-emerald-600',
    soft: 'bg-green-50',
    text: 'text-green-700',
  },
  skill: {
    label: '技能',
    Icon: Sparkles,
    gradient: 'from-amber-500 to-orange-600',
    soft: 'bg-amber-50',
    text: 'text-amber-700',
  },
  tool: {
    label: '工具',
    Icon: Wrench,
    gradient: 'from-blue-500 to-indigo-600',
    soft: 'bg-blue-50',
    text: 'text-blue-700',
  },
  workflow: {
    label: '工作流',
    Icon: Workflow,
    gradient: 'from-violet-500 to-purple-600',
    soft: 'bg-violet-50',
    text: 'text-violet-700',
  },
};

/** 紧凑评分 + 采用数。 */
export function RatingMeta({
  rating,
  installs,
}: {
  rating: number;
  installs: number;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-gray-500">
      <span className="inline-flex items-center gap-0.5">
        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
        {rating.toFixed(1)}
      </span>
      <span>{installs.toLocaleString()} 采用</span>
    </div>
  );
}
