// PR-8 v1.6 D1 reportScale 6 卡片单选 UI
//
// 用法（DemoLauncher 集成）：
//   <ScalePresetCardGrid value={scale} onChange={setScale} userTier={user.tier} />
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D1

'use client';

import * as React from 'react';
import {
  SCALE_PRESET_CARDS,
  isScaleAllowedForTier,
  type ReportScale,
} from '@/lib/agent-playground/scale-presets';

export interface ScalePresetCardGridProps {
  value: ReportScale;
  onChange: (scale: ReportScale) => void;
  userTier: 'free' | 'pro' | 'enterprise';
}

const ALL_SCALES: ReportScale[] = [
  'quick',
  'standard',
  'deep',
  'professional',
  'publication',
  'encyclopedia',
];

export function ScalePresetCardGrid({
  value,
  onChange,
  userTier,
}: ScalePresetCardGridProps): React.ReactElement {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {ALL_SCALES.map((scale) => {
        const card = SCALE_PRESET_CARDS[scale];
        const tierAllowed = isScaleAllowedForTier(scale, userTier);
        const locked = card.locked || !tierAllowed;
        const selected = value === scale;
        return (
          <button
            key={scale}
            type="button"
            disabled={locked}
            onClick={() => !locked && onChange(scale)}
            title={
              locked
                ? (card.lockedTooltip ?? '需要升级到更高 tier 才能使用')
                : card.description
            }
            className={[
              'relative flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all',
              selected && !locked
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                : 'border-gray-200 bg-white hover:border-gray-300',
              locked
                ? 'cursor-not-allowed opacity-50 hover:border-gray-200'
                : 'cursor-pointer',
            ].join(' ')}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-2xl">{card.emoji}</span>
              {locked && (
                <span className="rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                  实验中
                </span>
              )}
            </div>
            <div className="font-semibold text-gray-900">{card.label}</div>
            <div className="text-xs text-gray-600">{card.description}</div>
            <div className="mt-auto w-full space-y-0.5 border-t border-gray-100 pt-2 text-xs text-gray-500">
              <div>
                章数: <span className="font-medium">{card.totalChapters}</span>
              </div>
              <div>
                总字数:{' '}
                <span className="font-medium">{card.totalWordsEstimate}</span>
              </div>
              <div>
                每章图: <span className="font-medium">{card.figPerCh}</span>
              </div>
              <div>
                预算上限:{' '}
                <span className="font-medium">${card.maxCredits}</span>
              </div>
              <div>
                耗时:{' '}
                <span className="font-medium">{card.durationEstimate}</span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
