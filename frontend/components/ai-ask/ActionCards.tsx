'use client';

import Link from 'next/link';
import {
  Search,
  PenLine,
  Users,
  Image,
  Presentation,
  TrendingUp,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';

export interface SuggestedAction {
  id: string;
  label: string;
  description: string;
  module: string;
  iconName: string;
  url: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  Search,
  PenLine,
  Users,
  Image,
  Presentation,
  TrendingUp,
};

export function ActionCards({ actions }: { actions: SuggestedAction[] }) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="mt-3 border-t border-white/5 pt-3">
      <p className="mb-2 text-xs text-gray-500">想继续深入？</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => {
          const Icon = ICON_MAP[action.iconName] ?? Search;
          return (
            <Link
              key={action.id}
              href={action.url}
              className="group flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition-all hover:border-blue-500/40 hover:bg-white/10"
            >
              <Icon
                size={16}
                className="shrink-0 text-gray-400 group-hover:text-blue-400"
              />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight text-gray-200">
                  {action.label}
                </p>
                <p className="text-xs leading-tight text-gray-500">
                  {action.description}
                </p>
              </div>
              <ArrowRight
                size={14}
                className="ml-1 shrink-0 text-gray-600 group-hover:text-blue-400"
              />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
