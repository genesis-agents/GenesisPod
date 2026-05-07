// PR-8 v1.6 D4 qualityGap banner UI
//
// 用法（mission 详情页 mission.status === 'completed' && qualityGaps.length > 0 时显示）：
//   <QualityGapBanner gaps={mission.qualityGaps} onRetry={...} onAccept={...} />
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 2.D4

'use client';

import * as React from 'react';

export type QualityGap = {
  contractKey: string;
  expected: string;
  actual: string;
  affectedScope: string;
  retriesAttempted: number;
  userActionsAvailable: Array<
    | 'retry-budget-allowed'
    | 'downgrade-scale'
    | 'accept-as-is'
    | 'contact-support'
  >;
};

export interface QualityGapBannerProps {
  gaps: QualityGap[];
  missionId: string;
  /** 用户点 Retry from this stage 时调（含 budget 检查） */
  onRetry?: (contractKey: string) => void;
  /** 用户点 Accept as-is 关闭 banner */
  onAccept?: () => void;
}

const CONTRACT_KEY_LABEL: Record<string, string> = {
  figPerCh: '每章图数',
  wordsPerCh: '章节字数',
  dimensionsCount: '研究维度数',
  totalChapters: '总章数',
  citationsPerCh: '每章引用数',
  subSectionCount: '章内分节数',
};

export function QualityGapBanner({
  gaps,
  missionId,
  onRetry,
  onAccept,
}: QualityGapBannerProps): React.ReactElement | null {
  if (!gaps || gaps.length === 0) return null;

  const supportLink = `https://genesis.ai/support?missionId=${encodeURIComponent(missionId)}`;

  return (
    <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4">
      <div className="flex items-start gap-3">
        <div className="text-2xl">⚠️</div>
        <div className="flex-1 space-y-3">
          <div className="font-semibold text-yellow-900">
            Mission 已完成，但有 {gaps.length} 项质量未达预期
          </div>
          <div className="space-y-2">
            {gaps.map((gap, i) => (
              <div
                key={`${gap.contractKey}-${i}`}
                className="rounded border border-yellow-200 bg-white p-3 text-sm"
              >
                <div className="font-medium text-gray-900">
                  {CONTRACT_KEY_LABEL[gap.contractKey] ?? gap.contractKey}
                </div>
                <div className="mt-1 grid grid-cols-1 gap-1 text-xs text-gray-700 sm:grid-cols-3">
                  <div>
                    <span className="text-gray-500">期望: </span>
                    {gap.expected}
                  </div>
                  <div>
                    <span className="text-gray-500">实际: </span>
                    {gap.actual}
                  </div>
                  <div>
                    <span className="text-gray-500">影响范围: </span>
                    {gap.affectedScope}
                  </div>
                </div>
                {gap.retriesAttempted > 0 && (
                  <div className="mt-1 text-xs text-gray-500">
                    已重试 {gap.retriesAttempted} 次
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {gaps.some((g) =>
              g.userActionsAvailable.includes('retry-budget-allowed')
            ) && (
              <button
                type="button"
                onClick={() => onRetry?.(gaps[0].contractKey)}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Retry from this stage
              </button>
            )}
            <button
              type="button"
              onClick={() => onAccept?.()}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Accept as-is
            </button>
            <a
              href={supportLink}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Contact support
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
