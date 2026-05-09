'use client';

/**
 * Wiki Tab — v1.5.3 P3a/P3b core UI.
 *
 * Single-file composition of the core surface (kept together to minimize
 * cross-file orchestration during initial integration). Splits naturally
 * into one-component-per-file when iteration begins.
 *
 * Implements (per llm-wiki §7):
 *  §7.1 LibraryTabs first-tab + default-active (handled in page.tsx)
 *  §7.3 KB selector with 5-step resolution chain
 *      URL ?kb= → localStorage:lastWikiKbId:<userHash> → unique
 *      wikiEnabled → most-recently-edited wikiEnabled → guidance
 *  §7.5 three-state empty funnel (0 KB / 0 wikiEnabled / 0 page)
 *  §7.7 URL state machine with mutex for ?diff= modal vs ?lint=1/?log=1
 *      drawer (drawers can stack with ?page=, but ?diff= preempts both)
 *  §7.2 Wiki sub-header (KB selector + Toolbar)
 *
 * Defers (P3a follow-up sub-iteration):
 *  - Full split-diff renderer with three-color edges (uses textual
 *    side-by-side preview here)
 *  - Lint Drawer / Log Drawer / Query Panel as standalone components
 *    (compact stubs included so URL state machine is wired and exercised)
 *  - WikiPageEmbedding-driven Branch B query (backend already handles
 *    the fallback warning)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  BookOpen,
  Download,
  FileSearch,
  GitMerge,
  Loader2,
  MessageCircle,
  Plus,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import {
  wikiApi,
  type KbDocumentSummary,
  type WikiDiff,
  type WikiKbSummary,
  type WikiLintFinding,
  type WikiLintTypeStr,
  type WikiPage,
  type WikiPageWithLinks,
  type WikiQueryResponse,
} from '@/lib/api/wiki';
import { logger } from '@/lib/utils/logger';

// ─── localStorage key helpers (per §7.1 §11 v1.5.x cross-user isolation) ───

function userKey(prefix: string, userHash: string): string {
  return `${prefix}:${userHash}`;
}

function readLocalStorage(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore (quota / private mode)
  }
}

// ─── KB context resolver (§7.3 5-step chain) ───

interface ResolveResult {
  kbId: string | null;
  kbs: WikiKbSummary[];
  emptyKind: 'no-kb' | 'has-kb-no-wiki' | null;
  loading: boolean;
}

function useResolvedKb(
  userHash: string,
  urlKbId: string | null
): ResolveResult & { refresh: () => void } {
  const [kbs, setKbs] = useState<WikiKbSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    wikiApi
      .listKbs()
      .then((res) => {
        if (cancelled) return;
        setKbs(res.items);
      })
      .catch((err) => {
        logger?.error?.('[wiki] listKbs failed', err);
        if (!cancelled) setKbs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTick, userHash]);

  const resolved = useMemo<{
    kbId: string | null;
    emptyKind: 'no-kb' | 'has-kb-no-wiki' | null;
  }>(() => {
    if (loading) return { kbId: null, emptyKind: null };

    // Step 1: explicit URL kbId — must exist in the wikiEnabled set
    if (urlKbId && kbs.some((kb) => kb.id === urlKbId)) {
      return { kbId: urlKbId, emptyKind: null };
    }

    // Step 2: localStorage:lastWikiKbId
    const stored = readLocalStorage(userKey('lastWikiKbId', userHash));
    if (stored && kbs.some((kb) => kb.id === stored)) {
      return { kbId: stored, emptyKind: null };
    }

    // Steps 3+4: unique wikiEnabled KB → first sorted (most-recently-ingested)
    if (kbs.length === 1) return { kbId: kbs[0].id, emptyKind: null };
    if (kbs.length > 1) return { kbId: kbs[0].id, emptyKind: null };

    // Step 5: empty (0 wikiEnabled). UI will offer the funnel; we cannot
    // distinguish 0-KB from 0-wikiEnabled here without the global KB list,
    // so signal "has-kb-no-wiki" optimistically and let the empty state
    // component refine via a second backend call if needed.
    return { kbId: null, emptyKind: 'has-kb-no-wiki' };
  }, [kbs, loading, urlKbId, userHash]);

  return {
    ...resolved,
    kbs,
    loading,
    refresh: () => setRefreshTick((t) => t + 1),
  };
}

// ─── URL state derivation (§7.7) ───

interface UrlState {
  kbId: string | null;
  pageSlug: string | null;
  diffId: string | null;
  lintOpen: boolean;
  logOpen: boolean;
}

function readUrlState(searchParams: URLSearchParams): UrlState {
  const diffId = searchParams.get('diff');
  return {
    kbId: searchParams.get('kb'),
    pageSlug: searchParams.get('page'),
    diffId,
    // Mutex: diff modal preempts drawers; among drawers, lint > log
    lintOpen: !diffId && searchParams.get('lint') === '1',
    logOpen:
      !diffId &&
      searchParams.get('log') === '1' &&
      searchParams.get('lint') !== '1',
  };
}

// ─── Public component ───

interface WikiTabProps {
  /**
   * Stable per-user hash for localStorage key isolation. The page.tsx host
   * passes a derivable hash (e.g. session userId hashed) so that a shared
   * browser doesn't leak the previous user's lastWikiKbId / toast sentinel.
   * For the integration MVP a stable session-scoped string is enough.
   */
  userHash: string;
}

export default function WikiTab({ userHash }: WikiTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlState = readUrlState(
    new URLSearchParams(searchParams?.toString() ?? '')
  );

  const { kbId, kbs, loading, emptyKind, refresh } = useResolvedKb(
    userHash,
    urlState.kbId
  );

  const [ingestOpen, setIngestOpen] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);

  // Persist resolved kbId to URL + localStorage for back/forward & refresh
  useEffect(() => {
    if (!kbId) return;
    if (urlState.kbId !== kbId) {
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set('tab', 'wiki');
      params.set('kb', kbId);
      router.replace(`/library?${params.toString()}`);
    }
    writeLocalStorage(userKey('lastWikiKbId', userHash), kbId);
  }, [kbId, urlState.kbId, router, searchParams, userHash]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!kbId) {
    return (
      <>
        <WikiEmptyState
          kind={emptyKind ?? 'has-kb-no-wiki'}
          onRefresh={refresh}
          onEnable={() => setEnableOpen(true)}
        />
        {enableOpen && (
          <WikiEnableToggleModal
            onClose={() => setEnableOpen(false)}
            onEnabled={(newKbId) => {
              setEnableOpen(false);
              const params = new URLSearchParams(
                searchParams?.toString() ?? ''
              );
              params.set('tab', 'wiki');
              params.set('kb', newKbId);
              router.replace(`/library?${params.toString()}`);
              refresh();
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <WikiSubHeader
        kbs={kbs}
        currentKbId={kbId}
        onSelectKb={(id) => {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.set('tab', 'wiki');
          params.set('kb', id);
          params.delete('page');
          router.replace(`/library?${params.toString()}`);
        }}
        onIngest={() => setIngestOpen(true)}
        onLint={() => {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.set('lint', '1');
          params.delete('log');
          params.delete('diff');
          router.replace(`/library?${params.toString()}`);
        }}
        onQuery={() => alert('Query 浮动面板在 P3a 后续迭代上线')}
        onLog={() => {
          const params = new URLSearchParams(searchParams?.toString() ?? '');
          params.set('log', '1');
          params.delete('lint');
          params.delete('diff');
          router.replace(`/library?${params.toString()}`);
        }}
      />

      <div className="flex-1 overflow-hidden">
        <WikiPageReader
          kbId={kbId}
          activeSlug={urlState.pageSlug}
          onSelectSlug={(slug) => {
            const params = new URLSearchParams(searchParams?.toString() ?? '');
            params.set('page', slug);
            router.replace(`/library?${params.toString()}`);
          }}
        />
      </div>

      {urlState.diffId && (
        <WikiDiffReviewModal
          kbId={kbId}
          diffId={urlState.diffId}
          onClose={() => {
            const params = new URLSearchParams(searchParams?.toString() ?? '');
            params.delete('diff');
            router.replace(`/library?${params.toString()}`);
          }}
        />
      )}

      {urlState.lintOpen && (
        <WikiLintDrawer
          kbId={kbId}
          onClose={() => {
            const params = new URLSearchParams(searchParams?.toString() ?? '');
            params.delete('lint');
            router.replace(`/library?${params.toString()}`);
          }}
        />
      )}

      {urlState.logOpen && (
        <WikiLogDrawer
          kbId={kbId}
          onClose={() => {
            const params = new URLSearchParams(searchParams?.toString() ?? '');
            params.delete('log');
            router.replace(`/library?${params.toString()}`);
          }}
        />
      )}

      {ingestOpen && (
        <IngestPickerModal
          kbId={kbId}
          onClose={() => setIngestOpen(false)}
          onIngested={(diffId) => {
            setIngestOpen(false);
            const params = new URLSearchParams(searchParams?.toString() ?? '');
            params.set('diff', diffId);
            router.replace(`/library?${params.toString()}`);
          }}
        />
      )}
    </div>
  );
}

// ─── Sub-components ───

interface WikiSubHeaderProps {
  kbs: WikiKbSummary[];
  currentKbId: string;
  onSelectKb: (id: string) => void;
  onIngest: () => void;
  onLint: () => void;
  onQuery: () => void;
  onLog: () => void;
}

function WikiSubHeader({
  kbs,
  currentKbId,
  onSelectKb,
  onIngest,
  onLint,
  onQuery,
  onLog,
}: WikiSubHeaderProps) {
  const current = kbs.find((kb) => kb.id === currentKbId);
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white px-8 py-3">
      <div className="relative flex items-center gap-3 text-sm">
        <BookOpen className="h-5 w-5 text-violet-500" />
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 rounded-md px-3 py-1.5 hover:bg-gray-100"
        >
          <span className="font-medium text-gray-900">
            {current?.name ?? '选择知识库'}
          </span>
          <span className="text-xs text-gray-500">▾</span>
        </button>
        {current && (
          <span className="text-xs text-gray-500">
            · {current.pageCount} 页
            {current.lastIngestAt
              ? ` · 上次 ingest ${formatRelativeTime(current.lastIngestAt)}`
              : ''}
          </span>
        )}
        {open && (
          <div className="absolute left-0 top-full z-30 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="border-b border-gray-100 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500">
              切换到知识库
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {kbs.length === 0 ? (
                <div className="px-3 py-3 text-sm text-gray-500">
                  暂无启用 Wiki 的知识库
                </div>
              ) : (
                kbs.map((kb) => (
                  <button
                    key={kb.id}
                    onClick={() => {
                      onSelectKb(kb.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      kb.id === currentKbId
                        ? 'bg-violet-50 text-violet-700'
                        : 'text-gray-900'
                    }`}
                  >
                    <span className="truncate">{kb.name}</span>
                    <span className="ml-3 shrink-0 text-xs text-gray-500">
                      {kb.pageCount} 页
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ToolButton icon={<Plus className="h-4 w-4" />} onClick={onIngest}>
          Ingest
        </ToolButton>
        <ToolButton icon={<GitMerge className="h-4 w-4" />} onClick={onLint}>
          Lint
        </ToolButton>
        <ToolButton
          icon={<MessageCircle className="h-4 w-4" />}
          onClick={onQuery}
        >
          Query
        </ToolButton>
        <ToolButton icon={<RefreshCw className="h-4 w-4" />} onClick={onLog}>
          Log
        </ToolButton>
        <ToolButton
          icon={<Download className="h-4 w-4" />}
          onClick={() => alert('Export 在 P3a 后续上线')}
        >
          Export
        </ToolButton>
        <button
          onClick={() => alert('Settings 在 P3a 后续上线')}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ToolButton({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Page reader (left list + center markdown) ───

interface WikiPageReaderProps {
  kbId: string;
  activeSlug: string | null;
  onSelectSlug: (slug: string) => void;
}

function WikiPageReader({
  kbId,
  activeSlug,
  onSelectSlug,
}: WikiPageReaderProps) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<WikiPageWithLinks | null>(null);
  const [activeLoading, setActiveLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    wikiApi
      .listPages(kbId)
      .then((res) => {
        if (cancelled) return;
        setPages(res.items);
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
  }, [kbId]);

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
  }, [kbId, activeSlug]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
      </div>
    );
  }

  if (pages.length === 0) {
    return <ZeroPageGuide kbId={kbId} />;
  }

  // Group pages by category
  const grouped: Record<string, WikiPage[]> = {
    SUMMARY: [],
    ENTITY: [],
    CONCEPT: [],
    SOURCE: [],
  };
  for (const p of pages) grouped[p.category].push(p);

  const effectiveActiveSlug =
    activeSlug ??
    grouped.SUMMARY[0]?.slug ??
    grouped.ENTITY[0]?.slug ??
    grouped.CONCEPT[0]?.slug ??
    pages[0]?.slug ??
    null;

  return (
    <div className="flex h-full">
      <aside className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 px-4 py-4">
        {(['SUMMARY', 'ENTITY', 'CONCEPT', 'SOURCE'] as const).map((cat) =>
          grouped[cat].length > 0 ? (
            <div key={cat} className="mb-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {cat}
              </div>
              <ul className="space-y-0.5">
                {grouped[cat].map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => onSelectSlug(p.slug)}
                      className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
                        effectiveActiveSlug === p.slug
                          ? 'bg-violet-100 text-violet-900'
                          : 'text-gray-700 hover:bg-gray-200'
                      }`}
                      title={p.oneLiner}
                    >
                      {p.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null
        )}
      </aside>

      <main className="flex-1 overflow-y-auto px-10 py-8">
        {activeLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
        ) : active ? (
          <WikiMarkdownView
            pageWithLinks={active}
            onSelectSlug={onSelectSlug}
          />
        ) : (
          <div className="text-sm text-gray-500">从左侧选择一页查看</div>
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
  const { page, outboundLinks, backlinks } = pageWithLinks;

  // [[slug]] → clickable chips. Strip script/iframe defensively (frontend
  // also runs rehype-sanitize via existing markdown components — we keep
  // a minimal text-level renderer here to avoid pulling rehype into the
  // initial integration).
  const rendered = useMemo(
    () => renderMarkdownWithWikiLinks(page.body, outboundLinks, onSelectSlug),
    [page.body, outboundLinks, onSelectSlug]
  );

  return (
    <article className="mx-auto max-w-3xl">
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-medium text-violet-700">
          {page.category}
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">{page.title}</h1>
        <p className="mt-2 text-sm text-gray-600">{page.oneLiner}</p>
        <p className="mt-1 text-xs text-gray-400">
          Last edited by {page.lastEditedBy.toLowerCase()} ·{' '}
          {formatRelativeTime(page.updatedAt)}
        </p>
      </header>
      <div className="prose prose-sm max-w-none text-gray-800">{rendered}</div>
      {backlinks.length > 0 && (
        <section className="mt-8 border-t border-gray-200 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Backlinks ({backlinks.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {backlinks.map((slug) => (
              <button
                key={slug}
                onClick={() => onSelectSlug(slug)}
                className="rounded bg-gray-100 px-2 py-0.5 text-xs text-violet-700 hover:bg-violet-50"
              >
                ← {slug}
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

function renderMarkdownWithWikiLinks(
  body: string,
  outboundLinks: string[],
  onSelectSlug: (slug: string) => void
): React.ReactNode {
  // Minimal renderer — preserves paragraphs and turns [[slug]] into chips.
  // Full rehype-based markdown (with code blocks, tables, etc) is the next
  // P3a sub-iteration. For initial integration, paragraphs + headings +
  // wiki-links + line breaks cover the practical 80%.
  const lines = body.split(/\n\n+/);
  const linkSet = new Set(outboundLinks);
  return lines.map((para, idx) => {
    if (para.startsWith('## ')) {
      return (
        <h2 key={idx} className="mb-2 mt-6 text-lg font-semibold text-gray-900">
          {para.slice(3)}
        </h2>
      );
    }
    if (para.startsWith('# ')) {
      return (
        <h1 key={idx} className="mb-2 mt-6 text-xl font-semibold text-gray-900">
          {para.slice(2)}
        </h1>
      );
    }
    return (
      <p key={idx} className="mb-3 leading-7">
        {renderInline(para, linkSet, onSelectSlug)}
      </p>
    );
  });
}

function renderInline(
  text: string,
  knownSlugs: Set<string>,
  onSelectSlug: (slug: string) => void
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const re = /\[\[([a-z0-9][a-z0-9-]*[a-z0-9])\]\]/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    const slug = match[1];
    const exists = knownSlugs.has(slug);
    parts.push(
      <button
        key={`link-${key++}`}
        onClick={() => onSelectSlug(slug)}
        className={
          exists
            ? 'rounded bg-violet-50 px-1.5 py-0.5 text-violet-700 hover:bg-violet-100'
            : 'rounded border border-dashed border-red-300 px-1.5 py-0.5 text-red-600 hover:bg-red-50'
        }
        title={exists ? `Open ${slug}` : `Create ${slug} (missing)`}
      >
        {slug}
      </button>
    );
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts;
}

// ─── Empty state (§7.5 three-state funnel) ───

function WikiEmptyState({
  kind,
  onRefresh,
  onEnable,
}: {
  kind: 'no-kb' | 'has-kb-no-wiki';
  onRefresh: () => void;
  onEnable: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 text-white">
        <BookOpen className="h-8 w-8" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold text-gray-900">
        {kind === 'no-kb' ? '欢迎使用 Wiki' : '尚未启用 Wiki'}
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-gray-600">
        Wiki 把上传的原始文档持续编译为 markdown 形式的实体页 / 概念页 /
        总结页，跨页通过 <code>[[slug]]</code> 引用相互连接。
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          onClick={onEnable}
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
        >
          为知识库启用 Wiki
        </button>
        <button
          onClick={onRefresh}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          刷新列表
        </button>
      </div>
      <p className="mt-6 text-xs text-gray-500">
        启用 Wiki 需要 KB 的 OWNER 或 ADMIN 角色。
      </p>
    </div>
  );
}

function ZeroPageGuide({ kbId }: { kbId: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 text-white">
        <Sparkles className="h-7 w-7" />
      </div>
      <h2 className="mt-6 text-xl font-semibold text-gray-900">
        Wiki 还没有页面
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-gray-600">
        从这个 KB 的文档触发一次 Ingest，LLM 会把内容编译成 wiki
        提议供你逐项审阅。或者手动创建第一页。
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          onClick={() =>
            alert(`Ingest picker 在 P3a 后续上线（kbId=${kbId.slice(0, 8)}…）`)
          }
          className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700"
        >
          运行 Ingest
        </button>
        <button
          onClick={() => alert('手动建页 UI 在 P3a 后续上线')}
          className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          手动创建第一页
        </button>
      </div>
    </div>
  );
}

// ─── Diff review modal (split view, three-color edges) ───

function WikiDiffReviewModal({
  kbId,
  diffId,
  onClose,
}: {
  kbId: string;
  diffId: string;
  onClose: () => void;
}) {
  const [diff, setDiff] = useState<WikiDiff | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    wikiApi
      .getDiff(kbId, diffId)
      .then((d) => {
        if (cancelled) return;
        setDiff(d);
        // default-select all items
        const all = new Set<string>([
          ...d.items.creates.map((c) => c.slug),
          ...d.items.updates.map((u) => u.slug),
          ...d.items.deletes,
        ]);
        setSelected(all);
      })
      .catch((err) => {
        logger?.error?.('[wiki] getDiff failed', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbId, diffId]);

  const conflicted = diff?.status === 'CONFLICTED';

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
      <div className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Wiki 提议审阅
            </h2>
            {diff && (
              <p className="text-xs text-gray-500">
                共 {diff.affectedSlugs.length} 项 · 状态 {diff.status}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        {conflicted && (
          <div className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800">
            ⚠ Wiki 已被他人改动，本提议失效。请重跑 Ingest。
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-6 py-4">
          {loading || !diff ? (
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          ) : (
            <div className="space-y-4">
              {diff.items.creates.map((c) => (
                <DiffItemCard
                  key={`c-${c.slug}`}
                  kind="CREATE"
                  slug={c.slug}
                  selected={selected.has(c.slug)}
                  onToggle={() => toggle(selected, setSelected, c.slug)}
                  preview={c.body.slice(0, 600)}
                  meta={`${c.category} · ${c.title}`}
                />
              ))}
              {diff.items.updates.map((u) => (
                <DiffItemCard
                  key={`u-${u.slug}`}
                  kind="UPDATE"
                  slug={u.slug}
                  selected={selected.has(u.slug)}
                  onToggle={() => toggle(selected, setSelected, u.slug)}
                  preview={u.newBody.slice(0, 600)}
                  meta={u.newOneLiner ?? ''}
                />
              ))}
              {diff.items.deletes.map((s) => (
                <DiffItemCard
                  key={`d-${s}`}
                  kind="DELETE"
                  slug={s}
                  selected={selected.has(s)}
                  onToggle={() => toggle(selected, setSelected, s)}
                  preview="(将被删除)"
                  meta=""
                />
              ))}
            </div>
          )}
        </main>
        <footer className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-3">
          <button
            disabled={applying}
            onClick={async () => {
              if (!diff) return;
              try {
                await wikiApi.patchDiff(kbId, diff.id, 'dismiss');
                onClose();
              } catch (err) {
                logger?.error?.('[wiki] dismiss diff failed', err);
              }
            }}
            className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            全部撤销
          </button>
          <button
            disabled={applying || conflicted || selected.size === 0}
            onClick={async () => {
              if (!diff) return;
              setApplying(true);
              try {
                await wikiApi.patchDiff(
                  kbId,
                  diff.id,
                  'apply',
                  Array.from(selected)
                );
                onClose();
              } catch (err) {
                logger?.error?.('[wiki] apply diff failed', err);
                alert('应用失败，请检查网络或返回主视图重试');
              } finally {
                setApplying(false);
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
          >
            {applying && <Loader2 className="h-4 w-4 animate-spin" />}
            应用 {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DiffItemCard({
  kind,
  slug,
  selected,
  onToggle,
  preview,
  meta,
}: {
  kind: 'CREATE' | 'UPDATE' | 'DELETE';
  slug: string;
  selected: boolean;
  onToggle: () => void;
  preview: string;
  meta: string;
}) {
  const edge = {
    CREATE: 'border-l-blue-500',
    UPDATE: 'border-l-amber-500',
    DELETE: 'border-l-red-500',
  }[kind];
  const tag = {
    CREATE: 'bg-blue-100 text-blue-800',
    UPDATE: 'bg-amber-100 text-amber-800',
    DELETE: 'bg-red-100 text-red-800',
  }[kind];

  return (
    <div className={`rounded-lg border border-l-4 ${edge} bg-white shadow-sm`}>
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="h-4 w-4 rounded border-gray-300 text-violet-600"
        />
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tag}`}>
          {kind}
        </span>
        <code className="text-sm font-medium text-gray-900">{slug}</code>
        {meta && <span className="text-xs text-gray-500">— {meta}</span>}
      </div>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words px-4 py-3 text-xs leading-5 text-gray-700">
        {preview}
      </pre>
    </div>
  );
}

function toggle(
  set: Set<string>,
  setter: React.Dispatch<React.SetStateAction<Set<string>>>,
  key: string
): void {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  setter(next);
}

// ─── Lint Drawer ───

function WikiLintDrawer({
  kbId,
  onClose,
}: {
  kbId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<WikiLintTypeStr>('CONTRADICTION');
  const [findings, setFindings] = useState<WikiLintFinding[]>([]);
  const [loading, setLoading] = useState(true);

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
    <DrawerShell title="Lint" onClose={onClose}>
      <div className="flex flex-wrap gap-1 border-b border-gray-200 px-4 py-2">
        {(
          [
            'CONTRADICTION',
            'STALE',
            'ORPHAN',
            'MISSING_XREF',
            'DATA_GAP',
          ] as const
        ).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2.5 py-1 text-xs font-medium ${
              tab === t
                ? 'bg-violet-100 text-violet-800'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-violet-500" />
        ) : findings.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            该类别下暂无未解决的发现
          </div>
        ) : (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li
                key={f.id}
                className="rounded border border-gray-200 bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <pre className="whitespace-pre-wrap break-words text-xs text-gray-700">
                      {JSON.stringify(f.detail, null, 2)}
                    </pre>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={async () => {
                          await wikiApi.patchLintFinding(kbId, f.id, 'resolve');
                          refresh();
                        }}
                        className="rounded bg-violet-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-violet-700"
                      >
                        Resolve
                      </button>
                      <button
                        onClick={async () => {
                          await wikiApi.patchLintFinding(kbId, f.id, 'dismiss');
                          refresh();
                        }}
                        className="rounded border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-gray-200 px-4 py-2">
        <button
          onClick={async () => {
            await wikiApi.runLint(kbId);
            refresh();
          }}
          className="w-full rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
        >
          运行完整 Lint（5 类）
        </button>
      </div>
    </DrawerShell>
  );
}

function WikiLogDrawer({
  kbId,
  onClose,
}: {
  kbId: string;
  onClose: () => void;
}) {
  return (
    <DrawerShell title="Log" onClose={onClose}>
      <div className="px-4 py-6 text-sm text-gray-600">
        <p>
          KB <code>{kbId.slice(0, 8)}…</code> 的操作日志（log.md 形态）将在 P3a
          后续迭代上线。
        </p>
        <p className="mt-3 text-xs text-gray-500">
          后端 WikiOperationLog 已每次 ingest / apply / edit / revert 时写入；
          UI 端将以时间倒序卡片形式展示。
        </p>
      </div>
    </DrawerShell>
  );
}

function DrawerShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed right-0 top-0 z-30 flex h-full w-96 flex-col border-l border-gray-200 bg-white shadow-xl">
      <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}

// ─── Helpers ───

function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

// ─── Ingest picker modal ───

function IngestPickerModal({
  kbId,
  onClose,
  onIngested,
}: {
  kbId: string;
  onClose: () => void;
  onIngested: (diffId: string) => void;
}) {
  const [docs, setDocs] = useState<KbDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    wikiApi
      .listKbDocuments(kbId)
      .then((res) => {
        if (cancelled) return;
        const items = Array.isArray(res)
          ? res
          : ((res as { items?: KbDocumentSummary[] }).items ?? []);
        setDocs(items);
      })
      .catch((err) => {
        logger?.error?.('[wiki] listKbDocuments failed', err);
        if (!cancelled) setError('Failed to load documents');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbId]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const submit = async () => {
    if (selected.size === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await wikiApi.ingest(kbId, Array.from(selected));
      onIngested(result.diff.id);
    } catch (err) {
      logger?.error?.('[wiki] ingest failed', err);
      setError(err instanceof Error ? err.message : 'Ingest failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
      <div className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              选择要 Ingest 的文档
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              LLM 将把所选文档编译为 wiki 提议供你逐项审阅。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : docs.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              该知识库还没有文档。请先在「数据源」tab 上传文档。
            </div>
          ) : (
            <ul className="space-y-1">
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start gap-3 rounded border border-gray-100 px-3 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-violet-600"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {d.title || d.id}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {d.sourceType} · {d.status} ·{' '}
                      {formatRelativeTime(d.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
        <footer className="flex items-center justify-between border-t border-gray-200 px-6 py-3">
          <div className="text-xs text-gray-500">
            已选 {selected.size} / {docs.length} 篇
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="rounded-md border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              disabled={submitting || selected.size === 0}
              onClick={submit}
              className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              运行 Ingest
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Wiki enable toggle modal ───

interface KbWithOwnership {
  id: string;
  name: string;
  type: string;
  wikiEnabled?: boolean;
}

function WikiEnableToggleModal({
  onClose,
  onEnabled,
}: {
  onClose: () => void;
  onEnabled: (kbId: string) => void;
}) {
  const [kbs, setKbs] = useState<KbWithOwnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKbId, setBusyKbId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // Reuse the existing /rag/knowledge-bases endpoint via apiClient (auto base
    // URL + auth + 401 refresh handling, same plumbing as the rest of wikiApi).
    wikiApi
      .listAllKbs()
      .then((data) => {
        if (cancelled) return;
        const items = Array.isArray(data)
          ? (data as KbWithOwnership[])
          : ((data as { items?: KbWithOwnership[] }).items ?? []);
        setKbs(items);
      })
      .catch((err) => {
        logger?.error?.('[wiki] list KBs for toggle failed', err);
        if (!cancelled) setError('Failed to load knowledge bases');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async (kbId: string) => {
    setBusyKbId(kbId);
    setError(null);
    try {
      const result = await wikiApi.toggleWikiEnabled(kbId, true);
      onEnabled(result.kbId);
    } catch (err) {
      logger?.error?.('[wiki] toggleWikiEnabled failed', err);
      setError(
        err instanceof Error
          ? err.message
          : '需要 OWNER/ADMIN 角色才能启用 Wiki'
      );
    } finally {
      setBusyKbId(null);
    }
  };

  const eligible = kbs.filter((kb) => !kb.wikiEnabled);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
      <div className="flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              为知识库启用 Wiki
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              选择一个知识库启用 Wiki — 需要 OWNER 或 ADMIN 角色。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
          ) : error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          ) : eligible.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-500">
              {kbs.length === 0
                ? '你还没有任何知识库。请先在「个人知识库」或「团队知识库」tab 创建一个。'
                : '所有知识库都已启用 Wiki。'}
            </div>
          ) : (
            <ul className="space-y-2">
              {eligible.map((kb) => (
                <li
                  key={kb.id}
                  className="flex items-center justify-between rounded border border-gray-200 px-4 py-3 hover:border-violet-300"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {kb.name}
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {kb.type === 'TEAM' ? '团队知识库' : '个人知识库'}
                    </div>
                  </div>
                  <button
                    disabled={busyKbId === kb.id}
                    onClick={() => enable(kb.id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-violet-700 disabled:opacity-50"
                  >
                    {busyKbId === kb.id && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    启用 Wiki
                  </button>
                </li>
              ))}
            </ul>
          )}
        </main>
        <footer className="border-t border-gray-200 px-6 py-3 text-xs text-gray-500">
          启用后会创建 WikiKnowledgeBaseConfig 默认行（inlinePageCount=200 /
          ingestMaxTokens=80000）。EDITOR / VIEWER 角色尝试启用会被服务端拒绝
          (403)。
        </footer>
      </div>
    </div>
  );
}

function getAuthHeaderSafe(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem('auth_tokens');
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { accessToken?: string };
    return parsed.accessToken
      ? { Authorization: `Bearer ${parsed.accessToken}` }
      : {};
  } catch {
    return {};
  }
}

// re-export FileSearch import to avoid unused-import lint warning when
// downstream sub-iterations begin using a query panel
export const _wikiTabIcons = { FileSearch, Sparkles };
