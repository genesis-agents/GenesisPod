'use client';

import { useState } from 'react';
import {
  FileText,
  ChevronDown,
  ExternalLink,
  Sparkles,
  History,
} from 'lucide-react';
import type { ReportDraft } from '@/lib/agent-playground/derive';

interface Props {
  finalReport: ReportDraft['report'] | null;
  reports: ReportDraft[];
  finalScore?: number;
}

function scoreColor(s: number): string {
  if (s >= 80) return 'text-emerald-600';
  if (s >= 60) return 'text-amber-600';
  return 'text-red-600';
}

export function ReportPanel({ finalReport, reports, finalScore }: Props) {
  const [openIdx, setOpenIdx] = useState<number>(0);
  const [showHistory, setShowHistory] = useState(false);

  if (!finalReport) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
        <FileText className="mx-auto mb-3 h-7 w-7 text-gray-300" />
        <p className="text-sm font-medium text-gray-700">
          Final report will render here
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Writer drafts → Reviewer scores → if &lt; 70, Reflexion retries (max
          2)
        </p>
      </div>
    );
  }

  const sections = finalReport.sections ?? [];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/20">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                {finalReport.title || 'Research Report'}
              </h2>
              <p className="text-xs text-gray-500">
                {sections.length} sections ·{' '}
                {finalReport.citations?.length ?? 0} citations
              </p>
            </div>
          </div>
          {finalScore != null && (
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-gray-500">
                Consensus
              </p>
              <p className={`text-2xl font-bold ${scoreColor(finalScore)}`}>
                {finalScore}
              </p>
            </div>
          )}
        </div>

        {finalReport.summary && (
          <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Executive summary
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-700">
              {finalReport.summary}
            </p>
          </div>
        )}

        <div className="divide-y divide-gray-100">
          {sections.map((s, i) => {
            const open = openIdx === i;
            return (
              <div key={`${s.heading}-${i}`} className="px-5 py-4">
                <button
                  type="button"
                  onClick={() => setOpenIdx(open ? -1 : i)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    {i + 1}. {s.heading}
                  </h3>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
                  />
                </button>
                {open && (
                  <div className="mt-3">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                      {s.body}
                    </p>
                    {s.sources && s.sources.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {s.sources.map((src, j) => (
                          <a
                            key={`${src}-${j}`}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 rounded-lg border border-gray-100 bg-gray-50 px-2 py-1 text-[10px] font-medium text-gray-600 transition-colors hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                          >
                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{src}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {finalReport.conclusion && (
          <div className="border-t border-gray-100 bg-gradient-to-br from-violet-50/40 to-purple-50/40 px-5 py-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-violet-700">
              Conclusion
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-800">
              {finalReport.conclusion}
            </p>
          </div>
        )}
      </div>

      {reports.length > 1 && (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="flex w-full items-center justify-between text-left"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <History className="h-4 w-4 text-gray-500" />
              Writer Reflexion history · {reports.length} attempts
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${showHistory ? 'rotate-180' : ''}`}
            />
          </button>
          {showHistory && (
            <ol className="mt-3 space-y-2">
              {reports.map((r) => (
                <li
                  key={r.attempt}
                  className="rounded-lg border border-gray-100 bg-gray-50/40 p-2"
                >
                  <p className="text-xs font-medium text-gray-700">
                    Attempt #{r.attempt} · {r.report?.title ?? 'untitled'}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">
                    {r.report?.summary}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
