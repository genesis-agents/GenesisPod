'use client';

import { Database, Tag, AlertCircle } from 'lucide-react';
import type { MemoryIndexState } from '@/lib/features/agent-playground/mission-presentation.types';
import { Card } from '@/components/agent-playground/ui';

export function MemoryIndexPanel({
  memory,
  missionCompleted = false,
}: {
  memory: MemoryIndexState | null;
  /** Pass true when the mission has reached a terminal state (completed / failed). */
  missionCompleted?: boolean;
}) {
  return (
    <Card className="p-5" bordered>
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-gray-900">记忆自动索引</h3>
      </div>
      {memory == null ? (
        missionCompleted ? (
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-[12px] text-amber-700">
              memory.index 事件未发出 — backend 待补数据
            </p>
          </div>
        ) : (
          <p className="rounded-lg bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
            Mission 完成后，trajectory 会自动向量化进入用户记忆 namespace
          </p>
        )
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600">
              {memory.chunks}
            </span>
            <span className="text-xs text-gray-500">chunks 已索引</span>
          </div>
          {memory.namespace && (
            <p className="font-mono mt-2 text-[11px] text-gray-500">
              namespace ·{' '}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-700">
                {memory.namespace}
              </span>
            </p>
          )}
          {memory.tags && memory.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1">
              <Tag className="h-3 w-3 text-gray-400" />
              {memory.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
