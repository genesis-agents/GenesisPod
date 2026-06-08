'use client';

/**
 * ReviewNotesPanel — 评审意见列表（下沉自公司 MissionReportView leftPanel 内联块）。
 *
 * 吃归一契约 reviewNotes: string[]。空列表不渲染。
 */

import { Gavel } from 'lucide-react';

export interface ReviewNotesPanelProps {
  notes: string[];
  title?: string;
}

export function ReviewNotesPanel({
  notes,
  title = '评审意见',
}: ReviewNotesPanelProps) {
  if (notes.length === 0) return null;
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <Gavel className="h-3.5 w-3.5" />
        {title}
      </div>
      <ul className="space-y-1.5 rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs text-gray-600">
        {notes.map((n, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="mt-0.5 text-amber-400">•</span>
            <span>{n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default ReviewNotesPanel;
