'use client';

import { Layers } from 'lucide-react';
import type { MissionState } from '@/lib/agent-playground/derive';

export function DimensionsPanel({ mission }: { mission: MissionState }) {
  const dims = mission.dimensions ?? [];
  if (!mission.themeSummary && dims.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Research Dimensions
          </h3>
        </div>
        <p className="rounded-lg bg-gray-50 px-3 py-3 text-[12px] text-gray-500">
          Leader will produce a theme summary and dimension plan first
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Research Dimensions
          </h3>
        </div>
        {dims.length > 0 && (
          <span className="text-xs text-gray-500">{dims.length} dims</span>
        )}
      </div>
      {mission.themeSummary && (
        <p className="mb-3 rounded-lg bg-violet-50/50 px-3 py-2 text-[12px] leading-relaxed text-violet-900 ring-1 ring-violet-100">
          {mission.themeSummary}
        </p>
      )}
      <ol className="space-y-2">
        {dims.map((d, i) => (
          <li
            key={d.id ?? d.name}
            className="flex gap-2.5 rounded-lg border border-gray-100 p-2.5"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-medium text-gray-900">{d.name}</p>
              {d.rationale && (
                <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">
                  {d.rationale}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
