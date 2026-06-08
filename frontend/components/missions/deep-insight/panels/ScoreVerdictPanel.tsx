'use client';

/**
 * ScoreVerdictPanel — 评分环（下沉自公司 MissionReportView 的内联 ScoreRing + verdictTheme）。
 *
 * 吃归一契约 score: { value; verdict }。verdict 三态收窄已在 adapter 完成，
 * 本面板只负责把 approve/revise/reject 映成视觉主题（边框 / 文字 / 标签）。
 */

import { cn } from '@/lib/utils/common';
import type { Verdict } from '../contract';

function verdictTheme(verdict: Verdict): {
  ring: string;
  text: string;
  label: string;
} {
  switch (verdict) {
    case 'approve':
      return {
        ring: 'border-emerald-500',
        text: 'text-emerald-600',
        label: '通过',
      };
    case 'reject':
      return { ring: 'border-rose-500', text: 'text-rose-600', label: '驳回' };
    default:
      return {
        ring: 'border-amber-500',
        text: 'text-amber-600',
        label: '待修订',
      };
  }
}

export interface ScoreVerdictPanelProps {
  score?: { value: number; verdict: Verdict };
  /** 无评分时的占位文案。 */
  emptyLabel?: string;
}

export function ScoreVerdictPanel({
  score,
  emptyLabel = '未评分',
}: ScoreVerdictPanelProps) {
  if (!score) {
    return <p className="text-center text-xs text-gray-400">{emptyLabel}</p>;
  }
  const theme = verdictTheme(score.verdict);
  return (
    <div className="flex flex-col items-center">
      <div
        className={cn(
          'flex h-20 w-20 flex-col items-center justify-center rounded-full border-4 bg-white',
          theme.ring
        )}
      >
        <span className={cn('text-2xl font-bold leading-none', theme.text)}>
          {score.value}
        </span>
        <span className="mt-0.5 text-xs text-gray-400">/ 100</span>
      </div>
      <span className={cn('mt-1.5 text-xs font-medium', theme.text)}>
        {theme.label}
      </span>
    </div>
  );
}

export default ScoreVerdictPanel;
