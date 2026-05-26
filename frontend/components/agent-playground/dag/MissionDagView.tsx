'use client';

/**
 * MissionDagView —— 完整 Mission DAG 可视化(自上而下 SVG)。
 *
 * 设计原则(2026-05-26):
 *   - 后端是真源:nodes/edges/status/rerunable/cascade/react 全部从 /dag 接口拿。
 *   - 前端只负责 layout(spine/fan/split 三档简单算法)+ SVG 渲染 + 交互。
 *   - 每节点 hover 出 2 个按钮:↻ 重跑级联预览 / ○ 内部循环(ReAct ring)。
 *   - 点 ↻ → /dag/cascade 染色 + 顶部 bar 给"将级联 N / 保留 M",确认 → localRerunTodo。
 *   - 点 ○ → /dag/react/:nodeId 拉 ReAct 快照,右侧浮出 ring 面板(可关闭)。
 *   - liveSignal prop 变化 → 节流 1s 重拉 /dag(让 WS 事件触发增量刷新)。
 */

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  fetchMissionDag,
  fetchMissionDagCascade,
  fetchMissionDagReact,
  localRerunTodo,
  type MissionDagGraph,
  type MissionDagNode,
  type MissionDagCascadePreview,
  type MissionDagReactSnapshot,
} from '@/services/agent-playground/api';
import { Loader2, AlertCircle, X } from 'lucide-react';
import { EmptyState } from '@/components/ui/states/EmptyState';

interface Props {
  missionId: string;
  /** 点节点(非按钮区域)的回调 → 父级抽屉显示该 agent 详情 */
  onAgentClick?: (nodeId: string) => void;
  /**
   * 父级事件流变化的信号(可传 events.length 之类);本组件检测到变化时节流
   * 1s 重拉 /dag,实现"WS 事件触发增量刷新"而不需要直接订阅 WS。
   */
  liveSignal?: number;
}

interface PositionedNode extends MissionDagNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * 把后端 nodes 按 layout hint 排进容器(以传入 canvasW 为宽度基准,canvasH 自然
 * 增长)。Phase 4 v2 重做(用户反馈"可以上下滚,2 行不够就 3 行"):
 *   - 不再 scale-to-fit;canvas 用容器实测宽度,纵向超出则模态滚动。
 *   - fan 行数自适应:按目标节点宽度算 maxPerRow,rows = ceil(N / maxPerRow),
 *     14 维度在窄容器自动分到 3 行,在宽容器 2 行甚至 1 行。
 *   - 节点 / 间距用自然像素,不缩放,箭头/标签/边距都清晰。
 */
const FAN_TARGET_W = 150; // fan 节点目标宽度
const FAN_MIN_W = 110;
function layoutGraph(
  graph: MissionDagGraph,
  canvasW: number
): { nodes: PositionedNode[]; canvasH: number; canvasW: number } {
  const stepOrder = [
    's1-budget',
    's2-leader-plan',
    's3-researcher-collect',
    's4-leader-assess',
    's5-reconciler',
    's6-analyst',
    's7-writer-outline',
    's8-writer',
    's8b-quality-enhancement',
    's9-critic',
    's9b-objective-eval',
    's10-leader-foreword-signoff',
    's11-persist',
  ];
  const macroH = 44;
  const macroGap = 22;
  const fanH = 52;
  const fanGap = 14;
  const fanRowGap = 18;

  const dimNodes = graph.nodes.filter((n) => n.kind === 'research-dim');
  // 多行 fan 自适应:按容器宽度反算 maxPerRow + rows
  let fanRows = 1;
  let perRowCount = dimNodes.length;
  if (dimNodes.length > 0) {
    const usable = Math.max(200, canvasW - 60);
    const maxPerRow = Math.max(
      1,
      Math.floor((usable + fanGap) / (FAN_TARGET_W + fanGap))
    );
    fanRows = Math.max(1, Math.ceil(dimNodes.length / maxPerRow));
    perRowCount = Math.ceil(dimNodes.length / fanRows);
  }
  const fanReservedH = fanRows * fanH + (fanRows - 1) * fanRowGap + 18;

  const macroSpineY: Record<string, number> = {};
  let cursorY = 18;
  for (const sid of stepOrder) {
    macroSpineY[sid] = cursorY;
    cursorY +=
      sid === 's3-researcher-collect'
        ? macroH + macroGap + fanReservedH
        : macroH + macroGap;
  }
  const canvasH = cursorY + 18;
  const cx = canvasW / 2;
  const positioned: PositionedNode[] = [];

  for (const n of graph.nodes) {
    if (n.kind === 'research-dim') continue;
    const y = macroSpineY[n.id] ?? cursorY;
    let w = 240;
    const h = macroH;
    let x = cx - w / 2;
    if (n.kind === 'writer') {
      w = 220;
      x = cx - w - 36;
    }
    if (
      n.id === 's9-critic' ||
      n.id === 's9b-objective-eval' ||
      n.id === 's8b-quality-enhancement'
    ) {
      w = 220;
      x = cx - w / 2;
    }
    positioned.push({ ...n, x, y, w, h });
  }

  // research-dim 节点:多行 fan,每行匀称居中
  const s3Y = macroSpineY['s3-researcher-collect'] ?? 200;
  const fanStartY = s3Y + macroH + 14;
  const fanW =
    perRowCount === 0
      ? 0
      : Math.max(
          FAN_MIN_W,
          Math.floor((canvasW - 60 - (perRowCount - 1) * fanGap) / perRowCount)
        );
  for (let i = 0; i < dimNodes.length; i++) {
    const row = Math.floor(i / perRowCount);
    const col = i % perRowCount;
    const thisRowCount =
      row === fanRows - 1 ? dimNodes.length - row * perRowCount : perRowCount;
    const thisRowW = thisRowCount * fanW + (thisRowCount - 1) * fanGap;
    const rowStartX = cx - thisRowW / 2;
    const x = rowStartX + col * (fanW + fanGap);
    const y = fanStartY + row * (fanH + fanRowGap);
    positioned.push({ ...dimNodes[i], x, y, w: fanW, h: fanH });
  }

  return { nodes: positioned, canvasH, canvasW };
}

function statusToCls(status: string): string {
  switch (status) {
    case 'done':
      return 'border-emerald-500 bg-white';
    case 'running':
      return 'border-blue-500 bg-blue-50 shadow-[0_0_0_3px_rgb(239_246_255)]';
    case 'failed':
      return 'border-red-500 bg-red-50';
    case 'degraded':
      return 'border-amber-500 bg-amber-50';
    case 'cancelled':
      return 'border-gray-400 bg-gray-50';
    default:
      return 'border-slate-300 bg-white';
  }
}
function dotCls(status: string): string {
  switch (status) {
    case 'done':
      return 'bg-emerald-500';
    case 'running':
      return 'bg-blue-500 animate-pulse';
    case 'failed':
      return 'bg-red-500';
    case 'degraded':
      return 'bg-amber-500';
    case 'cancelled':
      return 'bg-gray-400';
    default:
      return 'bg-slate-300';
  }
}

function bezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  loop: boolean = false
): string {
  if (loop) {
    // self-loop:小弧
    return `M${x1},${y1} C${x1 + 60},${y1 - 10} ${x2 + 60},${y2 + 10} ${x2},${y2}`;
  }
  const dy = y2 - y1;
  const dx = x2 - x1;
  // 主要是垂直,加一点水平偏移
  const c1x = x1 + dx * 0.1;
  const c1y = y1 + dy * 0.5;
  const c2x = x2 - dx * 0.1;
  const c2y = y2 - dy * 0.5;
  return `M${x1},${y1} C${c1x},${c1y} ${c2x},${c2y} ${x2},${y2}`;
}

export function MissionDagView({ missionId, onAgentClick, liveSignal }: Props) {
  const [graph, setGraph] = useState<MissionDagGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFor, setSelectedFor] = useState<{
    node: MissionDagNode;
    preview: MissionDagCascadePreview;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  // Phase 2: ReAct ring 面板
  const [reactSnap, setReactSnap] = useState<{
    node: MissionDagNode;
    snap: MissionDagReactSnapshot | null; // null = loading
  } | null>(null);
  // WS 触发 /dag 重拉的节流 timer
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 加载图
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchMissionDag(missionId)
      .then((g) => {
        if (alive) {
          setGraph(g);
          setLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (alive) {
          setError(e instanceof Error ? e.message : 'load failed');
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [missionId]);

  // Phase 4 v2:用容器实测宽度作为 canvasW(自然布局),不再缩放;高度自然增长,
  // 容器纵向滚动。这样匀称 + 间距清晰 + 箭头视觉不模糊。
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(1080);
  useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setContainerW(r.width);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const { nodes, canvasH, canvasW } = useMemo(() => {
    if (!graph)
      return {
        nodes: [] as PositionedNode[],
        canvasH: 600,
        canvasW: containerW,
      };
    return layoutGraph(graph, containerW);
  }, [graph, containerW]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const onRetry = useCallback(
    async (node: MissionDagNode) => {
      if (!node.rerunable) return;
      try {
        const preview = await fetchMissionDagCascade(missionId, node.id);
        setSelectedFor({ node, preview });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'cascade failed');
      }
    },
    [missionId]
  );

  const clearSel = useCallback(() => setSelectedFor(null), []);

  // Phase 2: 点 ○ → 拉 ReAct 快照 → 弹面板
  const onLoop = useCallback(
    async (node: MissionDagNode) => {
      setReactSnap({ node, snap: null });
      try {
        const snap = await fetchMissionDagReact(missionId, node.id);
        setReactSnap({ node, snap });
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'react snapshot failed');
        setReactSnap(null);
      }
    },
    [missionId]
  );
  const closeReact = useCallback(() => setReactSnap(null), []);

  // WS 增量:liveSignal 变化 → 节流 1s 重拉 /dag
  useEffect(() => {
    if (liveSignal === undefined || !graph) return;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      fetchMissionDag(missionId)
        .then((g) => setGraph(g))
        .catch(() => {
          /* 静默失败 —— 增量刷新不打扰主流程 */
        });
    }, 1000);
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
    // graph 故意不进 deps:防止 setGraph 触发自激
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSignal, missionId]);

  const onConfirmRerun = useCallback(async () => {
    if (!selectedFor) return;
    const { node } = selectedFor;
    const stepId = node.kind === 'research-dim' ? node.parentStepId : node.id;
    if (!stepId) return;
    setBusy(true);
    try {
      await localRerunTodo(missionId, '__mission-dag__', {
        origin: 'mission-dag',
        scope: node.kind === 'research-dim' ? 'dimension' : 'system',
        dimensionRef: node.dimensionRef,
        stepId,
        reasonText: '通过 Mission DAG 触发的级联重跑',
      });
      clearSel();
      // 重新加载图
      const g = await fetchMissionDag(missionId);
      setGraph(g);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'rerun failed');
    } finally {
      setBusy(false);
    }
  }, [missionId, selectedFor, clearSel]);

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center text-gray-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        加载 Mission DAG…
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <div className="font-semibold">加载失败</div>
          <div className="font-mono mt-1 text-xs">{error}</div>
        </div>
      </div>
    );
  }
  if (!graph || graph.nodes.length === 0) {
    return <EmptyState title="尚无 DAG 数据" />;
  }

  // 计算 cascade 集合
  const sel = selectedFor;
  const willSet = sel ? new Set(sel.preview.willRerun) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* 顶部 action bar：选中节点时显示 cascade summary */}
      {sel && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm">
          <span className="font-bold text-amber-700">↻</span>
          <span>
            重跑 <b>{sel.node.label}</b>
            {sel.node.sub ? ` · ${sel.node.sub}` : ''}
          </span>
          <span className="text-gray-500">→</span>
          {sel.preview.rerunable ? (
            <span>
              <b className="text-amber-700">
                级联 {sel.preview.willRerun.length} 个下游
              </b>
              <span className="text-gray-500">
                ，其余 {sel.preview.kept.length} 个保留
              </span>
            </span>
          ) : (
            <span className="text-red-600">
              {sel.preview.reason ?? '不允许重跑'}
            </span>
          )}
          <span className="ml-auto flex gap-2">
            {sel.preview.rerunable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onConfirmRerun()}
                className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {busy ? '触发中…' : '确认重跑'}
              </button>
            )}
            <button
              type="button"
              onClick={clearSel}
              className="rounded-lg bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200"
            >
              取消
            </button>
          </span>
        </div>
      )}

      {/* Canvas + 可选 ReAct 侧栏(并排布局)。canvas 用容器实测宽自然布局,
          高度自然增长 → 容器 overflow-y-auto 上下滚;横向永不滚。 */}
      <div className="flex gap-3" style={{ height: 'calc(85vh - 130px)' }}>
        <div
          ref={canvasContainerRef}
          className="relative h-full flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-200 bg-gray-50/30"
        >
          <div
            style={{
              position: 'relative',
              width: canvasW,
              height: canvasH,
            }}
          >
            <svg
              width={canvasW}
              height={canvasH}
              className="block"
              style={{ overflow: 'visible' }}
            >
              <defs>
                <marker
                  id="dag-arrow"
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 Z" fill="#64748b" />
                </marker>
                <marker
                  id="dag-arrow-amber"
                  markerWidth="12"
                  markerHeight="12"
                  refX="10"
                  refY="5"
                  orient="auto"
                >
                  <path d="M0,0 L10,5 L0,10 Z" fill="#f59e0b" />
                </marker>
              </defs>
              {graph.edges.map((e, i) => {
                const a = nodeMap.get(e.from);
                const b = nodeMap.get(e.to);
                if (!a || !b) return null;
                const x1 = a.x + a.w / 2;
                const y1 = a.y + a.h;
                const x2 = b.x + b.w / 2;
                const y2 = b.y;
                const isImpact =
                  !!sel &&
                  (sel.node.id === e.from || willSet?.has(e.from)) &&
                  willSet?.has(e.to);
                const dim = !!sel && !isImpact;
                const isLoop = e.kind === 'rewrite-loop';
                const isSelf = e.kind === 'self-loop';
                return (
                  <path
                    key={i}
                    d={bezierPath(x1, y1, x2, y2, isSelf)}
                    fill="none"
                    stroke={
                      isImpact ? '#f59e0b' : isLoop ? '#f59e0b' : '#64748b'
                    }
                    strokeWidth={isImpact ? 3 : 2.2}
                    strokeDasharray={
                      isLoop || isSelf ? '6 5' : isImpact ? '7 6' : undefined
                    }
                    opacity={dim ? 0.15 : 1}
                    markerEnd={
                      isImpact ? 'url(#dag-arrow-amber)' : 'url(#dag-arrow)'
                    }
                  />
                );
              })}
            </svg>
            {/* 节点用 div 叠在 svg 上(更好做 hover/按钮) */}
            {nodes.map((n) => {
              const isSel = sel?.node.id === n.id;
              const isWill = willSet?.has(n.id);
              const isKept = !!sel && !isSel && !isWill;
              const cls = isSel
                ? 'border-amber-500 ring-4 ring-amber-100 shadow-md'
                : isWill
                  ? 'border-amber-400 border-dashed bg-amber-50'
                  : statusToCls(n.status);
              return (
                <div
                  key={n.id}
                  className={`group absolute rounded-xl border-2 px-2.5 py-1 transition-all ${cls} ${
                    isKept ? 'opacity-40 grayscale' : ''
                  }`}
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
                  onClick={() => onAgentClick?.(n.id)}
                >
                  {/* 左上 status dot */}
                  <span
                    className={`absolute left-1.5 top-1.5 h-2 w-2 rounded-full ${dotCls(n.status)}`}
                  />
                  {/* 右上 iter badge(running 才显示) */}
                  {n.iter != null && (
                    <span className="font-mono absolute right-7 top-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-blue-700">
                      ↻{n.iter}
                    </span>
                  )}
                  {/* Phase 3.2: 右下 score chip(reviewer/签收 类节点) */}
                  {n.score != null && (
                    <span
                      className={`font-mono absolute -bottom-2 right-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                        n.score >= 80
                          ? 'bg-emerald-500 text-white'
                          : n.score >= 65
                            ? 'bg-amber-500 text-white'
                            : 'bg-red-500 text-white'
                      }`}
                    >
                      {n.score}
                    </span>
                  )}
                  {/* 节点 label */}
                  <div className="text-center text-[13px] font-bold leading-tight">
                    {n.label}
                  </div>
                  {n.sub && (
                    <div className="truncate text-center text-[10.5px] leading-tight text-gray-500">
                      {n.sub}
                    </div>
                  )}

                  {/* hover 2 按钮：↻ 重跑预览 + ○ 内部循环(P2) */}
                  <div className="pointer-events-none absolute -right-3 -top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                    <button
                      type="button"
                      disabled={!n.rerunable || busy}
                      title={
                        n.rerunable
                          ? '预览重跑影响链路'
                          : (n.rerunableReason ?? '不可重跑')
                      }
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void onRetry(n);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-amber-500 bg-white text-[13px] font-bold text-amber-600 shadow-md hover:scale-110 disabled:cursor-not-allowed disabled:border-gray-300 disabled:text-gray-400"
                    >
                      ↻
                    </button>
                    <button
                      type="button"
                      title="展开 ReAct 内部循环"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        void onLoop(n);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-[13px] font-bold text-blue-600 shadow-md hover:scale-110"
                    >
                      ○
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Phase 4 收口: ReAct 面板做成侧栏(出现时占 320px),canvas 自动收窄+
          scale 重算,不再浮在 DAG 上盖内容。 */}
        {reactSnap && (
          <div className="h-full w-[340px] shrink-0">
            <ReactRingPanel
              missionId={missionId}
              node={reactSnap.node}
              snap={reactSnap.snap}
              liveSignal={liveSignal}
              onSnap={(s) =>
                setReactSnap((prev) =>
                  prev && prev.node.id === reactSnap.node.id
                    ? { node: prev.node, snap: s }
                    : prev
                )
              }
              onClose={closeReact}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// ReAct ring 面板(简化版,展示 think/tool/observe 循环 + finalize)
// ──────────────────────────────────────────────────────────────

function ReactRingPanel({
  missionId,
  node,
  snap,
  liveSignal,
  onSnap,
  onClose,
}: {
  missionId: string;
  node: MissionDagNode;
  snap: MissionDagReactSnapshot | null;
  liveSignal?: number;
  /** 内部静默 refetch 成功时把最新快照交回父级,父级用同 nodeId 替换 state */
  onSnap?: (s: MissionDagReactSnapshot) => void;
  onClose: () => void;
}) {
  // Phase 3.3: liveSignal 变化 → 节流 800ms 重拉同节点 react 快照(面板期间)
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (liveSignal === undefined || !snap) return;
    // 已结束/失败的节点不再刷(免无谓请求)
    if (snap.phase === 'completed' || snap.phase === 'failed') return;
    if (refetchTimer.current) clearTimeout(refetchTimer.current);
    refetchTimer.current = setTimeout(() => {
      fetchMissionDagReact(missionId, node.id)
        .then((s) => onSnap?.(s))
        .catch(() => {
          /* 静默 */
        });
    }, 800);
    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
    };
    // 故意省 snap/onSnap 依赖防止自激刷新
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSignal, missionId, node.id]);

  const cur = snap?.currentStep ?? 'idle';
  const ringNodes = [
    { key: 'thinking', label: '思考', x: 145, y: 28 },
    { key: 'tool', label: '工具', x: 246, y: 168 },
    { key: 'observing', label: '观察', x: 44, y: 168 },
  ] as const;
  const isCur = (k: string) =>
    cur === k || (k === 'tool' && cur === 'finalizing'); // finalize 也显在工具点

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">
            节点内部 · ReAct 循环
          </h3>
          <div className="mt-0.5 text-[11.5px] text-gray-500">
            {node.label}
            {snap?.dimension
              ? ` · ${snap.dimension}`
              : node.sub
                ? ` · ${node.sub}`
                : ''}
          </div>
          <div className="font-mono mt-0.5 text-[10.5px] text-gray-400">
            {snap?.role ?? node.kind} · iter {snap?.iter ?? '—'}
            {snap?.maxIter ? `/${snap.maxIter}` : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {snap?.note && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {snap.note}
        </div>
      )}

      {!snap && (
        <div className="mt-6 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" /> 拉取 ReAct 状态…
        </div>
      )}

      {snap && !snap.note && (
        <>
          {/* 环可视化 */}
          <div className="relative mx-auto mt-3 h-[200px] w-[290px]">
            <svg width="290" height="200" className="overflow-visible">
              {/* 三段曲线弧形成环 */}
              {[
                [ringNodes[0], ringNodes[1]],
                [ringNodes[1], ringNodes[2]],
                [ringNodes[2], ringNodes[0]],
              ].map(([a, b], i) => {
                const mx = (a.x + b.x) / 2;
                const my = (a.y + b.y) / 2;
                // bow 向中心外凸
                const cx = 145;
                const cy = 110;
                const ox = mx + (mx - cx) * 0.3;
                const oy = my + (my - cy) * 0.3;
                return (
                  <path
                    key={i}
                    d={`M${a.x + 32},${a.y + 16} Q${ox},${oy} ${b.x},${b.y + 8}`}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="1.6"
                    strokeDasharray="5 5"
                  />
                );
              })}
            </svg>
            {ringNodes.map((rn) => {
              const active = isCur(rn.key);
              return (
                <div
                  key={rn.key}
                  className={`absolute flex h-10 w-[78px] items-center justify-center rounded-full border-2 text-[12px] font-semibold ${
                    active
                      ? 'border-blue-500 bg-blue-100 text-blue-700 shadow-md'
                      : 'border-blue-300 bg-blue-50 text-blue-600'
                  }`}
                  style={{ left: rn.x, top: rn.y }}
                >
                  {rn.label}
                </div>
              );
            })}
            {/* 中心 spinner */}
            <div
              className={`absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-slate-300 ${
                cur !== 'idle' && cur !== 'completed' && cur !== 'failed'
                  ? 'animate-spin'
                  : ''
              }`}
              style={{ animationDuration: '3s' }}
            />
          </div>

          {/* finalize 状态 */}
          <div className="mx-auto mt-1 inline-flex w-fit items-center gap-2 self-center rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-1 text-[12px] font-semibold text-emerald-700">
            finalize{' '}
            {snap.finalizeAttempts > 0 && (
              <span className="text-amber-600">
                · 被拒 {snap.finalizeAttempts}/3 ↻
              </span>
            )}
          </div>

          {/* 详情字段 */}
          <div className="mt-4 space-y-2 text-[12px] leading-relaxed">
            {snap.lastThought && (
              <div>
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  最近思考
                </span>
                <div className="mt-0.5 text-gray-700">{snap.lastThought}</div>
              </div>
            )}
            {snap.lastAction && (
              <div>
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  最近动作
                </span>
                <div className="font-mono mt-0.5 text-gray-700">
                  {snap.lastAction.kind}
                  {snap.lastAction.toolName
                    ? ` · ${snap.lastAction.toolName}`
                    : ''}
                </div>
              </div>
            )}
            {snap.lastObservation && (
              <div>
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">
                  最近观察
                </span>
                <div className="font-mono mt-0.5 text-gray-700">
                  {snap.lastObservation.kind}
                </div>
              </div>
            )}
            {snap.lastError && (
              <div className="font-mono rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">
                ⚠ {snap.lastError}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default MissionDagView;
