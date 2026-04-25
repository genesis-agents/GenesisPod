'use client';

import { Database, Tag } from 'lucide-react';
import type { MemoryIndexState } from '@/lib/agent-playground/derive';

export function MemoryIndexPanel({
  memory,
}: {
  memory: MemoryIndexState | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-gray-900">
          Memory Auto-Index
        </h3>
      </div>
      {memory == null ? (
        <p className="rounded-lg bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
          Trajectory will be vectorized into the namespace memory once the
          mission completes
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-emerald-600">
              {memory.chunks}
            </span>
            <span className="text-xs text-gray-500">chunks indexed</span>
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
    </div>
  );
}
