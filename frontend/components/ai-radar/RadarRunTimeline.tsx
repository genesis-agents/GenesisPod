'use client';

/**
 * RadarRunTimeline —— 详情页右侧底部：最近 N 个 run 历史时间轴
 *
 * 调 listRuns(topicId, limit) → 渲染 run 状态 + 耗时 + metrics。
 * 失败 run 展开 error message。
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, MinusCircle } from 'lucide-react';
import { listRuns } from '@/services/ai-radar/api';
import type { RadarRun } from '@/services/ai-radar/types';

export interface RadarRunTimelineProps {
  topicId: string;
  /** 当 mission ws 推送 completed/failed 时，外层用 reloadKey 触发重拉 */
  reloadKey?: number;
  limit?: number;
}

function statusBadge(status: string) {
  if (status === 'running') {
    return {
      Icon: Loader2,
      cls: 'text-blue-600 animate-spin',
      label: '运行中',
    };
  }
  if (status === 'completed') {
    return { Icon: CheckCircle2, cls: 'text-green-600', label: '已完成' };
  }
  if (status === 'failed') {
    return { Icon: XCircle, cls: 'text-red-600', label: '失败' };
  }
  if (status === 'cancelled') {
    return { Icon: MinusCircle, cls: 'text-gray-500', label: '已取消' };
  }
  return { Icon: MinusCircle, cls: 'text-gray-400', label: status };
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function RadarRunTimeline({
  topicId,
  reloadKey,
  limit = 10,
}: RadarRunTimelineProps) {
  const [runs, setRuns] = useState<RadarRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listRuns(topicId, limit)
      .then((rows) => {
        if (cancelled) return;
        setRuns(rows);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [topicId, limit, reloadKey]);

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        历史运行
      </h3>
      {loading ? (
        <div className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-gray-50" />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <p className="text-xs text-gray-500">暂无运行历史</p>
      ) : (
        <ol className="space-y-1.5">
          {runs.map((run) => {
            const { Icon, cls, label } = statusBadge(run.status);
            const metrics = run.metrics as {
              itemsInserted?: number;
              itemsAccepted?: number;
            } | null;
            return (
              <li
                key={run.id}
                className="flex items-start gap-2 rounded-md px-1.5 py-1 hover:bg-gray-50"
              >
                <Icon className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${cls}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium text-gray-800">{label}</span>
                    <span className="text-gray-400">
                      {formatTime(run.startedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                    <span>{formatDuration(run.durationMs)}</span>
                    {metrics?.itemsInserted != null && (
                      <span>新条目 {metrics.itemsInserted}</span>
                    )}
                    {metrics?.itemsAccepted != null && (
                      <span>精选 {metrics.itemsAccepted}</span>
                    )}
                    {run.trigger && (
                      <span className="text-gray-400">
                        {run.trigger === 'MANUAL'
                          ? '手动'
                          : run.trigger === 'SCHEDULED'
                            ? '自动'
                            : '首次'}
                      </span>
                    )}
                  </div>
                  {run.error && (
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-red-500">
                      {run.error}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
