'use client';

/**
 * Wiki Graph Modal — concentric SVG layout of pages (nodes) and `[[slug]]`
 * references (edges). Extracted from WikiTab.tsx to keep that file under
 * the project's god-class size guard (>2500 LOC + 50-line per-push cap).
 */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { wikiApi, type WikiPage, type WikiPageCategory } from '@/lib/api/wiki';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';

const GRAPH_CATEGORY_COLORS: Record<WikiPageCategory, string> = {
  SUMMARY: '#a855f7',
  ENTITY: '#0ea5e9',
  CONCEPT: '#22c55e',
  SOURCE: '#f59e0b',
};

const RING_RADII: Record<WikiPageCategory, number> = {
  SUMMARY: 90,
  ENTITY: 200,
  CONCEPT: 320,
  SOURCE: 430,
};

const RING_ORDER: WikiPageCategory[] = [
  'SUMMARY',
  'ENTITY',
  'CONCEPT',
  'SOURCE',
];

export default function WikiGraphModal({
  kbId,
  onClose,
  onSelectSlug,
}: {
  kbId: string;
  onClose: () => void;
  onSelectSlug: (slug: string) => void;
}) {
  const { t } = useTranslation();
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    wikiApi
      .listPages(kbId, undefined, 1000)
      .then((res) => {
        if (!cancelled) setPages(res.items);
      })
      .catch((err) => logger?.error?.('[wiki] graph listPages failed', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kbId]);

  // Parse [[slug]] markers from each page body to build the edge list.
  const { nodes, edges } = useMemo(() => {
    const slugSet = new Set(pages.map((p) => p.slug));
    const linkRe = /\[\[([a-z0-9][a-z0-9-]*[a-z0-9])\]\]/g;
    type Edge = { source: string; target: string };
    const edgeList: Edge[] = [];
    for (const p of pages) {
      const body = p.body ?? '';
      const seen = new Set<string>();
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(body)) !== null) {
        const target = m[1];
        if (target === p.slug || seen.has(target)) continue;
        if (!slugSet.has(target)) continue;
        seen.add(target);
        edgeList.push({ source: p.slug, target });
      }
    }
    return { nodes: pages, edges: edgeList };
  }, [pages]);

  // Concentric layout: SUMMARY in inner ring, ENTITY/CONCEPT mid, SOURCE outer.
  const layout = useMemo(() => {
    const grouped: Record<WikiPageCategory, WikiPage[]> = {
      SUMMARY: [],
      ENTITY: [],
      CONCEPT: [],
      SOURCE: [],
    };
    for (const p of nodes) grouped[p.category].push(p);
    const positions = new Map<string, { x: number; y: number }>();
    for (const cat of RING_ORDER) {
      const items = grouped[cat];
      const r = RING_RADII[cat];
      const n = items.length;
      items.forEach((p, i) => {
        const theta =
          n === 1 ? -Math.PI / 2 : (i / n) * Math.PI * 2 - Math.PI / 2;
        positions.set(p.slug, {
          x: r * Math.cos(theta),
          y: r * Math.sin(theta),
        });
      });
    }
    return positions;
  }, [nodes]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-6">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('library.wiki.graph.title')}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {t('library.wiki.graph.subtitle', {
                nodes: nodes.length,
                edges: edges.length,
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <main className="relative flex-1 overflow-hidden bg-gray-50">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              {t('library.wiki.graph.empty')}
            </div>
          ) : (
            <svg
              viewBox="-520 -520 1040 1040"
              className="h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {edges.map((e, i) => {
                const a = layout.get(e.source);
                const b = layout.get(e.target);
                if (!a || !b) return null;
                const highlighted =
                  hover != null && (e.source === hover || e.target === hover);
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke={highlighted ? '#7c3aed' : '#cbd5e1'}
                    strokeWidth={highlighted ? 1.4 : 0.6}
                    opacity={highlighted ? 0.95 : hover ? 0.2 : 0.6}
                  />
                );
              })}
              {nodes.map((p) => {
                const pos = layout.get(p.slug);
                if (!pos) return null;
                const highlighted =
                  hover === p.slug ||
                  (hover != null && adjacency.get(hover)?.has(p.slug));
                const dimmed = hover != null && !highlighted;
                return (
                  <g
                    key={p.slug}
                    transform={`translate(${pos.x},${pos.y})`}
                    onMouseEnter={() => setHover(p.slug)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => onSelectSlug(p.slug)}
                    className="cursor-pointer"
                    opacity={dimmed ? 0.25 : 1}
                  >
                    <circle
                      r={hover === p.slug ? 8 : 5}
                      fill={GRAPH_CATEGORY_COLORS[p.category]}
                      stroke="#fff"
                      strokeWidth={1.5}
                    />
                    {(hover === p.slug || nodes.length <= 60) && (
                      <text
                        x={0}
                        y={-12}
                        textAnchor="middle"
                        fontSize={10}
                        fill="#1f2937"
                        style={{ pointerEvents: 'none' }}
                      >
                        {p.title.length > 18
                          ? p.title.slice(0, 17) + '…'
                          : p.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </main>
        <footer className="flex items-center gap-4 border-t border-gray-200 px-6 py-3 text-xs text-gray-600">
          {RING_ORDER.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: GRAPH_CATEGORY_COLORS[cat] }}
              />
              {cat}
            </span>
          ))}
          <span className="ml-auto text-gray-400">
            {t('library.wiki.graph.hint')}
          </span>
        </footer>
      </div>
    </div>
  );
}
