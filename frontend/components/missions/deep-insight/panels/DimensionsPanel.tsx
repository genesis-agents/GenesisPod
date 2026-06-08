'use client';

/**
 * DimensionsPanel — 研究维度标签云（下沉自公司 MissionReportView leftPanel 内联块）。
 *
 * 吃归一契约 dimensions: string[]。空列表不渲染（由左栏决定是否挂载）。
 */

import { Layers } from 'lucide-react';

export interface DimensionsPanelProps {
  dimensions: string[];
  title?: string;
}

export function DimensionsPanel({
  dimensions,
  title = '研究维度',
}: DimensionsPanelProps) {
  if (dimensions.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Layers className="h-3.5 w-3.5" />
        {title}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {dimensions.map((d) => (
          <span
            key={d}
            className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700"
          >
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

export default DimensionsPanel;
