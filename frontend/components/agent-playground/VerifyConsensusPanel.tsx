'use client';

import { Gavel, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import type { VerifierVerdict } from '@/lib/agent-playground/derive';

const VERIFIER_META: Record<
  string,
  { label: string; Icon: typeof Gavel; tone: string }
> = {
  self: { label: 'Self', Icon: ShieldCheck, tone: 'sky' },
  external: { label: 'External', Icon: Gavel, tone: 'violet' },
  critical: { label: 'Critical', Icon: ShieldAlert, tone: 'amber' },
};

const TONE_BG: Record<string, string> = {
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  default: 'bg-gray-50 text-gray-700 ring-gray-200',
};

function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-600';
  if (s >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full ${
          score >= 80
            ? 'bg-emerald-400'
            : score >= 60
              ? 'bg-amber-400'
              : 'bg-red-400'
        }`}
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </div>
  );
}

export function VerifyConsensusPanel({
  verdicts,
}: {
  verdicts: VerifierVerdict[];
}) {
  // 取最新一轮 attempt 的 verdicts
  const latestAttempt =
    verdicts.length > 0 ? Math.max(...verdicts.map((v) => v.attempt ?? 1)) : 0;
  const current = verdicts.filter((v) => (v.attempt ?? 1) === latestAttempt);

  const avg =
    current.length > 0
      ? Math.round(
          (current.reduce((s, v) => s + v.score, 0) / current.length) * 10
        ) / 10
      : null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Gavel className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Verify Consensus
          </h3>
        </div>
        {avg != null && (
          <span className={`text-sm font-bold ${scoreColor(avg)}`}>
            avg {avg}
          </span>
        )}
      </div>

      {current.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
          Waiting for review · 3-judge consensus (self + external + critical)
          will appear here
        </p>
      ) : (
        <div className="space-y-3">
          {current.map((v) => {
            const meta = VERIFIER_META[v.verifierId] ?? {
              label: v.verifierId,
              Icon: Gavel,
              tone: 'default',
            };
            const Icon = meta.Icon;
            return (
              <div
                key={v.verifierId}
                className="rounded-xl border border-gray-100 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                      TONE_BG[meta.tone] ?? TONE_BG.default
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  <span
                    className={`font-mono text-base font-bold ${scoreColor(v.score)}`}
                  >
                    {v.score}
                  </span>
                </div>
                <ScoreBar score={v.score} />
                {v.critique && (
                  <p className="mt-2 line-clamp-3 text-[11px] leading-relaxed text-gray-600">
                    {v.critique}
                  </p>
                )}
                {v.modelId && (
                  <p className="font-mono mt-1 text-[10px] text-gray-400">
                    {v.modelId}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {latestAttempt > 1 && (
        <p className="mt-3 flex items-center gap-1 text-[11px] text-amber-600">
          <ShieldX className="h-3 w-3" />
          Reflexion triggered · this is attempt #{latestAttempt}
        </p>
      )}
    </div>
  );
}
