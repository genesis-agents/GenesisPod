'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/utils/common';
import type {
  ForesightCard,
  ForesightEdge,
  ForesightLayerDef,
} from '@/services/foresight/api';
import {
  bfsReach,
  buildAdjacency,
  type CardPendingState,
} from './foresight-meta';

interface EdgePath {
  id: string;
  d: string;
  mid: { x: number; y: number };
}

interface GraphCanvasProps {
  cards: ForesightCard[];
  edges: ForesightEdge[];
  /** 主题自有层级本体（泳道定义） */
  layers: ForesightLayerDef[];
  pending: Map<string, CardPendingState>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

/** 代际阶段 → 深色画布上的强调色（左色条 / 圆点 / 标签）。 */
const STAGE_ACCENT: Record<string, { color: string; label: string }> = {
  current: { color: '#34d399', label: '当前落地' },
  evolving: { color: '#38bdf8', label: '演进中' },
  exploring: { color: '#fbbf24', label: '探索验证' },
  research: { color: '#a78bfa', label: '研究前沿' },
};
const FALLBACK_ACCENT = { color: '#94a3b8', label: '—' };

const SENS_TAG: Record<string, { label: string; color: string }> = {
  high: { label: '高敏', color: '#fb7185' },
  mid: { label: '中敏', color: '#fbbf24' },
  low: { label: '低敏', color: '#64748b' },
};

/** 置信度环颜色按健康度分档：高=绿，中=琥珀，低=红。 */
function confTier(conf: number): string {
  if (conf >= 0.7) return '#34d399';
  if (conf >= 0.45) return '#fbbf24';
  return '#fb7185';
}

/** 层级深度配色（泳道左轨的视觉节奏）。 */
const LANE_HUE = [
  '#38bdf8',
  '#22d3ee',
  '#34d399',
  '#a3e635',
  '#fbbf24',
  '#fb7185',
  '#f472b6',
  '#a78bfa',
];

/** 置信度圆环仪表。 */
function ConfRing({ conf }: { conf: number }) {
  const r = 11;
  const circ = 2 * Math.PI * r;
  const tier = confTier(conf);
  return (
    <span className="relative inline-flex h-8 w-8 items-center justify-center">
      <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke="rgba(148,163,184,0.18)"
          strokeWidth="3"
        />
        <circle
          cx="16"
          cy="16"
          r={r}
          fill="none"
          stroke={tier}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - Math.max(0, Math.min(1, conf)))}
          style={{ transition: 'stroke-dashoffset .6s ease' }}
        />
      </svg>
      <span
        className="font-mono absolute text-[9px] font-semibold tabular-nums"
        style={{ color: tier }}
      >
        {conf.toFixed(2).slice(1)}
      </span>
    </span>
  );
}

/**
 * GraphCanvas —— 判断图谱「观星台」深色画布。
 *
 * 维度表达：层级（泳道+左轨配色）/ 代际阶段（左色条+圆点+标签）/ 置信度
 * （右上圆环仪表按健康度变色）/ 敏感度（微标签）/ 复核状态（信号命中=红脉冲、
 * 待复核=琥珀脉冲）/ 情景分叉（紫标）/ 关系（带箭头的边：flow 实线冷色、
 * constrain 虚线暖色、线宽=传导强度）/ 血缘（选中后上游青、下游琥珀发光，余者淡出）。
 */
export function GraphCanvas({
  cards,
  edges,
  layers,
  pending,
  selectedId,
  onSelect,
}: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [paths, setPaths] = useState<EdgePath[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const layerIdx = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.id, c.layer]));
    return (cardId: string) =>
      layers.findIndex((l) => l.id === byId.get(cardId));
  }, [cards, layers]);

  const adj = useMemo(() => buildAdjacency(edges), [edges]);

  const highlight = useMemo(() => {
    if (!selectedId) return null;
    const down = bfsReach(selectedId, adj.out, (e) => e.toCardId);
    const up = bfsReach(selectedId, adj.inn, (e) => e.fromCardId);
    return { down, up };
  }, [selectedId, adj]);

  /** hover 某节点时其直连边（仅未选中状态下高亮）。 */
  const hoverEdgeIds = useMemo(() => {
    if (!hoveredId || selectedId) return new Set<string>();
    const ids = new Set<string>();
    for (const e of edges) {
      if (e.fromCardId === hoveredId || e.toCardId === hoveredId) ids.add(e.id);
    }
    return ids;
  }, [hoveredId, selectedId, edges]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cRect = container.getBoundingClientRect();
    setSize({ w: container.scrollWidth, h: container.scrollHeight });

    const rectOf = (id: string) => {
      const el = cardRefs.current.get(id);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left - cRect.left,
        y: r.top - cRect.top,
        w: r.width,
        h: r.height,
      };
    };

    const next: EdgePath[] = [];
    for (const e of edges) {
      const a = rectOf(e.fromCardId);
      const b = rectOf(e.toCardId);
      if (!a || !b) continue;
      const la = layerIdx(e.fromCardId);
      const lb = layerIdx(e.toCardId);
      const ax = a.x + a.w / 2;
      const bx = b.x + b.w / 2;
      let d: string;
      if (lb - la <= -3) {
        // 长反压边：走泳道左侧走廊，避免横穿卡片
        const railX = 60;
        const ay = a.y + a.h / 2;
        const by = b.y + b.h / 2;
        d =
          `M ${a.x} ${ay} C ${railX + 30} ${ay}, ${railX} ${ay - 20}, ${railX} ${ay - 80}` +
          ` L ${railX} ${by + 80} C ${railX} ${by + 20}, ${railX + 30} ${by}, ${b.x} ${by}`;
      } else if (la === lb) {
        const ay = a.y + a.h / 2;
        const by = b.y + b.h / 2;
        const right = bx > ax;
        const x1 = right ? a.x + a.w : a.x;
        const x2 = right ? b.x : b.x + b.w;
        const dx = Math.max(28, Math.abs(x2 - x1) / 2);
        d = `M ${x1} ${ay} C ${x1 + (right ? dx : -dx)} ${ay}, ${x2 + (right ? -dx : dx)} ${by}, ${x2} ${by}`;
      } else {
        const downDir = lb > la;
        const y1 = downDir ? a.y + a.h : a.y;
        const y2 = downDir ? b.y : b.y + b.h;
        const dy = Math.max(36, Math.abs(y2 - y1) / 2);
        d = `M ${ax} ${y1} C ${ax} ${y1 + (downDir ? dy : -dy)}, ${bx} ${y2 + (downDir ? -dy : dy)}, ${bx} ${y2}`;
      }
      next.push({
        id: e.id,
        d,
        mid: { x: (ax + bx) / 2, y: (a.y + a.h / 2 + b.y + b.h / 2) / 2 },
      });
    }
    setPaths(next);
  }, [edges, layerIdx]);

  useLayoutEffect(() => {
    measure();
  }, [measure, cards.length]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, 150);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (timer) clearTimeout(timer);
    };
  }, [measure]);

  const edgeById = useMemo(() => new Map(edges.map((e) => [e.id, e])), [edges]);

  /** 每条边的描边样式（颜色/粗细/透明度/虚线/箭头/辉光）。 */
  function edgeStyle(id: string): {
    stroke: string;
    width: number;
    opacity: number;
    dash?: string;
    marker: string;
    glow: boolean;
  } {
    const e = edgeById.get(id);
    const base = 0.8 + (e?.weight ?? 0.7) * 2.4;
    const dash = e?.type === 'constrain' ? '5 4' : undefined;
    if (highlight) {
      if (highlight.down.edgeIds.has(id))
        return {
          stroke: '#f59e0b',
          width: base + 0.8,
          opacity: 0.95,
          dash,
          marker: 'ah-amber',
          glow: true,
        };
      if (highlight.up.edgeIds.has(id))
        return {
          stroke: '#22d3ee',
          width: base + 0.8,
          opacity: 0.95,
          dash,
          marker: 'ah-cyan',
          glow: true,
        };
      return {
        stroke: '#334155',
        width: base,
        opacity: 0.07,
        dash,
        marker: 'ah-dim',
        glow: false,
      };
    }
    if (hoverEdgeIds.has(id))
      return {
        stroke: '#cbd5e1',
        width: base + 0.5,
        opacity: 0.85,
        dash,
        marker: 'ah-bright',
        glow: true,
      };
    if (e?.type === 'constrain')
      return {
        stroke: '#b45309',
        width: base,
        opacity: 0.5,
        dash,
        marker: 'ah-constrain',
        glow: false,
      };
    return {
      stroke: '#475569',
      width: base,
      opacity: 0.4,
      marker: 'ah-dim',
      glow: false,
    };
  }

  function cardState(id: string): 'src' | 'dirty' | 'up' | 'down' | 'none' {
    const p = pending.get(id);
    if (p?.isSource) return 'src';
    if (p) return 'dirty';
    if (highlight && id !== selectedId) {
      if (highlight.down.nodes.has(id)) return 'down';
      if (highlight.up.nodes.has(id)) return 'up';
    }
    return 'none';
  }

  const showLabelEdgeIds = useMemo(() => {
    if (highlight)
      return new Set([...highlight.down.edgeIds, ...highlight.up.edgeIds]);
    return hoverEdgeIds;
  }, [highlight, hoverEdgeIds]);

  /** 选中后非血缘节点淡出。 */
  const dimNode = (id: string) =>
    highlight != null &&
    id !== selectedId &&
    !highlight.down.nodes.has(id) &&
    !highlight.up.nodes.has(id) &&
    !pending.has(id);

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden rounded-2xl ring-1 ring-slate-800"
      style={{
        backgroundColor: '#020617',
        backgroundImage:
          'radial-gradient(1100px 460px at 18% -12%, rgba(56,189,248,0.10), transparent 60%),' +
          'radial-gradient(900px 480px at 92% -8%, rgba(167,139,250,0.08), transparent 55%),' +
          'linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)',
        backgroundSize: 'auto, auto, 30px 30px, 30px 30px',
      }}
    >
      {/* 图例 */}
      <div className="font-mono pointer-events-none absolute right-4 top-4 z-30 flex flex-col gap-2 rounded-xl border border-slate-700/60 bg-slate-900/80 px-3.5 py-2.5 text-[10px] text-slate-300 shadow-xl backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {Object.entries(STAGE_ACCENT).map(([k, v]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: v.color }}
              />
              {v.label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-x-3 border-t border-slate-700/60 pt-1.5 text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-px w-5" style={{ background: '#64748b' }} />
            影响传导
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-0 w-5 border-t border-dashed"
              style={{ borderColor: '#b45309' }}
            />
            约束反压
          </span>
          <span className="text-slate-500">线宽=传导强度</span>
        </div>
      </div>

      {/* 边层 */}
      <svg
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={size.w}
        height={size.h}
      >
        <defs>
          {(
            [
              ['ah-dim', '#475569'],
              ['ah-bright', '#cbd5e1'],
              ['ah-amber', '#f59e0b'],
              ['ah-cyan', '#22d3ee'],
              ['ah-constrain', '#b45309'],
            ] as const
          ).map(([id, color]) => (
            <marker
              key={id}
              id={id}
              markerWidth="9"
              markerHeight="9"
              refX="7"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L6.5,3 L0,6 Z" fill={color} />
            </marker>
          ))}
          <filter id="edge-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {paths.map((p) => {
          const s = edgeStyle(p.id);
          return (
            <path
              key={p.id}
              d={p.d}
              fill="none"
              stroke={s.stroke}
              strokeWidth={s.width}
              strokeOpacity={s.opacity}
              strokeDasharray={s.dash}
              strokeLinecap="round"
              markerEnd={`url(#${s.marker})`}
              filter={s.glow ? 'url(#edge-glow)' : undefined}
              style={{ transition: 'stroke-opacity .25s ease' }}
            />
          );
        })}
      </svg>

      {/* 边参数标签：选中血缘 / hover 时显示 */}
      {paths
        .filter((p) => showLabelEdgeIds.has(p.id))
        .map((p) => {
          const e = edgeById.get(p.id);
          return (
            <span
              key={`lbl-${p.id}`}
              className="font-mono pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-slate-600/70 bg-slate-900/90 px-1.5 py-0.5 text-[10px] text-slate-200 shadow-lg backdrop-blur"
              style={{ left: p.mid.x, top: p.mid.y }}
            >
              {e?.metric}
              <span className="ml-1 text-slate-500">
                w{e?.weight.toFixed(1)}
              </span>
            </span>
          );
        })}

      {/* 泳道 + 节点 */}
      <div className="relative z-10 py-2">
        {layers.map((layer, li) => {
          const layerCards = cards.filter((c) => c.layer === layer.id);
          if (layerCards.length === 0) return null;
          const hue = LANE_HUE[li % LANE_HUE.length];
          return (
            <div
              key={layer.id}
              className="relative flex gap-5 border-b border-slate-800/70 py-7 pl-28 last:border-b-0"
            >
              {/* 左轨 */}
              <div className="absolute bottom-7 left-0 top-7 flex w-24 flex-col justify-center gap-1 pr-4 text-right">
                <span
                  className="absolute bottom-3 right-3 top-3 w-0.5 rounded-full opacity-70"
                  style={{ background: hue }}
                />
                <span
                  className="text-2xl font-black leading-none tracking-tight"
                  style={{ color: hue }}
                >
                  {layer.id}
                </span>
                <span className="text-xs font-semibold text-slate-200">
                  {layer.name}
                </span>
                {layer.en && (
                  <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
                    {layer.en}
                  </span>
                )}
              </div>

              <div className="flex flex-1 flex-wrap gap-4">
                {layerCards.map((card) => {
                  const state = cardState(card.id);
                  const p = pending.get(card.id);
                  const accent = STAGE_ACCENT[card.stage] ?? FALLBACK_ACCENT;
                  const sens = SENS_TAG[card.sens] ?? SENS_TAG.mid;
                  const isSel = selectedId === card.id;
                  return (
                    <div
                      key={card.id}
                      ref={(el) => {
                        if (el) cardRefs.current.set(card.id, el);
                        else cardRefs.current.delete(card.id);
                      }}
                      onClick={() => onSelect(isSel ? null : card.id)}
                      onMouseEnter={() => setHoveredId(card.id)}
                      onMouseLeave={() =>
                        setHoveredId((h) => (h === card.id ? null : h))
                      }
                      className={cn(
                        'group relative w-56 cursor-pointer overflow-hidden rounded-xl border bg-slate-900/70 p-3 pl-4 backdrop-blur-sm transition-all duration-200',
                        'hover:-translate-y-0.5 hover:bg-slate-900/90',
                        state === 'src' && 'border-rose-500/70',
                        state === 'dirty' && 'border-amber-500/70',
                        state === 'up' && 'border-cyan-500/60',
                        state === 'down' && 'border-amber-400/60',
                        state === 'none' && 'border-slate-700/60',
                        isSel && 'border-slate-100',
                        dimNode(card.id) && 'opacity-30'
                      )}
                      style={{
                        boxShadow: isSel
                          ? '0 0 0 1px rgba(241,245,249,.6), 0 10px 30px rgba(0,0,0,.5)'
                          : state === 'src'
                            ? '0 0 22px rgba(244,63,94,.35)'
                            : state === 'dirty'
                              ? '0 0 20px rgba(245,158,11,.28)'
                              : '0 6px 18px rgba(0,0,0,.35)',
                      }}
                    >
                      {/* 阶段左色条 */}
                      <span
                        className="absolute bottom-0 left-0 top-0 w-1"
                        style={{ background: accent.color }}
                      />

                      {/* 复核脉冲浮标 */}
                      {(state === 'src' || state === 'dirty') && (
                        <span
                          className={cn(
                            'font-mono absolute -top-2 right-3 z-10 animate-pulse rounded px-1.5 py-0.5 text-[9px] font-semibold text-white',
                            state === 'src' ? 'bg-rose-600' : 'bg-amber-500'
                          )}
                        >
                          {state === 'src'
                            ? '信号命中'
                            : `待复核 ${p ? p.impact.toFixed(2) : ''}`}
                        </span>
                      )}

                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="font-mono text-[10px] text-slate-500">
                            {card.cardKey}
                          </span>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: accent.color }}
                            />
                            <span
                              className="text-[10px]"
                              style={{ color: accent.color }}
                            >
                              {accent.label}
                            </span>
                            {card.scenarios && card.scenarios.length > 0 && (
                              <span className="rounded border border-violet-500/60 px-1 text-[9px] text-violet-300">
                                分叉
                              </span>
                            )}
                          </div>
                        </div>
                        <ConfRing conf={card.conf} />
                      </div>

                      <h3 className="text-[13px] font-semibold leading-snug text-slate-100">
                        {card.title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">
                        {card.claim}
                      </p>

                      <div className="font-mono mt-2.5 flex items-center justify-between text-[10px] text-slate-500">
                        <span style={{ color: sens.color }}>{sens.label}</span>
                        <span>信源 ×{card.sources.length}</span>
                        <span>H·{card.horizon}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
