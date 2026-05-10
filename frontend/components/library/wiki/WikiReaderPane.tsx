'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSearch, Loader2 } from 'lucide-react';
import rehypeSanitize from 'rehype-sanitize';
import { MarkdownViewer } from '@/components/common/markdown-viewer';
import { wikiApi, type WikiPage, type WikiPageWithLinks } from '@/lib/api/wiki';
import { useTranslation } from '@/lib/i18n';
import { logger } from '@/lib/utils/logger';
import { katexAwareSchema } from '@/lib/markdown/katexAwareSchema';

const WIKI_SANITIZE_SCHEMA = {
  ...katexAwareSchema,
  protocols: {
    ...(katexAwareSchema.protocols ?? {}),
    href: [...(katexAwareSchema.protocols?.href ?? []), 'wikilink'],
  },
};

interface WikiReaderPaneProps {
  kbId: string;
  activeSlug: string | null;
  refreshKey?: number;
  onSelectSlug: (slug: string) => void;
  onIngest?: () => void;
  onCreatePage?: () => void;
}

export default function WikiReaderPane({
  kbId,
  activeSlug,
  refreshKey = 0,
  onSelectSlug,
  onIngest,
  onCreatePage,
}: WikiReaderPaneProps) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<WikiPageWithLinks | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);
  const [pageQuery, setPageQuery] = useState('');
  const autoPickedKbRef = useRef<string | null>(null);
  const onSelectSlugRef = useRef(onSelectSlug);
  onSelectSlugRef.current = onSelectSlug;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    wikiApi
      .listPages(kbId)
      .then((res) => {
        if (!cancelled) setPages(res.items);
      })
      .catch((err) => {
        logger?.error?.('[wiki] listPages failed', err);
        if (!cancelled) setPages([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbId, refreshKey]);

  useEffect(() => {
    if (autoPickedKbRef.current !== kbId) {
      autoPickedKbRef.current = null;
    }
  }, [kbId]);

  useEffect(() => {
    if (loading || activeSlug || autoPickedKbRef.current === kbId) return;
    const first = pickFirstSlug(pages);
    if (!first) return;
    autoPickedKbRef.current = kbId;
    onSelectSlugRef.current(first);
  }, [loading, activeSlug, pages, kbId]);

  useEffect(() => {
    if (!activeSlug) {
      setActive(null);
      return;
    }
    let cancelled = false;
    setActiveLoading(true);
    wikiApi
      .getPage(kbId, activeSlug)
      .then((res) => {
        if (!cancelled) setActive(res);
      })
      .catch((err) => {
        logger?.error?.('[wiki] getPage failed', err);
        if (!cancelled) setActive(null);
      })
      .finally(() => {
        if (!cancelled) setActiveLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbId, activeSlug, refreshKey]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (pages.length === 0) {
    return <ZeroPageGuide onIngest={onIngest} onCreatePage={onCreatePage} />;
  }

  const normalizedQuery = pageQuery.trim().toLowerCase();
  const visiblePages = normalizedQuery
    ? pages.filter((p) =>
        `${p.title} ${p.slug} ${p.oneLiner}`
          .toLowerCase()
          .includes(normalizedQuery)
      )
    : pages;

  const grouped: Record<string, WikiPage[]> = {
    SUMMARY: [],
    ENTITY: [],
    CONCEPT: [],
    SOURCE: [],
  };
  for (const page of visiblePages) grouped[page.category].push(page);

  const effectiveActiveSlug = activeSlug ?? pickFirstSlug(pages);

  return (
    <div className="flex h-full bg-[radial-gradient(circle_at_top_left,rgba(245,243,255,0.85),transparent_28%),linear-gradient(180deg,#ffffff,#f8fafc)]">
      <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-white/70 px-4 py-4 backdrop-blur">
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Browse pages
          </div>
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <FileSearch className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={pageQuery}
              onChange={(e) => setPageQuery(e.target.value)}
              placeholder="Search titles, slugs, and summaries"
              className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
            <span>{visiblePages.length} visible</span>
            <span>{pages.length} total</span>
          </div>
        </div>
        {visiblePages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
            No pages match the current search.
          </div>
        )}
        {(['SUMMARY', 'ENTITY', 'CONCEPT', 'SOURCE'] as const).map(
          (category) =>
            grouped[category].length > 0 ? (
              <div key={category} className="mb-4">
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span>{category}</span>
                  <span>{grouped[category].length}</span>
                </div>
                <ul className="space-y-1">
                  {grouped[category].map((page) => (
                    <li key={page.id}>
                      <button
                        onClick={() => onSelectSlug(page.slug)}
                        className={`block w-full rounded-2xl border px-3 py-2.5 text-left transition ${
                          effectiveActiveSlug === page.slug
                            ? 'border-violet-200 bg-violet-50 text-violet-900 shadow-sm'
                            : 'border-transparent bg-white text-slate-700 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                        title={page.oneLiner}
                      >
                        <div className="truncate text-sm font-medium">
                          {page.title}
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-500">
                          {page.oneLiner}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null
        )}
      </aside>

      <main className="flex-1 overflow-y-auto px-8 py-8 xl:px-10">
        {activeLoading ? (
          <div className="flex h-72 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          </div>
        ) : active ? (
          <WikiMarkdownView
            pageWithLinks={active}
            onSelectSlug={onSelectSlug}
          />
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            {t('library.wiki.reader.selectFromLeft')}
          </div>
        )}
      </main>
    </div>
  );
}

function WikiMarkdownView({
  pageWithLinks,
  onSelectSlug,
}: {
  pageWithLinks: WikiPageWithLinks;
  onSelectSlug: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const { page, outboundLinks, backlinks } = pageWithLinks;
  const knownSlugs = useMemo(() => new Set(outboundLinks), [outboundLinks]);

  const preprocessed = useMemo(
    () =>
      page.body.replace(
        /\[\[([a-z0-9][a-z0-9-]*[a-z0-9])\]\]/g,
        (_match, slug) => `[${slug}](wikilink:${slug})`
      ),
    [page.body]
  );

  return (
    <article className="mx-auto max-w-4xl">
      <header className="mb-6 rounded-[28px] border border-slate-200 bg-white px-8 py-7 shadow-sm">
        <div className="mb-3 inline-flex items-center rounded-full bg-violet-100 px-2.5 py-1 text-xs font-medium text-violet-700">
          {page.category}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
          {page.title}
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          {page.oneLiner}
        </p>
        <p className="mt-3 text-xs text-slate-400">
          {t('library.wiki.reader.lastEditedBy', {
            by: (page.lastEditedBy ?? '').toLowerCase() || '-',
            time: formatRelativeTime(page.updatedAt, t),
          })}
        </p>
        {outboundLinks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {outboundLinks.slice(0, 8).map((slug) => (
              <button
                key={slug}
                type="button"
                onClick={() => onSelectSlug(slug)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-violet-50 hover:text-violet-700"
              >
                [[{slug}]]
              </button>
            ))}
            {outboundLinks.length > 8 && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">
                +{outboundLinks.length - 8}
              </span>
            )}
          </div>
        )}
      </header>
      <div className="rounded-[28px] border border-slate-200 bg-white px-8 py-8 shadow-sm">
        <div className="prose prose-sm max-w-none text-slate-800">
          <MarkdownViewer
            content={preprocessed}
            enableBulletStrip={false}
            components={{
              a({ href, children, ...rest }) {
                if (typeof href === 'string' && href.startsWith('wikilink:')) {
                  const slug = href.slice('wikilink:'.length);
                  const exists = knownSlugs.has(slug);
                  return (
                    <button
                      type="button"
                      onClick={() => onSelectSlug(slug)}
                      className={
                        exists
                          ? 'rounded bg-violet-50 px-1.5 py-0.5 text-violet-700 no-underline hover:bg-violet-100'
                          : 'rounded border border-dashed border-red-300 px-1.5 py-0.5 text-red-600 no-underline hover:bg-red-50'
                      }
                      title={
                        exists ? `Open ${slug}` : `Create ${slug} (missing)`
                      }
                    >
                      {children}
                    </button>
                  );
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    {...rest}
                  >
                    {children}
                  </a>
                );
              },
            }}
            rehypePluginsExtra={[[rehypeSanitize, WIKI_SANITIZE_SCHEMA]]}
            urlTransform={(url) => {
              if (typeof url !== 'string') return '';
              if (url.startsWith('wikilink:')) return url;
              if (/^(https?|mailto|tel):/i.test(url)) return url;
              if (url.startsWith('/') || url.startsWith('#')) return url;
              return '';
            }}
          />
        </div>
      </div>
      {backlinks.length > 0 && (
        <section className="mt-6 rounded-[28px] border border-slate-200 bg-white px-8 py-6 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('library.wiki.reader.backlinks', { count: backlinks.length })}
          </div>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((slug) => (
              <button
                key={slug}
                onClick={() => onSelectSlug(slug)}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-violet-700 hover:bg-violet-50"
              >
                {slug}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function ZeroPageGuide({
  onIngest,
  onCreatePage,
}: {
  onIngest?: () => void;
  onCreatePage?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white">
        <FileSearch className="h-7 w-7" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-gray-900">
        {t('library.wiki.empty.noPagesTitle')}
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gray-600">
        {t('library.wiki.empty.noPagesDesc')}
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          onClick={onIngest}
          disabled={!onIngest}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
        >
          {t('library.wiki.empty.runIngest')}
        </button>
        <button
          onClick={onCreatePage}
          disabled={!onCreatePage}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {t('library.wiki.empty.manualCreate')}
        </button>
      </div>
    </div>
  );
}

function pickFirstSlug(pages: WikiPage[]): string | null {
  if (pages.length === 0) return null;
  const grouped: Record<string, WikiPage[]> = {
    SUMMARY: [],
    ENTITY: [],
    CONCEPT: [],
    SOURCE: [],
  };
  for (const page of pages) grouped[page.category].push(page);
  return (
    grouped.SUMMARY[0]?.slug ??
    grouped.ENTITY[0]?.slug ??
    grouped.CONCEPT[0]?.slug ??
    pages[0]?.slug ??
    null
  );
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
