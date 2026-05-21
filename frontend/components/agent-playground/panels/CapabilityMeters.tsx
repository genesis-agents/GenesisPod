'use client';

import type { ReactNode } from 'react';
import { Coins, Trophy, Timer, Database } from 'lucide-react';
import { StatCard } from '@/components/ui/cards';
import type { DerivedView } from '@/lib/features/agent-playground/derive';

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

type ToneKey = 'amber' | 'violet' | 'blue' | 'emerald';

interface Meter {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: ToneKey;
}

export function CapabilityMeters({ view, wallTimeMs }: Props) {
  const score = view.mission.finalScore;
  const cost = view.cost;
  const memory = view.memory;

  const meters: Meter[] = [
    {
      icon: <Coins className="h-5 w-5" />,
      label: '消耗',
      value: formatUsd(cost.costUsd),
      sub: `${formatTokens(cost.tokensUsed)} tokens`,
      tone: 'amber',
    },
    {
      icon: <Trophy className="h-5 w-5" />,
      label: '质量评分',
      value: score != null ? String(score) : '—',
      sub:
        view.verdicts.length > 0 ? `${view.verdicts.length} 个评审` : '待评审',
      tone: 'violet',
    },
    {
      icon: <Timer className="h-5 w-5" />,
      label: '总耗时',
      value: formatTime(wallTimeMs),
      sub:
        view.mission.completedAt && view.mission.startedAt
          ? '已完成'
          : view.mission.startedAt
            ? '进行中'
            : '未启动',
      tone: 'blue',
    },
    {
      icon: <Database className="h-5 w-5" />,
      label: '记忆',
      value: memory != null ? `${memory.chunks}` : '—',
      sub: memory != null ? 'chunks 已索引' : '待索引',
      tone: 'emerald',
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {meters.map((m) => (
        <StatCard
          key={m.label}
          label={m.label}
          value={m.value}
          hint={m.sub}
          icon={m.icon}
          tone={m.tone}
        />
      ))}
    </div>
  );
}
