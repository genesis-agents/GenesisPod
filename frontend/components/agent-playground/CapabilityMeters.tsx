'use client';

import { Coins, Trophy, Timer, Database } from 'lucide-react';
import type { DerivedView } from '@/lib/agent-playground/derive';

interface Props {
  view: DerivedView;
  wallTimeMs: number;
}

function formatUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

function formatTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}

export function CapabilityMeters({ view, wallTimeMs }: Props) {
  const score = view.mission.finalScore;
  const cost = view.cost;
  const memory = view.memory;

  const meters = [
    {
      icon: Coins,
      label: '消耗',
      value: formatUsd(cost.costUsd),
      sub: `${formatTokens(cost.tokensUsed)} tokens`,
      tone: 'amber' as const,
    },
    {
      icon: Trophy,
      label: '质量评分',
      value: score != null ? String(score) : '—',
      sub:
        view.verdicts.length > 0 ? `${view.verdicts.length} 个评审` : '待评审',
      tone: 'violet' as const,
    },
    {
      icon: Timer,
      label: '总耗时',
      value: formatTime(wallTimeMs),
      sub:
        view.mission.completedAt && view.mission.startedAt
          ? '已完成'
          : view.mission.startedAt
            ? '进行中'
            : '未启动',
      tone: 'sky' as const,
    },
    {
      icon: Database,
      label: '记忆',
      value: memory != null ? `${memory.chunks}` : '—',
      sub: memory != null ? 'chunks 已索引' : '待索引',
      tone: 'emerald' as const,
    },
  ];

  const TONES = {
    amber: 'bg-amber-50 text-amber-600 ring-amber-100',
    violet: 'bg-violet-50 text-violet-600 ring-violet-100',
    sky: 'bg-sky-50 text-sky-600 ring-sky-100',
    emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {meters.map((m) => {
        const Icon = m.icon;
        return (
          <div
            key={m.label}
            className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                {m.label}
              </p>
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${TONES[m.tone]}`}
              >
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <p className="mt-1.5 text-2xl font-bold text-gray-900">{m.value}</p>
            <p className="mt-0.5 text-xs text-gray-500">{m.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
