'use client';

import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  CheckCircle2,
  Loader2,
  Clock,
  XCircle,
  ChevronRight,
  AlertTriangle,
} from 'lucide-react';
import type { StageState, StageId } from '@/lib/agent-playground/derive';

const META: Record<StageId, { label: string; Icon: typeof Brain }> = {
  leader: { label: 'Leader', Icon: Brain },
  researchers: { label: 'Researchers', Icon: Search },
  analyst: { label: 'Analyst', Icon: GitBranch },
  writer: { label: 'Writer', Icon: PenLine },
  reviewer: { label: 'Reviewer', Icon: Gavel },
};

function StatusBadge({ status }: { status: StageState['status'] }) {
  if (status === 'done')
    return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === 'running')
    return <Loader2 className="h-4 w-4 animate-spin text-violet-500" />;
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-gray-300" />;
}

export function PipelineTimeline({ stages }: { stages: StageState[] }) {
  const completed = stages.filter((s) => s.status === 'done').length;
  const pct = Math.round((completed / stages.length) * 100);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Mission 流水线</h3>
        <span className="text-xs font-medium text-gray-500">
          {completed} / {stages.length} 阶段 · {pct}%
        </span>
      </div>
      <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full bg-gradient-to-r from-violet-500 to-purple-600 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-stretch gap-2 overflow-x-auto">
        {stages.map((s, idx) => {
          const meta = META[s.id];
          const Icon = meta.Icon;
          const dur =
            s.startedAt && s.endedAt
              ? `${((s.endedAt - s.startedAt) / 1000).toFixed(1)}s`
              : s.startedAt
                ? '…'
                : null;
          // 2026-05-13 #63: Leader signoff 预警 — block 红/warn 橙边框 + tooltip
          const risk = s.preflightRisk;
          const hasBlock = risk?.severity === 'block';
          const hasWarn = risk?.severity === 'warn';
          const riskBorder = hasBlock
            ? 'border-red-300 bg-red-50/60 ring-1 ring-red-200'
            : hasWarn
              ? 'border-amber-300 bg-amber-50/60 ring-1 ring-amber-200'
              : '';
          const tooltip = risk
            ? risk.reasons.map((r) => `· ${r.message}`).join('\n')
            : '';
          return (
            <div key={s.id} className="flex flex-1 items-stretch gap-2">
              <div
                title={tooltip || undefined}
                className={`relative flex flex-1 flex-col rounded-xl border p-3 transition-all ${
                  riskBorder
                    ? riskBorder
                    : s.status === 'running'
                      ? 'border-violet-200 bg-violet-50/50 shadow-sm'
                      : s.status === 'done'
                        ? 'border-emerald-100 bg-emerald-50/30'
                        : s.status === 'failed'
                          ? 'border-red-200 bg-red-50/40'
                          : 'border-gray-100 bg-gray-50/40'
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon
                      className={`h-4 w-4 ${
                        s.status === 'running'
                          ? 'text-violet-600'
                          : s.status === 'done'
                            ? 'text-emerald-600'
                            : s.status === 'failed'
                              ? 'text-red-600'
                              : 'text-gray-400'
                      }`}
                    />
                    <p className="text-xs font-semibold text-gray-900">
                      {meta.label}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {risk && (
                      <AlertTriangle
                        className={`h-3.5 w-3.5 ${
                          hasBlock ? 'text-red-500' : 'text-amber-500'
                        }`}
                        aria-label={
                          hasBlock ? 'Leader 预计会拒签' : 'Leader 签字风险'
                        }
                      />
                    )}
                    <StatusBadge status={s.status} />
                  </div>
                </div>
                {risk ? (
                  <p
                    className={`mt-1 line-clamp-2 text-[11px] font-medium ${
                      hasBlock ? 'text-red-700' : 'text-amber-700'
                    }`}
                  >
                    {hasBlock ? '⚠ 预计会被拒签：' : '⚠ 签字风险：'}
                    {risk.reasons[0]?.message ?? '检测到阻断条件'}
                  </p>
                ) : s.detail ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-gray-600">
                    {s.detail}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-gray-400">
                    {s.status === 'pending' ? '等待' : '进行中'}
                  </p>
                )}
                {dur && (
                  <p className="font-mono mt-auto pt-1 text-[10px] text-gray-400">
                    {dur}
                  </p>
                )}
              </div>
              {idx < stages.length - 1 && (
                <ChevronRight className="my-auto h-4 w-4 shrink-0 text-gray-300" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
