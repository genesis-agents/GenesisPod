'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { KIND_META } from '@/components/marketplace/listing-shared';
import type {
  AnyListing,
  ListingKind,
} from '@/components/marketplace/marketplace.types';

/**
 * TeamResourceSection —— 「我的团队」下三个资源库（团队工具/技能/工作流）的共用骨架。
 *
 * 三者都是「我已从市场获取的资源」，卡片样式必须统一（用户 2026-06-07 要求与工作流对齐）。
 * 差异只在：每张卡的 meta 行、底部用量文案、可选动作（如工作流「套用」）。
 */
export interface TeamResourceSectionProps {
  kind: ListingKind;
  /** 已获取的 listing（调用方从 store 的 acquired*Ids 解析好） */
  items: AnyListing[];
  /** 数量单位，如「套工作流」「个工具」「项技能」 */
  unitLabel: string;
  /** 市场货架名，如「工作流市场」 */
  marketLabel: string;
  /** 提示尾句，如「获取更多 SOP。」 */
  hint: string;
  emptyTitle: string;
  emptyDesc: string;
  /** 每张卡标题下的 meta 行（阶段链 / 来源徽章 / 适用角色等） */
  renderMeta: (item: AnyListing) => ReactNode;
  /** 底部左侧用量文案（已被 N 个团队/成员使用） */
  renderUsage: (item: AnyListing) => ReactNode;
  /** 可选底部右侧动作（如工作流「套用」） */
  action?: {
    icon: LucideIcon;
    label: string;
    onClick: (item: AnyListing) => void;
  };
}

export function TeamResourceSection({
  kind,
  items,
  unitLabel,
  marketLabel,
  hint,
  emptyTitle,
  emptyDesc,
  renderMeta,
  renderUsage,
  action,
}: TeamResourceSectionProps) {
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  const ActionIcon = action?.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          已获取 {items.length} {unitLabel}。去
          <Link
            href="/marketplace"
            className="mx-1 font-medium text-primary hover:underline"
          >
            {marketLabel}
          </Link>
          {hint}
        </p>
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          去市场 <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          type="default"
          title={emptyTitle}
          description={emptyDesc}
          action={{
            label: '去市场',
            onClick: () => {
              window.location.href = '/marketplace';
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm',
                    meta.gradient
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900">
                    {item.name}
                  </h3>
                  <p className="line-clamp-1 text-xs text-gray-500">
                    {item.tagline}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {renderMeta(item)}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
                <span>{renderUsage(item)}</span>
                {action && ActionIcon && (
                  <button
                    onClick={() => action.onClick(item)}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                  >
                    <ActionIcon className="h-3.5 w-3.5" /> {action.label}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
