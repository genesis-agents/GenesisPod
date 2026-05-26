'use client';

import type { ReactNode } from 'react';
import { Coins, Trophy, Timer, Database } from 'lucide-react';
import { StatCard } from '@/components/ui/cards';
import type { DerivedView } from '@/lib/features/agent-playground/derive-shapes';
import {
  fmtUsd,
  fmtTokens,
  fmtWallTime,
} from '@/lib/features/agent-playground/formatters';

interface Props {
  view: DerivedView;
  wallTimeMs: number;
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
      value: fmtUsd(cost.costUsd),
      sub: `${fmtTokens(cost.tokensUsed)} tokens`,
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
      value: fmtWallTime(wallTimeMs),
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
