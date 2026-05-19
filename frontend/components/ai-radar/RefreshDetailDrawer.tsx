'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import { listRuns } from '@/services/ai-radar/api';
import type { RadarRun } from '@/services/ai-radar/types';

/**
 * RefreshDetailDrawer —— mission 进度可视化抽屉（Playground 风格）
 *
 * 痛点（Screenshot_5/6）：
 * 1. 离页/点其他按钮，stepper 消失 —— 由 topic 页 mount 时 listRuns 主动 resume
 *    （本组件配套实现 listRecent + 选择最新 mission 显示）
 * 2. 无法展开看 stage 详情 —— drawer 内列 5 stage status + 累计 metrics
 * 3. 期望 Playground 任务列表样式 —— stage 行布局参考 MissionTodoBoard
 */

interface StageMeta {
  id: string;
  label: string;
  /** mission stage 名前缀匹配 */
  stages: ReadonlyArray<string>;
  /** stage 在 mission lifecycle 中的编号（1-8）—— last_completed_stage 比对用 */
  stageNumStart: number;
  stageNumEnd: number;
}

export const STAGE_GROUPS: ReadonlyArray<StageMeta> = [
  {
    id: 'collect',
    label: '采集源数据',
    stages: ['s1-source-resolve', 's2-collect'],
    stageNumStart: 1,
    stageNumEnd: 2,
  },
  {
    id: 'dedupe',
    label: '去重',
    stages: ['s3-dedupe'],
    stageNumStart: 3,
    stageNumEnd: 3,
  },
  {
    id: 'score',
    label: '评分（相关性 + 质量）',
    stages: ['s4-relevance', 's5-quality'],
    stageNumStart: 4,
    stageNumEnd: 5,
  },
  {
    id: 'enrich',
    label: '实体抽取 + 洞察',
    stages: ['s6-entity', 's7-insight'],
    stageNumStart: 6,
    stageNumEnd: 7,
  },
  {
    id: 'finalize',
    label: '生成精选 + 持久化',
    stages: ['s8-persist'],
    stageNumStart: 8,
    stageNumEnd: 8,
  },
];

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}分${Math.floor((ms % 60_000) / 1000)}秒`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  // 避免 toLocaleString —— SSR/CSR hydration 差异
  // 输出格式：MM-DD HH:mm
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function statusLabel(status: RadarRun['status']): string {
  switch (status) {
    case 'running':
      return '运行中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    case 'cancelled':
      return '已取消';
    case 'rejected':
      return '已拒绝';
    default:
      return status;
  }
}

function statusBadgeClass(status: RadarRun['status']): string {
  switch (status) {
    case 'running':
      return 'bg-violet-100 text-violet-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'failed':
      return 'bg-red-100 text-red-700';
    case 'cancelled':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

/**
 * 判断某 stage group 在 run 里的状态：
 *   - run.status='running' + currentStage 落在该 group 内 → running
 *   - run.lastCompletedStage >= stageNumEnd → completed
 *   - run.status='failed' 且 lastCompletedStage 没达 group → failed (on this group)
 *   - 否则 pending
 */
function stageGroupStatus(
  run: RadarRun & { lastCompletedStage?: number | null },
  group: StageMeta,
  currentStage: string | null
): 'completed' | 'running' | 'failed' | 'pending' {
  const lastDone = run.lastCompletedStage ?? 0;
  if (lastDone >= group.stageNumEnd) return 'completed';
  if (run.status === 'failed' && lastDone < group.stageNumStart) {
    // 失败时只有"正在跑的那一组"标失败，后续 pending
    if (
      lastDone + 1 >= group.stageNumStart &&
      lastDone + 1 <= group.stageNumEnd
    )
      return 'failed';
    return 'pending';
  }
  if (run.status === 'running' && currentStage) {
    if (group.stages.some((s) => currentStage.startsWith(s))) return 'running';
  }
  // running 但 currentStage 没匹配：可能已超过这组（被 lastCompletedStage 兜底）
  if (run.status === 'running' && lastDone >= group.stageNumStart - 1) {
    // group 已开始但未完
    if (lastDone < group.stageNumEnd && lastDone + 1 >= group.stageNumStart)
      return 'running';
  }
  return 'pending';
}

interface RefreshDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  topicId: string;
  /** 当前正在 WS 订阅的 mission（来自 useRadarSocket）—— 用来标定 currentStage */
  activeRunId: string | null;
  currentStage: string | null;
}

export function RefreshDetailDrawer({
  open,
  onClose,
  topicId,
  activeRunId,
  currentStage,
}: RefreshDetailDrawerProps) {
  const [runs, setRuns] = useState<RadarRun[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // 加载最近 10 条 run（含 metadata / status / metrics）
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr(null);
    listRuns(topicId, 10)
      .then((rs) => {
        setRuns(rs);
        // 默认选中 active 或最新一条
        setSelectedRunId(activeRunId ?? rs[0]?.id ?? null);
      })
      .catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, topicId, activeRunId]);

  const selectedRun = useMemo(
    () => runs.find((r) => r.id === selectedRunId) ?? null,
    [runs, selectedRunId]
  );

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="精选过程详情"
      widthPx={560}
    >
      <div className="flex flex-col gap-4">
        {/* Run 列表（compact） */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-gray-800">历史运行</h3>
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中…
            </div>
          )}
          {err && (
            <div className="flex items-center gap-1 text-sm text-red-600">
              <AlertCircle className="h-4 w-4" />
              {err}
            </div>
          )}
          {!loading && !err && runs.length === 0 && (
            <p className="text-sm text-gray-400">暂无运行记录</p>
          )}
          {runs.length > 0 && (
            <ul className="flex flex-col gap-1">
              {runs.map((r) => {
                const isSelected = r.id === selectedRunId;
                const isActive = r.id === activeRunId;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedRunId(r.id)}
                      className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-gray-200 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium ${statusBadgeClass(r.status)}`}
                        >
                          {statusLabel(r.status)}
                        </span>
                        <span className="text-gray-600">
                          {formatTime(r.startedAt)}
                        </span>
                        {isActive && (
                          <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-700">
                            <Sparkles className="h-3 w-3" />
                            当前
                          </span>
                        )}
                      </div>
                      <ChevronRight
                        className={`h-4 w-4 ${isSelected ? 'text-violet-600' : 'text-gray-300'}`}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* 选中 run 详情 */}
        {selectedRun && (
          <section className="flex flex-col gap-3 border-t border-gray-100 pt-4">
            <header className="flex items-start justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">
                  阶段进度
                </h3>
                <p className="mt-0.5 text-xs text-gray-500">
                  Mission ID：
                  <span className="font-mono">
                    {selectedRun.id.slice(0, 8)}
                  </span>
                  {' · '}耗时 {formatDuration(selectedRun.durationMs)}
                  {' · '}
                  {selectedRun.trigger === 'MANUAL'
                    ? '手动触发'
                    : selectedRun.trigger === 'SCHEDULED'
                      ? '定时'
                      : '首次'}
                </p>
              </div>
            </header>

            {/* 5 stage 列表 */}
            <ol className="flex flex-col gap-1.5">
              {STAGE_GROUPS.map((group, idx) => {
                const st = stageGroupStatus(
                  selectedRun,
                  group,
                  selectedRun.id === activeRunId ? currentStage : null
                );
                return (
                  <li
                    key={group.id}
                    className="flex items-center gap-3 rounded-md border border-gray-100 bg-white px-3 py-2"
                  >
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                        st === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : st === 'running'
                            ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400'
                            : st === 'failed'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-slate-100 text-slate-400'
                      }`}
                    >
                      {st === 'completed' ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : st === 'running' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : st === 'failed' ? (
                        <X className="h-3.5 w-3.5" />
                      ) : (
                        idx + 1
                      )}
                    </span>
                    <span
                      className={`flex-1 text-sm ${
                        st === 'completed'
                          ? 'text-gray-700'
                          : st === 'running'
                            ? 'font-medium text-violet-700'
                            : st === 'failed'
                              ? 'text-red-700'
                              : 'text-gray-400'
                      }`}
                    >
                      {group.label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {st === 'completed'
                        ? '完成'
                        : st === 'running'
                          ? '进行中'
                          : st === 'failed'
                            ? '失败'
                            : '待执行'}
                    </span>
                  </li>
                );
              })}
            </ol>

            {/* metrics 摘要 */}
            {selectedRun.metrics && (
              <div className="rounded-md border border-gray-100 bg-gray-50 p-3">
                <h4 className="mb-2 text-xs font-semibold text-gray-700">
                  指标快照
                </h4>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  <Metric
                    label="尝试源数"
                    value={selectedRun.metrics.sourcesAttempted}
                  />
                  <Metric
                    label="失败源数"
                    value={selectedRun.metrics.sourcesFailed}
                    danger
                  />
                  <Metric
                    label="抓取条数"
                    value={selectedRun.metrics.itemsFetched}
                  />
                  <Metric
                    label="去重后"
                    value={selectedRun.metrics.itemsDeduped}
                  />
                  <Metric
                    label="入库"
                    value={selectedRun.metrics.itemsInserted}
                  />
                </dl>
              </div>
            )}

            {/* 失败原因 */}
            {selectedRun.status === 'failed' && selectedRun.error && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{selectedRun.error}</span>
              </div>
            )}

            {/* 源级错误（preflight 失败的源） */}
            {selectedRun.metrics?.sourceErrors &&
              selectedRun.metrics.sourceErrors.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <h4 className="mb-1.5 text-xs font-semibold text-amber-800">
                    源级错误（{selectedRun.metrics.sourceErrors.length} 个）
                  </h4>
                  <ul className="flex flex-col gap-1">
                    {selectedRun.metrics.sourceErrors
                      .slice(0, 5)
                      .map((e, i) => (
                        <li key={i} className="text-xs text-amber-700">
                          <span className="font-mono">
                            {e.sourceId.slice(0, 8)}
                          </span>
                          {' — '}
                          {e.error}
                        </li>
                      ))}
                    {selectedRun.metrics.sourceErrors.length > 5 && (
                      <li className="text-xs text-amber-600">
                        …还有 {selectedRun.metrics.sourceErrors.length - 5} 个
                      </li>
                    )}
                  </ul>
                </div>
              )}
          </section>
        )}
      </div>
    </SideDrawer>
  );
}

function Metric({
  label,
  value,
  danger,
}: {
  label: string;
  value?: number;
  danger?: boolean;
}) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`text-right font-medium ${
          danger && (value ?? 0) > 0 ? 'text-red-600' : 'text-gray-800'
        }`}
      >
        {value ?? 0}
      </dd>
    </>
  );
}
