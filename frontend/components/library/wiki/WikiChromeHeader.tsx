'use client';

import { useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  Download,
  GitMerge,
  Loader2,
  MessageCircle,
  Network,
  Plus,
  RefreshCw,
  Settings,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { WikiKbSummary } from '@/lib/api/wiki';

interface WikiChromeHeaderProps {
  kbs: WikiKbSummary[];
  currentKbId: string;
  onBackToGrid: () => void;
  onSelectKb: (id: string) => void;
  onEnableOther: () => void;
  onIngest: () => void;
  onLint: () => void;
  onQuery: () => void;
  onLog: () => void;
  onGraph: () => void;
  onExport: () => void;
  exporting?: boolean;
  onSettings: () => void;
}

export default function WikiChromeHeader({
  kbs,
  currentKbId,
  onBackToGrid,
  onSelectKb,
  onEnableOther,
  onIngest,
  onLint,
  onQuery,
  onLog,
  onGraph,
  onExport,
  exporting,
  onSettings,
}: WikiChromeHeaderProps) {
  const { t } = useTranslation();
  const current = kbs.find((kb) => kb.id === currentKbId);
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-20 border-b border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-6 py-4 backdrop-blur">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative flex min-w-0 flex-1 items-start gap-3">
          <button
            onClick={onBackToGrid}
            className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-violet-200 hover:text-violet-700"
            title={t('library.wiki.kbSelector.backToGrid')}
          >
            <ChevronLeft className="h-4 w-4" />
            {t('library.wiki.kbSelector.backToGrid')}
          </button>
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-sm">
                <BookOpen className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">
                  LLM Wiki
                </div>
                <button
                  onClick={() => setOpen((value) => !value)}
                  className="flex items-center gap-2 rounded-xl px-1 py-0.5 hover:bg-slate-100"
                >
                  <span className="truncate text-left text-lg font-semibold text-slate-900">
                    {current?.name ?? t('library.wiki.kbSelector.selectKb')}
                  </span>
                  <span className="text-xs text-slate-400">v</span>
                </button>
              </div>
            </div>
            {current && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="rounded-full bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
                  {pluralizePages(t, current.pageCount)}
                </span>
                {current.lastIngestAt && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1">
                    {t('library.wiki.kbSelector.lastIngest', {
                      time: formatRelativeTime(current.lastIngestAt, t),
                    })}
                  </span>
                )}
              </div>
            )}
          </div>
          {open && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setOpen(false)}
                aria-hidden
              />
              <div className="absolute left-0 top-full z-30 mt-2 w-96 rounded-2xl border border-slate-200 bg-white shadow-2xl">
                <div className="border-b border-slate-100 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('library.wiki.kbSelector.switchTo')}
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {kbs.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-slate-500">
                      {t('library.wiki.kbSelector.noWikiKb')}
                    </div>
                  ) : (
                    kbs.map((kb) => (
                      <button
                        key={kb.id}
                        onClick={() => {
                          onSelectKb(kb.id);
                          setOpen(false);
                        }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-slate-50 ${
                          kb.id === currentKbId
                            ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'
                            : 'text-slate-900'
                        }`}
                      >
                        <span className="truncate font-medium">{kb.name}</span>
                        <span className="ml-3 shrink-0 text-xs text-slate-500">
                          {pluralizePages(t, kb.pageCount)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
                <div className="border-t border-slate-100 p-2">
                  <button
                    onClick={() => {
                      onEnableOther();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-violet-700 hover:bg-violet-50"
                  >
                    <Plus className="h-4 w-4" />
                    {t('library.wiki.kbSelector.enableOther')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <HeaderButton
            icon={<Plus className="h-4 w-4" />}
            onClick={onIngest}
            variant="primary"
          >
            {t('library.wiki.subheader.ingest')}
          </HeaderButton>
          <HeaderButton
            icon={<MessageCircle className="h-4 w-4" />}
            onClick={onQuery}
            variant="soft"
          >
            {t('library.wiki.subheader.query')}
          </HeaderButton>
          <HeaderButton
            icon={<GitMerge className="h-4 w-4" />}
            onClick={onLint}
          >
            {t('library.wiki.subheader.lint')}
          </HeaderButton>
          <HeaderButton
            icon={<RefreshCw className="h-4 w-4" />}
            onClick={onLog}
          >
            {t('library.wiki.subheader.log')}
          </HeaderButton>
          <HeaderButton
            icon={<Network className="h-4 w-4" />}
            onClick={onGraph}
          >
            {t('library.wiki.subheader.graph')}
          </HeaderButton>
          <HeaderButton
            icon={
              exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )
            }
            onClick={onExport}
          >
            {t('library.wiki.subheader.export')}
          </HeaderButton>
          <button
            onClick={onSettings}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:border-slate-300 hover:text-slate-700"
            title={t('library.wiki.subheader.settings')}
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function HeaderButton({
  icon,
  onClick,
  children,
  variant = 'default',
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'soft';
}) {
  const className = {
    default:
      'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
    primary:
      'border-violet-600 bg-violet-600 text-white hover:border-violet-700 hover:bg-violet-700',
    soft: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  }[variant];

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium shadow-sm transition ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

function pluralizePages(
  t: (key: string, params?: Record<string, string | number>) => string,
  count: number
): string {
  const key =
    count === 1
      ? 'library.wiki.kbSelector.pageCountOne'
      : 'library.wiki.kbSelector.pageCountOther';
  return t(key, { count });
}

function formatRelativeTime(
  iso: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return t('library.wiki.time.justNow');
  if (minutes < 60) return t('library.wiki.time.minutesAgo', { minutes });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('library.wiki.time.hoursAgo', { hours });
  const days = Math.round(hours / 24);
  if (days < 30) return t('library.wiki.time.daysAgo', { days });
  return date.toLocaleDateString();
}
