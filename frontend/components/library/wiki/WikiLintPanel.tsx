'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import {
  wikiApi,
  type WikiLintFinding,
  type WikiLintTypeStr,
} from '@/lib/api/wiki';
import { useTranslation } from '@/lib/i18n';
import { logger } from '@/lib/utils/logger';

const LINT_TABS: WikiLintTypeStr[] = [
  'CONTRADICTION',
  'STALE',
  'ORPHAN',
  'MISSING_XREF',
  'DATA_GAP',
];

export default function WikiLintPanel({
  kbId,
  onClose,
}: {
  kbId: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<WikiLintTypeStr>('CONTRADICTION');
  const [findings, setFindings] = useState<WikiLintFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const refresh = useCallback(() => {
    setLoading(true);
    wikiApi
      .listLintFindings(kbId, { type: tab, resolved: false })
      .then((res) => setFindings(res.items))
      .catch((err) => logger?.error?.('[wiki] listLintFindings failed', err))
      .finally(() => setLoading(false));
  }, [kbId, tab]);

  useEffect(refresh, [refresh]);

  return (
    <div className="fixed right-0 top-0 z-30 flex h-full w-[420px] flex-col border-l border-slate-200 bg-[linear-gradient(180deg,#ffffff,#f8fafc)] shadow-2xl">
      <header className="border-b border-slate-100 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">
              Integrity Review
            </div>
            <h3 className="text-sm font-semibold text-slate-900">
              {t('library.wiki.subheader.lint')}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
      <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
        {LINT_TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              tab === tabKey
                ? 'bg-violet-100 text-violet-800'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {tabKey}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
          </div>
        ) : findings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            {t('library.wiki.lint.emptyForCategory')}
          </div>
        ) : (
          <ul className="space-y-3">
            {findings.map((finding) => (
              <li
                key={finding.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 rounded-xl bg-amber-50 p-2 text-amber-600">
                    <AlertCircle className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {finding.type}
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700">
                      {JSON.stringify(finding.detail, null, 2)}
                    </pre>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() =>
                          void wikiApi
                            .patchLintFinding(kbId, finding.id, 'resolve')
                            .then(refresh)
                        }
                        className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700"
                      >
                        {t('library.wiki.lint.resolve')}
                      </button>
                      <button
                        onClick={() =>
                          void wikiApi
                            .patchLintFinding(kbId, finding.id, 'dismiss')
                            .then(refresh)
                        }
                        className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        {t('library.wiki.lint.dismiss')}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-slate-100 px-4 py-4">
        <button
          disabled={running}
          onClick={async () => {
            if (running) return;
            setRunning(true);
            try {
              await wikiApi.runLint(kbId);
              refresh();
            } catch (err) {
              logger?.error?.('[wiki] runLint failed', err);
            } finally {
              setRunning(false);
            }
          }}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {running && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('library.wiki.lint.runFullLint')}
        </button>
      </div>
    </div>
  );
}
