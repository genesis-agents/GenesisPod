'use client';

import { Coins } from 'lucide-react';
import type { CostState } from '@/lib/agent-playground/derive';

const STAGE_LABEL: Record<string, string> = {
  leader: 'Leader',
  researchers: 'Researchers',
  analyst: 'Analyst',
  writer: 'Writer',
  reviewer: 'Reviewer',
};

function fmtUsd(n: number): string {
  if (n === 0) return '$0.0000';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function CostBreakdownPanel({ cost }: { cost: CostState }) {
  const ordered = [
    'leader',
    'researchers',
    'analyst',
    'writer',
    'reviewer',
  ].map((stage) => {
    const data = cost.byStage.find((b) => b.stage === stage);
    return {
      stage,
      label: STAGE_LABEL[stage] ?? stage,
      tokensUsed: data?.tokensUsed ?? 0,
      costUsd: data?.costUsd ?? 0,
    };
  });
  const max = Math.max(1, ...ordered.map((o) => o.tokensUsed));

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Cost · BYOK billing
          </h3>
        </div>
        <span className="text-xs text-gray-500">
          {fmtUsd(cost.costUsd)} · {fmtTokens(cost.tokensUsed)}
        </span>
      </div>
      <div className="space-y-2">
        {ordered.map((o) => (
          <div key={o.stage}>
            <div className="mb-0.5 flex items-center justify-between text-[11px]">
              <span className="text-gray-600">{o.label}</span>
              <span className="font-mono text-gray-500">
                {fmtTokens(o.tokensUsed)}
                {o.costUsd > 0 && (
                  <span className="ml-1.5 text-gray-400">
                    {fmtUsd(o.costUsd)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all"
                style={{
                  width: `${Math.round((o.tokensUsed / max) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10px] text-gray-400">
        Cost is rough estimate (~$3 / 1M tokens). Real billing via Credits
        service.
      </p>
    </div>
  );
}
