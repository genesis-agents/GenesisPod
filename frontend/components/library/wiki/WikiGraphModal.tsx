'use client';

/**
 * Wiki Graph Modal — concentric SVG layout of pages (nodes) and `[[slug]]`
 * references (edges). Extracted from WikiTab.tsx to keep that file under
 * the project's god-class size guard (>2500 LOC + 50-line per-push cap).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import { Loader2, Maximize2, Minus, Plus, X } from 'lucide-react';
import { wikiApi, type WikiPage, type WikiPageCategory } from '@/lib/api/wiki';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from '@/lib/i18n';

const GRAPH_CATEGORY_COLORS: Record<WikiPageCategory, string> = {
  SUMMARY: '#a855f7',
  ENTITY: '#0ea5e9',
  CONCEPT: '#22c55e',
  SOURCE: '#f59e0b',
};

// Inner-to-outer ring radii (SVG units; scaled to the viewBox half-width).
// Tuned so the outer SOURCE ring sits inside the 520-unit half so labels
// don't clip; bigger gaps = more breathing room when zoomed out.
const RING_RADII: Record<WikiPageCategory, number> = {
  SUMMARY: 100,
  ENTITY: 230,
  CONCEPT: 360,
  SOURCE: 470,
};

const RING_ORDER: WikiPageCategory[] = [
  'SUMMARY',
  'ENTITY',
  'CONCEPT',
  'SOURCE',
];

// Base viewBox is symmetric square `[-VB_HALF, VB_HALF]`. Scale=1 fits the
// outer SOURCE ring (radius 430) with margin. Pan/zoom move (cx,cy,scale).
const VB_HALF = 520;
const MIN_SCALE = 0.4;
const MAX_SCALE = 6;

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
  const [view, setView] = useState({ cx: 0, cy: 0, scale: 1 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCx: number;
    startCy: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

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

  // Convert browser pixel coords to SVG-space coords (respecting current
  // viewBox + preserveAspectRatio="xMidYMid meet"). Used so wheel zoom and
  // pan happen relative to the cursor position rather than always centered.
  const screenToSvg = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      const vbW = (2 * VB_HALF) / view.scale;
      const vbH = (2 * VB_HALF) / view.scale;
      // 'meet' = uniform scale, the smaller of width/height ratios wins.
      const fit = Math.min(rect.width / vbW, rect.height / vbH);
      const renderedW = vbW * fit;
      const renderedH = vbH * fit;
      const padX = (rect.width - renderedW) / 2;
      const padY = (rect.height - renderedH) / 2;
      const localX = (clientX - rect.left - padX) / fit;
      const localY = (clientY - rect.top - padY) / fit;
      return { x: localX + view.cx - VB_HALF, y: localY + view.cy - VB_HALF };
    },
    [view]
  );

  const handleWheel = useCallback(
    (e: ReactWheelEvent<SVGSVGElement>) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      setView((prev) => {
        const nextScale = clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE);
        if (nextScale === prev.scale) return prev;
        // Zoom toward cursor: keep the SVG-space point under the mouse fixed.
        const anchor = screenToSvg(e.clientX, e.clientY);
        if (!anchor) return { ...prev, scale: nextScale };
        const ratio = prev.scale / nextScale;
        const nextCx = anchor.x - (anchor.x - prev.cx) * ratio;
        const nextCy = anchor.y - (anchor.y - prev.cy) * ratio;
        return { cx: nextCx, cy: nextCy, scale: nextScale };
      });
    },
    [screenToSvg]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      // Left button only; ignore clicks that originate on a node group so
      // node click-to-open still works.
      if (e.button !== 0) return;
      const target = e.target as SVGElement;
      if (target.closest('g[data-wiki-node="1"]')) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startCx: view.cx,
        startCy: view.cy,
      };
      setDragging(true);
    },
    [view]
  );

  const handlePointerMove = useCallback(
    (e: ReactPointerEvent<SVGSVGElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const vbW = (2 * VB_HALF) / view.scale;
      const vbH = (2 * VB_HALF) / view.scale;
      const fit = Math.min(rect.width / vbW, rect.height / vbH);
      const dx = (e.clientX - drag.startX) / fit;
      const dy = (e.clientY - drag.startY) / fit;
      setView((prev) => ({
        ...prev,
        cx: drag.startCx - dx,
        cy: drag.startCy - dy,
      }));
    },
    [view.scale]
  );

  const handlePointerUp = useCallback((e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragRef.current = null;
      setDragging(false);
    }
  }, []);

  const zoomBy = useCallback((factor: number) => {
    setView((prev) => ({
      ...prev,
      scale: clamp(prev.scale * factor, MIN_SCALE, MAX_SCALE),
    }));
  }, []);

  const resetView = useCallback(() => setView({ cx: 0, cy: 0, scale: 1 }), []);

  // Reset view whenever a new KB's pages are loaded so the user always sees
  // the full graph on first render.
  useEffect(() => {
    setView({ cx: 0, cy: 0, scale: 1 });
  }, [kbId]);

  const viewBox = `${view.cx - VB_HALF / view.scale} ${view.cy - VB_HALF / view.scale} ${(2 * VB_HALF) / view.scale} ${(2 * VB_HALF) / view.scale}`;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[95vh] w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
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
              ref={svgRef}
              viewBox={viewBox}
              className={`h-full w-full select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              preserveAspectRatio="xMidYMid meet"
              onWheel={handleWheel}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
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
                    strokeWidth={highlighted ? 2.2 : 1.0}
                    opacity={highlighted ? 0.95 : hover ? 0.25 : 0.7}
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
                    data-wiki-node="1"
                    transform={`translate(${pos.x},${pos.y})`}
                    onMouseEnter={() => setHover(p.slug)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSlug(p.slug);
                    }}
                    className="cursor-pointer"
                    opacity={dimmed ? 0.25 : 1}
                  >
                    <circle
                      r={hover === p.slug ? 12 : 8}
                      fill={GRAPH_CATEGORY_COLORS[p.category]}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                    {(hover === p.slug || nodes.length <= 60) && (
                      <text
                        x={0}
                        y={-16}
                        textAnchor="middle"
                        fontSize={14}
                        fontWeight={hover === p.slug ? 600 : 400}
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
          {!loading && nodes.length > 0 && (
            <div className="absolute right-4 top-4 flex flex-col gap-1 rounded-md border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
              <button
                onClick={() => zoomBy(1.25)}
                className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                title={t('library.wiki.graph.zoomIn')}
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={() => zoomBy(1 / 1.25)}
                className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                title={t('library.wiki.graph.zoomOut')}
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                onClick={resetView}
                className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                title={t('library.wiki.graph.resetView')}
              >
                <Maximize2 className="h-4 w-4" />
              </button>
              <div className="border-t border-gray-200 px-1 py-0.5 text-center text-[10px] text-gray-500">
                {Math.round(view.scale * 100)}%
              </div>
            </div>
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
