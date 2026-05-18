'use client';

import Link from 'next/link';

interface WeeklyBriefingCardProps {
  topicId: string;
  topicName: string;
  weekStart: string; // 'YYYY-MM-DD'
  weekEnd: string; // 'YYYY-MM-DD'
  tier3Count: number;
  narrativeCount: number;
  candidatesTotal: number;
}

export function WeeklyBriefingCard({
  topicId,
  topicName: _topicName,
  weekStart,
  weekEnd,
  tier3Count,
  narrativeCount,
  candidatesTotal,
}: WeeklyBriefingCardProps) {
  const weeklyUrl = `/ai-radar/topic/${topicId}/weekly?week=${weekStart}`;

  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-4">
      {/* Header */}
      <div className="text-sm font-semibold text-slate-700">
        📅 周报 · {weekStart} — {weekEnd}
      </div>

      {/* Body */}
      {tier3Count === 0 ? (
        <p className="text-sm text-slate-400">
          本周暂无最高评级信号 · 周报跳过
        </p>
      ) : (
        <p className="text-sm text-slate-600">
          ⭐⭐⭐ {tier3Count} · 延续叙事 {narrativeCount} · 候选总{' '}
          {candidatesTotal}
        </p>
      )}

      {/* Footer link */}
      <div>
        <Link
          href={weeklyUrl}
          className="text-xs text-violet-600 hover:underline"
        >
          查看完整周报 →
        </Link>
      </div>
    </div>
  );
}
