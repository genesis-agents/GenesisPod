'use client';

/**
 * Run List Page — 一个 topic 下所有 Agent 过程（=run）的整页详情视图。
 *
 * 信息架构（对标 agent-playground/team/[missionId] 整页布局）：
 *   Header        : ← back / topic name / 概要 + 操作（重跑 / 取消）
 *   Left summary  : 本主题概览 + 数据源健康度 + 配置摘要（topic 维度，不依赖单 run）
 *   Right tabs    : 运行列表（每行=1次完整 Agent 过程） / 错误聚合 / 指标汇总
 *
 * 点击表格行 → 弹 RunDetailDrawer 看该 run 的 stage 流程 / metrics / 错误。
 *
 * URL {runId} 语义：drawer 默认聚焦那次 run。
 *   - 直接深链 /runs/{runId} 进入时自动开 drawer。
 *   - 点击其他行 router.replace 到对应 runId，drawer 切换。
 *   - 关闭 drawer 不改 URL（避免 back 栈被污染）；用 ← 返回 topic 页。
 *
 * 进入路径：topic 详情页「查看详情」按钮 → router.push(`/runs/{latestRunId}`)。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Clock,
  Database,
  ListChecks,
  Loader2,
  RefreshCw,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import {
  cancelRun,
  getRun,
  getTopic,
  listRuns,
  listSources,
  triggerRefresh,
} from '@/services/ai-radar/api';
import type {
  RadarRun,
  RadarSource,
  RadarTopicWithCounts,
} from '@/services/ai-radar/types';
import { useRadarSocket } from '@/hooks/domain/useRadarSocket';
import { RunDetailDrawer } from '@/components/ai-radar/RunDetailDrawer';
import {
  formatDateTime,
  formatDuration,
  statusBadgeClass,
  statusLabel,
  triggerLabel,
} from '@/components/ai-radar/run-helpers';

// ──────────────────────────────────────────────────────────────────────
// Tabs
// ──────────────────────────────────────────────────────────────────────

type TabKey = 'tasks' | 'errors' | 'metrics';
const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
  { key: 'tasks', label: '运行列表', Icon: ListChecks },
  { key: 'errors', label: '错误日志', Icon: AlertCircle },
  { key: 'metrics', label: '指标汇总', Icon: Database },
];

// ──────────────────────────────────────────────────────────────────────
// Page
// ──────────────────────────────────────────────────────────────────────

export default function RadarRunsPage() {
  const params = useParams<{ topicId: string; runId: string }>();
  const router = useRouter();
  const topicId = params?.topicId;
  const runId = params?.runId;

  const [topic, setTopic] = useState<RadarTopicWithCounts | null>(null);
  const [runs, setRuns] = useState<RadarRun[]>([]);
  const [sources, setSources] = useState<RadarSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('tasks');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [stageStatus, setStageStatus] = useState<{
    stage: string;
    status: string;
  } | null>(null);
  const [rerunning, setRerunning] = useState(false);
  // 深链 fallback —— listRuns 只取最近 50 条，若 URL runId 落在 51+ 历史里，
  // 单独 GET /runs/:runId 拿到 RadarRow，用 fallbackRun 兜底（避免 drawer 空白）。
  const [fallbackRun, setFallbackRun] = useState<RadarRun | null>(null);

  const focusRun = useMemo(
    () =>
      runs.find((r) => r.id === runId) ??
      (fallbackRun?.id === runId ? fallbackRun : null),
    [runs, runId, fallbackRun]
  );
  const runningRun = useMemo(
    () => runs.find((r) => r.status === 'running') ?? null,
    [runs]
  );
  const activeRunId = runningRun?.id ?? null;

  // 订阅 running run 的 stage 进度（与是否聚焦无关 —— 表格进度条需要实时）
  useRadarSocket(activeRunId, {
    onStage: (e) => setStageStatus({ stage: e.stage, status: e.status }),
    onCompleted: () => {
      setStageStatus(null);
      void reload();
    },
    onFailed: () => {
      setStageStatus(null);
      void reload();
    },
    onCancelled: () => {
      setStageStatus(null);
      void reload();
    },
  });

  const reload = useCallback(async () => {
    if (!topicId) return;
    setLoading(true);
    setErr(null);
    try {
      const [t, rs, ss] = await Promise.all([
        getTopic(topicId),
        listRuns(topicId, 50),
        listSources(topicId),
      ]);
      setTopic(t);
      setRuns(rs);
      setSources(ss);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 切到新 URL → drawer 跟着 reopen（深链 / 点其他行场景）
  useEffect(() => {
    if (runId) setDrawerOpen(true);
  }, [runId]);

  // 深链 fallback —— listRuns(50) 找不到 URL 里的 runId 时单独 GET 取一份
  useEffect(() => {
    if (loading || !runId) return;
    if (runs.some((r) => r.id === runId)) return; // 已在列表里
    if (fallbackRun?.id === runId) return; // 已经 fallback 过
    let cancelled = false;
    getRun(runId)
      .then((r) => {
        if (!cancelled) setFallbackRun(r);
      })
      .catch((e: unknown) => {
        // 404 / 越权 → 给用户明确反馈（R5 review: 不静默吞错）。
        // 主页面 RunsTable 仍可见，drawer 因 focusRun=null 自动收起。
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErr(`无法加载该运行 ${runId.slice(0, 8)} 的详情：${msg}`);
      });
    return () => {
      cancelled = true;
    };
  }, [runId, runs, loading, fallbackRun?.id]);

  const handleRerun = async () => {
    if (!topicId || rerunning || runningRun) return;
    setRerunning(true);
    try {
      const resp = await triggerRefresh(topicId);
      // R5 review: reload 先于 router.replace —— 否则 URL 切到新 runId 时 runs
      // state 还没装载，focusRun 暂时为 null、drawer 空白一闪。
      await reload();
      router.replace(`/ai-radar/topic/${topicId}/runs/${resp.runId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRerunning(false);
    }
  };

  const handleCancel = async () => {
    if (!runningRun) return;
    try {
      await cancelRun(runningRun.id);
      await reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!topicId || !runId) return null;

  if (loading && !topic) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="h-12 w-64 animate-pulse rounded bg-gray-100" />
      </div>
    );
  }

  if (err && !topic) {
    return (
      <div className="mx-auto max-w-7xl p-6">
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          加载失败：{err}
        </div>
      </div>
    );
  }

  if (!topic) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6">
      {/* Back link */}
      <button
        type="button"
        onClick={() => router.push(`/ai-radar/topic/${topicId}`)}
        className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        返回 {topic.name}
      </button>

      {/* Header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 md:text-2xl">
              {topic.name} · 运行历史
            </h1>
            {runningRun && (
              <span className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                <Loader2 className="h-3 w-3 animate-spin" />
                有运行中
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-500">
            共 {runs.length} 次运行
            {focusRun && (
              <>
                {' · 当前聚焦 '}
                <span className="font-mono">{focusRun.id.slice(0, 8)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runningRun && (
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <XCircle className="h-4 w-4" />
              取消运行
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleRerun()}
            disabled={rerunning || !!runningRun}
            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw
              className={`h-4 w-4 ${rerunning ? 'animate-spin' : ''}`}
            />
            重新精选
          </button>
        </div>
      </header>

      {err && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {err}
        </div>
      )}

      {/* Main: left topic summary + right tabs */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        <aside className="flex flex-col gap-4">
          <OverviewCard runs={runs} sources={sources} />
          <SourcesCard sources={sources} />
        </aside>

        <section className="min-w-0">
          {/* Tabs bar */}
          <div className="mb-3 flex items-center gap-1 border-b border-gray-200">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors ${
                  tab === t.key
                    ? 'border-violet-600 font-medium text-violet-700'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                <t.Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'tasks' && (
            <RunsTable
              runs={runs}
              focusedRunId={runId}
              activeRunId={activeRunId}
              currentStage={stageStatus?.stage ?? null}
              onSelect={(r) => {
                router.replace(`/ai-radar/topic/${topicId}/runs/${r.id}`);
                setDrawerOpen(true);
              }}
            />
          )}
          {tab === 'errors' && <ErrorsTab runs={runs} />}
          {tab === 'metrics' && <MetricsTab runs={runs} />}
        </section>
      </div>

      {/* Drawer — 单 run 详情，点行打开 */}
      <RunDetailDrawer
        run={drawerOpen ? focusRun : null}
        currentStage={
          focusRun?.id === activeRunId ? (stageStatus?.stage ?? null) : null
        }
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Left: overview card — 跨 run 累计 + 最近一次成功时间
// ──────────────────────────────────────────────────────────────────────

function OverviewCard({
  runs,
  sources,
}: {
  runs: RadarRun[];
  sources: RadarSource[];
}) {
  const completed = runs.filter((r) => r.status === 'completed');
  const failed = runs.filter((r) => r.status === 'failed').length;
  const totalInserted = runs.reduce(
    (s, r) => s + (r.metrics?.itemsInserted ?? 0),
    0
  );
  const lastSuccess = completed.length > 0 ? completed[0].completedAt : null;

  const items: { label: string; value: string }[] = [
    { label: '总运行', value: String(runs.length) },
    { label: '成功', value: String(completed.length) },
    { label: '失败', value: String(failed) },
    { label: '累计入库', value: String(totalInserted) },
    { label: '数据源', value: String(sources.length) },
    { label: '最近成功', value: formatDateTime(lastSuccess) },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">本主题概览</h3>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex flex-col gap-0.5 border-b border-gray-50 pb-1.5 last:border-b-0"
          >
            <dt className="text-[11px] text-gray-500">{it.label}</dt>
            <dd className="font-medium text-gray-900">{it.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Left: sources health card
// ──────────────────────────────────────────────────────────────────────

function SourcesCard({ sources }: { sources: RadarSource[] }) {
  const stats = sources.reduce(
    (acc, s) => {
      if (s.health === 'HEALTHY') acc.ok += 1;
      else if (s.health === 'DEGRADED') acc.degraded += 1;
      else if (s.health === 'FAILING') acc.down += 1;
      else acc.unknown += 1;
      return acc;
    },
    { ok: 0, degraded: 0, down: 0, unknown: 0 }
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-800">数据源健康度</h3>
      {sources.length === 0 ? (
        <p className="text-sm text-gray-400">尚未添加数据源</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <HealthBadge color="emerald" label="正常" count={stats.ok} />
            {stats.degraded > 0 && (
              <HealthBadge color="amber" label="降级" count={stats.degraded} />
            )}
            {stats.down > 0 && (
              <HealthBadge color="red" label="故障" count={stats.down} />
            )}
            {stats.unknown > 0 && (
              <HealthBadge color="gray" label="待采集" count={stats.unknown} />
            )}
          </div>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-gray-600">
            {sources.slice(0, 8).map((s) => {
              const dot =
                s.health === 'HEALTHY'
                  ? 'bg-emerald-500'
                  : s.health === 'DEGRADED'
                    ? 'bg-amber-500'
                    : s.health === 'FAILING'
                      ? 'bg-red-500'
                      : 'bg-gray-300';
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2 truncate"
                  title={s.lastError ?? `health: ${s.health}`}
                >
                  <span
                    className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${dot}`}
                  />
                  <span className="truncate text-xs">
                    {s.label ?? s.identifier}
                  </span>
                </li>
              );
            })}
            {sources.length > 8 && (
              <li className="text-xs text-gray-400">
                + {sources.length - 8} 个
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}

function HealthBadge({
  color,
  label,
  count,
}: {
  color: 'emerald' | 'amber' | 'red' | 'gray';
  label: string;
  count: number;
}) {
  const dotCls =
    color === 'emerald'
      ? 'bg-emerald-500'
      : color === 'amber'
        ? 'bg-amber-500'
        : color === 'red'
          ? 'bg-red-500'
          : 'bg-gray-300';
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-700">
      <span className={`inline-block h-2 w-2 rounded-full ${dotCls}`} />
      {label} {count}
    </span>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Right tab: runs table — each row = 1 完整 Agent 过程
// ──────────────────────────────────────────────────────────────────────

function RunsTable({
  runs,
  focusedRunId,
  activeRunId,
  currentStage,
  onSelect,
}: {
  runs: RadarRun[];
  focusedRunId: string;
  activeRunId: string | null;
  currentStage: string | null;
  onSelect: (r: RadarRun) => void;
}) {
  if (runs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        还没有运行记录。点击右上角「重新精选」启动一次。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full table-fixed">
        <thead className="border-b border-gray-200 bg-gray-50/80">
          <tr>
            <th className="w-10 px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
              #
            </th>
            <th className="w-[34%] px-3 py-2.5 text-left text-xs font-semibold text-gray-600">
              Agent 过程
            </th>
            <th className="w-[12%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
              触发
            </th>
            <th className="w-[22%] px-2 py-2.5 text-left text-xs font-semibold text-gray-600">
              进度
            </th>
            <th className="w-[10%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
              入库
            </th>
            <th className="w-[12%] px-2 py-2.5 text-center text-xs font-semibold text-gray-600">
              状态
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {runs.map((r, idx) => {
            const isFocused = r.id === focusedRunId;
            const stage = r.id === activeRunId ? currentStage : null;
            const lastDone = r.lastCompletedStage ?? 0;
            // R5 review: completed run 无 lastCompletedStage（老历史 run 字段缺失）
            // 时 progress=0，进度条显示 "0/8 阶段" 与状态"已完成"自相矛盾。
            const progress =
              r.status === 'completed' ? 8 : Math.min(8, Math.max(0, lastDone));
            const rowCls = [
              'cursor-pointer transition-colors hover:bg-violet-50/40',
              r.status === 'running'
                ? 'border-l-4 border-l-violet-500 bg-violet-50/30'
                : r.status === 'completed'
                  ? 'border-l-4 border-l-emerald-400'
                  : r.status === 'failed'
                    ? 'border-l-4 border-l-red-400 bg-red-50/20'
                    : r.status === 'cancelled' || r.status === 'rejected'
                      ? 'border-l-4 border-l-slate-300 opacity-75'
                      : 'border-l-4 border-l-transparent',
              isFocused && 'ring-2 ring-inset ring-violet-400',
            ]
              .filter(Boolean)
              .join(' ');
            const titleLabel =
              runs.length - idx === 1
                ? '首次精选'
                : `第 ${runs.length - idx} 次精选`;
            return (
              <tr
                key={r.id}
                role="button"
                tabIndex={0}
                aria-label={`查看 ${titleLabel} 详情`}
                onClick={() => onSelect(r)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(r);
                  }
                }}
                className={rowCls}
              >
                <td className="px-2 py-2 text-center text-xs text-gray-500">
                  {runs.length - idx}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {r.status === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-violet-500" />
                    ) : r.status === 'completed' ? (
                      <Check className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                    ) : r.status === 'failed' ? (
                      <X className="h-3.5 w-3.5 flex-shrink-0 text-red-500" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-1 text-sm font-medium text-gray-900">
                        {titleLabel}
                      </div>
                      <p className="text-[11px] text-gray-500">
                        {formatDateTime(r.startedAt)}
                        {' · '}
                        <span className="font-mono">{r.id.slice(0, 8)}</span>
                        {r.durationMs != null && (
                          <>
                            {' · '}
                            {formatDuration(r.durationMs)}
                          </>
                        )}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-2 py-2">
                  <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                    {triggerLabel(r.trigger)}
                  </span>
                </td>
                <td className="px-2 py-2">
                  <ProgressBar
                    progress={progress}
                    running={r.status === 'running'}
                    stage={stage}
                  />
                </td>
                <td className="px-2 py-2 text-center text-sm font-medium text-gray-800">
                  {r.metrics?.itemsInserted ?? 0}
                </td>
                <td className="px-2 py-2 text-center">
                  <span
                    className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadgeClass(r.status)}`}
                  >
                    {statusLabel(r.status)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProgressBar({
  progress,
  running,
  stage,
}: {
  progress: number;
  running: boolean;
  stage: string | null;
}) {
  const pct = Math.round((progress / 8) * 100);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full transition-all ${running ? 'bg-violet-500' : 'bg-emerald-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10.5px] text-gray-500">
        {running && stage ? stage : `${progress}/8 阶段`}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Right tab: errors aggregate
// ──────────────────────────────────────────────────────────────────────

function ErrorsTab({ runs }: { runs: RadarRun[] }) {
  const failed = runs.filter((r) => r.status === 'failed' && r.error);
  const allSourceErrors = runs.flatMap((r) =>
    (r.metrics?.sourceErrors ?? []).map((e) => ({
      runId: r.id,
      runStarted: r.startedAt,
      ...e,
    }))
  );
  if (failed.length === 0 && allSourceErrors.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
        所有运行均无错误。
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {failed.length > 0 && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-red-800">
            Mission 失败（{failed.length} 次）
          </h3>
          <ul className="flex flex-col gap-2">
            {failed.map((r) => (
              <li
                key={r.id}
                className="rounded border border-red-100 bg-white p-2 text-xs"
              >
                <div className="text-red-700">
                  <span className="font-mono">{r.id.slice(0, 8)}</span>
                  {' · '}
                  {formatDateTime(r.startedAt)}
                </div>
                <p className="mt-1 leading-relaxed text-red-800">{r.error}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      {allSourceErrors.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="mb-2 text-sm font-semibold text-amber-800">
            源级错误（{allSourceErrors.length} 个）
          </h3>
          <ul className="flex flex-col gap-1.5">
            {allSourceErrors.slice(0, 30).map((e, i) => (
              <li
                key={`${e.runId}-${e.sourceId}-${i}`}
                className="text-xs text-amber-700"
              >
                <span className="font-mono">{e.sourceId.slice(0, 8)}</span>
                {' · run '}
                <span className="font-mono">{e.runId.slice(0, 8)}</span>
                {' — '}
                {e.error}
              </li>
            ))}
            {allSourceErrors.length > 30 && (
              <li className="text-xs text-amber-600">
                …还有 {allSourceErrors.length - 30} 个
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Right tab: metrics aggregate across all runs
// ──────────────────────────────────────────────────────────────────────

function MetricsTab({ runs }: { runs: RadarRun[] }) {
  const completed = runs.filter((r) => r.status === 'completed').length;
  const failed = runs.filter((r) => r.status === 'failed').length;
  const totalInserted = runs.reduce(
    (s, r) => s + (r.metrics?.itemsInserted ?? 0),
    0
  );
  const totalFetched = runs.reduce(
    (s, r) => s + (r.metrics?.itemsFetched ?? 0),
    0
  );
  const totalDeduped = runs.reduce(
    (s, r) => s + (r.metrics?.itemsDeduped ?? 0),
    0
  );
  const totalFailedSources = runs.reduce(
    (s, r) => s + (r.metrics?.sourcesFailed ?? 0),
    0
  );
  const durRuns = runs.filter((r) => r.durationMs != null);
  const avgDuration =
    durRuns.length === 0
      ? null
      : Math.round(
          durRuns.reduce((s, r) => s + (r.durationMs ?? 0), 0) / durRuns.length
        );

  const stats: { label: string; value: string }[] = [
    { label: '总运行次数', value: String(runs.length) },
    { label: '成功', value: String(completed) },
    { label: '失败', value: String(failed) },
    { label: '累计抓取', value: String(totalFetched) },
    { label: '累计去重后', value: String(totalDeduped) },
    { label: '累计入库', value: String(totalInserted) },
    { label: '累计失败源', value: String(totalFailedSources) },
    { label: '平均耗时', value: formatDuration(avgDuration) },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-xl border border-gray-200 bg-white p-3"
        >
          <div className="text-xs text-gray-500">{s.label}</div>
          <div className="mt-1 text-xl font-semibold text-gray-900">
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
