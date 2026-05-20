'use client';

/**
 * StatusPill —— 状态徽章（done / running / failed / pending / blocked / cancelled）。
 *
 * 唯一状态视觉来源，禁止业务方再自己写 STATUS_BADGE 配置。
 */

import React from 'react';
import {
  CheckCircle2,
  Circle,
  Loader2,
  X as XIcon,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { statusToken, type StatusKey } from '@/lib/playground-design/tokens';

const STATUS_ICON: Record<StatusKey, typeof Circle> = {
  done: CheckCircle2,
  running: Loader2,
  failed: XIcon,
  pending: Circle,
  blocked: AlertTriangle,
  cancelled: XIcon,
};

interface StatusPillProps {
  status: StatusKey;
  /** 是否显示文字 label（默认 true） */
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function StatusPill({
  status,
  showLabel = true,
  size = 'sm',
}: StatusPillProps) {
  const token = statusToken[status];
  const Icon = STATUS_ICON[status];
  const isRunning = status === 'running';
  const sizeCls =
    size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ring-1',
        token.text,
        token.bg,
        token.ring,
        sizeCls
      )}
    >
      <Icon className={cn('h-3 w-3', isRunning && 'animate-spin')} />
      {showLabel && token.label}
    </span>
  );
}
