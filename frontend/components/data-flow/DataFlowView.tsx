'use client';

/**
 * DataFlowView —— 系统数据流图（左侧菜单「数据流」）。
 *
 * 三类真实数据：
 *   ① 真实拓扑：GET /data-flow/graph（节点/边/层 + registry 校验 live）。布局由 layer 自动计算。
 *   ② 真实流量：GET /data-flow/metrics（AIUsageLog 聚合），节点 hover 显真实调用量。
 *   ③ 实时流动：每 6s 轮询 metrics，对比上次快照——调用量真涨的链路加速 + 高亮一簇粒子；
 *      空闲链路保持极慢 idle 示意。粒子方向 = 数据流向。
 *
 * 可视化为 d3-free 的原生 SVG（参考 MissionDagView 自渲染思路）：节点可拖动、
 * 点击弹抽屉看上下游、图例可按类别开关、可暂停。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GitFork, X } from 'lucide-react';
import { getDataFlowGraph, getDataFlowMetrics } from '@/services/data-flow/api';
import type {
  DataFlowEdge,
  DataFlowEdgeKind,
  DataFlowGraph,
  DataFlowGroup,
  DataFlowMetrics,
  DataFlowNode,
} from '@/services/data-flow/types';

// ── 画布常量 ──────────────────────────────────────────
const VW = 1720;
const VH = 800;
const W = 176;
const H = 52;
const TOP_Y = 110;
const BOT_Y = 690;

// ── 分层 / 类别配色（数据可视化分类色，hex 供 SVG 用，等同 tokens.ts 的 entityToken 性质）──
const GROUP_COLOR: Record<DataFlowGroup, string> = {
  external: '#64748b',
  explore: '#f59e0b',
  library: '#10b981',
  engine: '#06b6d4',
  ontology: '#a855f7',
  apps: '#3b82f6',
};

const KIND_META: Record<
  DataFlowEdgeKind,
  { color: string; label: string; dash: boolean; speed: number }
> = {
  ingest: {
    color: '#f59e0b',
    label: '采集 / 导入',
    dash: false,
    speed: 0.0016,
  },
  process: {
    color: '#14b8a6',
    label: '处理 / 向量化',
    dash: false,
    speed: 0.002,
  },
  retrieve: { color: '#3b82f6', label: '检索消费', dash: false, speed: 0.0024 },
  save: { color: '#22c55e', label: '收藏 / 素材', dash: false, speed: 0.0018 },
  ofill: { color: '#a855f7', label: '本体回填', dash: false, speed: 0.0014 },
  ouse: { color: '#c084fc', label: '本体利用', dash: true, speed: 0.0016 },
};

const PARTICLES_PER_EDGE = 4;
const POLL_MS = 6000;
const BURST_MS = 4500;

interface Pos {
  x: number;
  y: number;
}

/** 由 layer 自动布局：layer 越大越靠上；同层水平均分。 */
function computeLayout(graph: DataFlowGraph): Record<string, Pos> {
  const layerIds = Array.from(new Set(graph.nodes.map((n) => n.layer))).sort(
    (a, b) => b - a // 大的在上
  );
  const n = Math.max(layerIds.length, 1);
  const yOf = (layer: number): number => {
    const idx = layerIds.indexOf(layer);
    if (n === 1) return (TOP_Y + BOT_Y) / 2;
    return TOP_Y + (idx * (BOT_Y - TOP_Y)) / (n - 1);
  };
  const pos: Record<string, Pos> = {};
  for (const layer of layerIds) {
    const inLayer = graph.nodes.filter((nd) => nd.layer === layer);
    const m = inLayer.length;
    inLayer.forEach((nd, i) => {
      const cx = 40 + ((i + 0.5) * (VW - 80)) / m;
      pos[nd.id] = { x: cx - W / 2, y: yOf(layer) };
    });
  }
  return pos;
}

function rectEdgePoint(p: Pos, tx: number, ty: number): Pos {
  const cx = p.x + W / 2;
  const cy = p.y + H / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = 1 / Math.max(Math.abs(dx) / (W / 2), Math.abs(dy) / (H / 2));
  return { x: cx + dx * scale, y: cy + dy * scale };
}

function edgePath(a: Pos, b: Pos): string {
  const ca = { x: a.x + W / 2, y: a.y + H / 2 };
  const cb = { x: b.x + W / 2, y: b.y + H / 2 };
  const p1 = rectEdgePoint(a, cb.x, cb.y);
  const p2 = rectEdgePoint(b, ca.x, ca.y);
  if (Math.abs(p2.y - p1.y) >= Math.abs(p2.x - p1.x)) {
    const my = (p1.y + p2.y) / 2;
    return `M ${p1.x} ${p1.y} C ${p1.x} ${my}, ${p2.x} ${my}, ${p2.x} ${p2.y}`;
  }
  const mx = (p1.x + p2.x) / 2;
  return `M ${p1.x} ${p1.y} C ${mx} ${p1.y}, ${mx} ${p2.y}, ${p2.x} ${p2.y}`;
}

export default function DataFlowView() {
  const [graph, setGraph] = useState<DataFlowGraph | null>(null);
  const [metrics, setMetrics] = useState<DataFlowMetrics | null>(null);
  const [positions, setPositions] = useState<Record<string, Pos>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [windowHours, setWindowHours] = useState(24);
  const [playing, setPlaying] = useState(true);
  const [enabledKinds, setEnabledKinds] = useState<Set<DataFlowEdgeKind>>(
    new Set(Object.keys(KIND_META) as DataFlowEdgeKind[])
  );
  const [error, setError] = useState<string | null>(null);

  // 动画 / 拖拽 refs
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pathRefs = useRef<Record<string, SVGPathElement | null>>({});
  const particleRefs = useRef<Record<string, SVGCircleElement | null>>({});
  const particleT = useRef<Record<string, number>>({});
  const prevCalls = useRef<Record<string, number>>({});
  const burstUntil = useRef<Record<string, number>>({}); // edgeId → ts
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const enabledRef = useRef(enabledKinds);
  enabledRef.current = enabledKinds;
  const metricsRef = useRef<DataFlowMetrics | null>(metrics);
  metricsRef.current = metrics;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const drag = useRef<{
    id: string;
    dx: number;
    dy: number;
    moved: boolean;
  } | null>(null);

  // ① 拉拓扑（一次）
  useEffect(() => {
    let alive = true;
    getDataFlowGraph()
      .then((g) => {
        if (!alive) return;
        setGraph(g);
        setPositions(computeLayout(g));
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : String(e))
      );
    return () => {
      alive = false;
    };
  }, []);

  // ② 轮询 metrics（窗口变更 / 定时），并计算 burst
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      try {
        const m = await getDataFlowMetrics(windowHours);
        if (!alive) return;
        // 对比上次：调用量真涨的节点 → 其连边 burst
        const now = Date.now();
        if (graph) {
          for (const edge of graph.edges) {
            const a = m.nodes[edge.from]?.calls ?? 0;
            const b = m.nodes[edge.to]?.calls ?? 0;
            const prevA = prevCalls.current[edge.from] ?? 0;
            const prevB = prevCalls.current[edge.to] ?? 0;
            if (a > prevA || b > prevB)
              burstUntil.current[edge.id] = now + BURST_MS;
          }
          for (const node of graph.nodes) {
            prevCalls.current[node.id] = m.nodes[node.id]?.calls ?? 0;
          }
        }
        setMetrics(m);
      } catch {
        /* 轮询失败静默，下一轮重试 */
      } finally {
        if (alive) timer = setTimeout(() => void tick(), POLL_MS);
      }
    };
    void tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [windowHours, graph]);

  // ③ 粒子动画循环
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (playingRef.current && graph) {
        const now = Date.now();
        const m = metricsRef.current;
        for (const edge of graph.edges) {
          if (!enabledRef.current.has(edge.kind)) continue;
          const path = pathRefs.current[edge.id];
          if (!path) continue;
          let len = 0;
          try {
            len = path.getTotalLength();
          } catch {
            continue;
          }
          const callsA = m?.nodes[edge.from]?.calls ?? 0;
          const callsB = m?.nodes[edge.to]?.calls ?? 0;
          const intensity = Math.max(callsA, callsB);
          const bursting = (burstUntil.current[edge.id] ?? 0) > now;
          // 真有调用 → 加速；空闲 → 极慢 idle 示意
          const factor = bursting
            ? 3
            : intensity > 0
              ? Math.min(0.6 + Math.log10(1 + intensity) * 0.6, 2.6)
              : 0.22;
          const baseOpacity = bursting ? 1 : intensity > 0 ? 0.85 : 0.14;
          const dimmed =
            selectedRef.current &&
            edge.from !== selectedRef.current &&
            edge.to !== selectedRef.current;
          const speed = KIND_META[edge.kind].speed * factor;
          for (let i = 0; i < PARTICLES_PER_EDGE; i++) {
            const key = `${edge.id}:${i}`;
            const circle = particleRefs.current[key];
            if (!circle) continue;
            let t = particleT.current[key] ?? i / PARTICLES_PER_EDGE;
            t += speed;
            if (t > 1) t -= 1;
            particleT.current[key] = t;
            const pt = path.getPointAtLength(t * len);
            circle.setAttribute('cx', String(pt.x));
            circle.setAttribute('cy', String(pt.y));
            circle.style.opacity = String(
              dimmed
                ? 0.04
                : baseOpacity * (0.55 + 0.45 * Math.sin(t * Math.PI))
            );
            circle.setAttribute('r', bursting ? '3.6' : '3');
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [graph]);

  // ── 拖拽 ──
  const toSvg = useCallback((clientX: number, clientY: number): Pos => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  useEffect(() => {
    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      const p = toSvg(ev.clientX, ev.clientY);
      const d = drag.current;
      d.moved = true;
      setPositions((prev) => ({
        ...prev,
        [d.id]: { x: p.x - d.dx, y: p.y - d.dy },
      }));
    };
    const onUp = () => {
      drag.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [toSvg]);

  const connected = useMemo(() => {
    if (!graph || !selected) return null;
    const set = new Set<string>();
    for (const e of graph.edges) {
      if (e.from === selected || e.to === selected) {
        set.add(e.from);
        set.add(e.to);
      }
    }
    return set;
  }, [graph, selected]);

  const nodeById = useMemo(() => {
    const map: Record<string, DataFlowNode> = {};
    graph?.nodes.forEach((n) => (map[n.id] = n));
    return map;
  }, [graph]);

  const selectedNode = selected ? nodeById[selected] : null;
  const liveCount = graph?.nodes.filter((n) => n.live === true).length ?? 0;

  const toggleKind = (k: DataFlowEdgeKind) =>
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // ── 渲染 ──
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-lime-500 to-emerald-600 shadow-sm">
            <GitFork className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">系统数据流</h2>
            <p className="text-xs text-slate-400">
              前沿库 / 知识库 / 知识本体 ↔ AI Apps · 真实 live + 流量驱动流动
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {liveCount} 在线 · {metrics?.totalCalls ?? 0} 次调用
          </div>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-gray-200">
            {[
              { h: 1, l: '1h' },
              { h: 24, l: '24h' },
              { h: 168, l: '7d' },
            ].map((w) => (
              <button
                key={w.h}
                type="button"
                onClick={() => setWindowHours(w.h)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  windowHours === w.h
                    ? 'bg-lime-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {w.l}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPlaying((p) => !p)}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
          >
            {playing ? '暂停流动' : '开始流动'}
          </button>
        </div>
      </div>

      <div className="relative h-[calc(100vh-220px)] min-h-[520px] overflow-hidden rounded-xl border border-slate-200 bg-gray-50">
        {error && (
          <div className="absolute left-1/2 top-6 z-20 -translate-x-1/2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            加载失败：{error}
          </div>
        )}
        {!graph && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            加载系统拓扑…
          </div>
        )}

        {graph && (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${VW} ${VH}`}
            preserveAspectRatio="xMidYMid meet"
            className="h-full w-full"
            onClick={() => setSelected(null)}
          >
            <defs>
              <filter id="dfGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* 架构带：分隔线 + 标签 */}
            {graph.layers.map((L) => {
              const node = graph.nodes.find((n) => n.layer === L.id);
              const y = node ? (positions[node.id]?.y ?? 0) : 0;
              const labelY = y - 30;
              return (
                <g key={L.id}>
                  <line
                    x1={14}
                    x2={VW - 14}
                    y1={y - 14}
                    y2={y - 14}
                    stroke="#e2e8f0"
                    strokeDasharray="2 6"
                  />
                  <text
                    x={20}
                    y={labelY}
                    className="fill-gray-400"
                    style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1 }}
                  >
                    {L.label}
                  </text>
                </g>
              );
            })}

            {/* 边 */}
            {graph.edges.map((e) => {
              const a = positions[e.from];
              const b = positions[e.to];
              if (!a || !b) return null;
              const on = enabledKinds.has(e.kind);
              const dim =
                (connected && e.from !== selected && e.to !== selected) || !on;
              return (
                <path
                  key={e.id}
                  ref={(el) => {
                    pathRefs.current[e.id] = el;
                  }}
                  d={edgePath(a, b)}
                  fill="none"
                  stroke={KIND_META[e.kind].color}
                  strokeWidth={1.4}
                  strokeOpacity={dim ? 0.06 : 0.4}
                  strokeDasharray={KIND_META[e.kind].dash ? '6 5' : undefined}
                  style={{ display: on ? undefined : 'none' }}
                />
              );
            })}

            {/* 粒子 */}
            {graph.edges.map((e) =>
              Array.from({ length: PARTICLES_PER_EDGE }).map((_, i) => (
                <circle
                  key={`${e.id}:${i}`}
                  ref={(el) => {
                    particleRefs.current[`${e.id}:${i}`] = el;
                  }}
                  r={3}
                  fill={KIND_META[e.kind].color}
                  filter="url(#dfGlow)"
                  style={{
                    display: enabledKinds.has(e.kind) ? undefined : 'none',
                    pointerEvents: 'none',
                  }}
                />
              ))
            )}

            {/* 节点 */}
            {graph.nodes.map((n) => {
              const p = positions[n.id];
              if (!p) return null;
              const color = GROUP_COLOR[n.group];
              const dim = connected ? !connected.has(n.id) : false;
              const calls = metrics?.nodes[n.id]?.calls;
              return (
                <g
                  key={n.id}
                  transform={`translate(${p.x},${p.y})`}
                  style={{ opacity: dim ? 0.2 : 1, cursor: 'grab' }}
                  onPointerDown={(ev) => {
                    const sp = toSvg(ev.clientX, ev.clientY);
                    drag.current = {
                      id: n.id,
                      dx: sp.x - p.x,
                      dy: sp.y - p.y,
                      moved: false,
                    };
                  }}
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (!drag.current?.moved) setSelected(n.id);
                  }}
                >
                  <rect
                    width={W}
                    height={H}
                    rx={10}
                    fill="#ffffff"
                    stroke={color}
                    strokeWidth={1.8}
                  />
                  <rect width={5} height={H} rx={2.5} fill={color} />
                  <text
                    x={14}
                    y={21}
                    style={{ fontSize: 12.5, fontWeight: 600 }}
                    fill="#0f172a"
                  >
                    {n.title}
                  </text>
                  <text x={14} y={37} style={{ fontSize: 10 }} fill="#94a3b8">
                    {n.subtitle}
                  </text>
                  {n.live === true && (
                    <circle cx={W - 12} cy={13} r={4} fill="#10b981">
                      <title>真实运行时在线</title>
                    </circle>
                  )}
                  {typeof calls === 'number' && calls > 0 && (
                    <text
                      x={W - 12}
                      y={H - 8}
                      textAnchor="end"
                      style={{ fontSize: 10, fontWeight: 700 }}
                      fill={color}
                    >
                      {calls}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {/* 图例 */}
        {graph && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white/90 px-4 py-2 text-xs shadow-sm backdrop-blur">
            {(Object.keys(KIND_META) as DataFlowEdgeKind[]).map((k) => {
              const meta = KIND_META[k];
              const off = !enabledKinds.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleKind(k)}
                  className={`flex items-center gap-1.5 ${off ? 'opacity-35' : ''}`}
                >
                  <span
                    className="inline-block h-0 w-5 rounded"
                    style={{
                      borderTop: `3px ${meta.dash ? 'dashed' : 'solid'} ${meta.color}`,
                    }}
                  />
                  <span className="text-gray-600">{meta.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* 详情抽屉 */}
        {selectedNode && (
          <aside className="bg-white/97 absolute right-0 top-0 z-20 h-full w-[330px] overflow-auto border-l border-gray-200 p-4 shadow-[-12px_0_32px_rgba(0,0,0,0.08)]">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 ring-1 ring-gray-200 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
            <h2 className="pr-8 text-base font-semibold text-gray-900">
              {selectedNode.title}
            </h2>
            <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">
              {selectedNode.tag}
            </span>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {selectedNode.live === true && (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
                  运行时在线
                </span>
              )}
              {selectedNode.live === false && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">
                  未注册
                </span>
              )}
              {metrics?.nodes[selectedNode.id] && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700 ring-1 ring-blue-200">
                  {metrics.nodes[selectedNode.id].calls} 次 / {windowHours}h
                  {metrics.nodes[selectedNode.id].avgMs != null
                    ? ` · ${metrics.nodes[selectedNode.id].avgMs}ms`
                    : ''}
                </span>
              )}
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-600">
              {selectedNode.description}
            </p>

            {graph && (
              <FlowList
                node={selectedNode}
                edges={graph.edges}
                nodeById={nodeById}
              />
            )}
          </aside>
        )}
      </div>
    </div>
  );
}

function FlowList({
  node,
  edges,
  nodeById,
}: {
  node: DataFlowNode;
  edges: DataFlowEdge[];
  nodeById: Record<string, DataFlowNode>;
}) {
  const outs = edges.filter((e) => e.from === node.id);
  const ins = edges.filter((e) => e.to === node.id);
  const row = (e: DataFlowEdge, dir: 'out' | 'in') => {
    const other = dir === 'out' ? nodeById[e.to] : nodeById[e.from];
    return (
      <div
        key={e.id}
        className="mb-1.5 rounded-lg bg-gray-50 px-2 py-1.5 text-[12.5px] leading-snug"
        style={{ borderLeft: `3px solid ${KIND_META[e.kind].color}` }}
      >
        <b className="text-gray-900">
          {dir === 'out' ? '→ ' : '← '}
          {other?.title ?? e.to}
        </b>
        <br />
        <span className="text-gray-500">
          {KIND_META[e.kind].label} · {e.label}
        </span>
      </div>
    );
  };
  return (
    <div className="mt-4">
      {outs.length > 0 && (
        <>
          <h3 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            流出（产出 / 触发）
          </h3>
          {outs.map((e) => row(e, 'out'))}
        </>
      )}
      {ins.length > 0 && (
        <>
          <h3 className="mb-1.5 mt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            流入（消费 / 依赖）
          </h3>
          {ins.map((e) => row(e, 'in'))}
        </>
      )}
    </div>
  );
}
