'use client';

/**
 * RunDetailDrawer —— 单次 Agent 过程（=一次 run）的完整故事
 *
 * 表格行 → 点击 → 本 drawer 弹出。信息架构（参考 agent-playground TodoDetailDrawer）：
 *   Header     : status badge + run.id + 触发方式 + 时间
 *   Stats grid : 耗时 / 抓取 / 去重 / 入库 / 失败源 数字大字
 *   Stage flow : 5 stage 状态行（completed/running/failed/pending）
 *   Failure    : 失败原因（仅 failed）+ 源级错误列表（若有）
 *
 * stage 算法与主页 stageGroupStatus 一致 —— 但 drawer 自包含一份避免循环依赖，
 * 后续如有第三处用到再抽 lib（YAGNI）。
 */

import {
  AlertCircle,
  Check,
  Database,
  Loader2,
  X,
  type LucideIcon,
} from 'lucide-react';

import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import type { RadarRun } from '@/services/ai-radar/types';
import {
  STAGE_GROUPS,
  formatDateTime,
  formatDuration,
  stageGroupStatus,
  statusBadgeClass,
  statusLabel,
  triggerLabel as triggerLabelShort,
} from './run-helpers';

// drawer 里用稍长版本，避免和表格"手动/定时/首次"标签视觉撞色
function triggerLabel(t: RadarRun['trigger']): string {
  return `${triggerLabelShort(t)}触发`;
}

interface Props {
  run: RadarRun | null;
  /** 仅当 run.id === activeRunId 时才传 currentStage —— 其他历史 run 不订 WS */
  currentStage: string | null;
  onClose: () => void;
}

export function RunDetailDrawer({ run, currentStage, onClose }: Props) {
  if (!run) return null;
  const m = run.metrics;
  const sourceErrors = m?.sourceErrors ?? [];

  return (
    <SideDrawer open onClose={onClose} title="本次运行详情" widthPx={560}>
      <div className="flex flex-col gap-4">
        {/* Header strip */}
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ring-1 ${statusBadgeClass(run.status)}`}
            >
              {run.status === 'running' && (
                <Loader2 className="h-3 w-3 animate-spin" />
              )}
              {statusLabel(run.status)}
            </span>
            <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
              {triggerLabel(run.trigger)}
            </span>
            <span className="font-mono text-xs text-gray-500">
              {run.id.slice(0, 8)}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            开始 {formatDateTime(run.startedAt)}
            {run.completedAt && <> · 结束 {formatDateTime(run.completedAt)}</>}
            {run.durationMs != null && (
              <> · 耗时 {formatDuration(run.durationMs)}</>
            )}
          </p>
        </div>

        {/* Stats grid */}
        {m && (
          <div className="grid grid-cols-3 gap-2">
            <Stat label="尝试源" value={m.sourcesAttempted ?? 0} />
            <Stat
              label="失败源"
              value={m.sourcesFailed ?? 0}
              danger={(m.sourcesFailed ?? 0) > 0}
            />
            <Stat label="抓取" value={m.itemsFetched ?? 0} />
            <Stat label="去重后" value={m.itemsDeduped ?? 0} />
            <Stat label="入库" value={m.itemsInserted ?? 0} highlight />
            <Stat label="耗时" value={formatDuration(run.durationMs)} />
          </div>
        )}

        {/* Stage flow */}
        <section>
          <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            <Database className="h-3.5 w-3.5 text-violet-500" />
            阶段流程
          </h3>
          <ol className="flex flex-col gap-1.5">
            {STAGE_GROUPS.map((g, idx) => {
              const st = stageGroupStatus(run, g, currentStage);
              const stStatusText =
                st === 'completed'
                  ? '完成'
                  : st === 'running'
                    ? '进行中'
                    : st === 'failed'
                      ? '失败'
                      : st === 'cancelled'
                        ? '已取消'
                        : '待执行';
              return (
                <li
                  key={g.id}
                  className="flex items-center gap-3 rounded-md border border-gray-100 bg-white px-3 py-2"
                  title={g.hint}
                >
                  <span
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      st === 'completed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : st === 'running'
                          ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-400'
                          : st === 'failed'
                            ? 'bg-red-100 text-red-700'
                            : st === 'cancelled'
                              ? 'bg-slate-200 text-slate-600'
                              : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {st === 'completed' ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : st === 'running' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : st === 'failed' || st === 'cancelled' ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-sm ${
                        st === 'completed'
                          ? 'text-gray-700'
                          : st === 'running'
                            ? 'font-medium text-violet-700'
                            : st === 'failed'
                              ? 'text-red-700'
                              : st === 'cancelled'
                                ? 'text-slate-600'
                                : 'text-gray-400'
                      }`}
                    >
                      {g.label}
                    </div>
                    <p className="text-[11px] text-gray-500">{g.hint}</p>
                  </div>
                  <span className="text-xs text-gray-400">{stStatusText}</span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Failure: mission-level error */}
        {run.status === 'failed' && run.error && (
          <FailureCard
            title="Mission 失败"
            icon={AlertCircle}
            tone="red"
            body={run.error}
          />
        )}

        {/* Source-level errors */}
        {sourceErrors.length > 0 && (
          <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <h4 className="mb-1.5 text-xs font-semibold text-amber-800">
              源级错误（{sourceErrors.length} 个）
            </h4>
            <ul className="flex flex-col gap-1">
              {sourceErrors.slice(0, 20).map((e, i) => (
                <li key={i} className="text-xs text-amber-700">
                  <span className="font-mono">{e.sourceId.slice(0, 8)}</span>
                  {' — '}
                  {e.error}
                </li>
              ))}
              {sourceErrors.length > 20 && (
                <li className="text-xs text-amber-600">
                  …还有 {sourceErrors.length - 20} 个，请查看后端日志
                </li>
              )}
            </ul>
          </section>
        )}
      </div>
    </SideDrawer>
  );
}

function Stat({
  label,
  value,
  danger,
  highlight,
}: {
  label: string;
  value: number | string;
  danger?: boolean;
  highlight?: boolean;
}) {
  const num = typeof value === 'number' ? value : null;
  return (
    <div
      className={`rounded-lg border p-2.5 ${
        highlight
          ? 'border-violet-200 bg-violet-50'
          : 'border-gray-200 bg-white'
      }`}
    >
      <div className="text-[11px] text-gray-500">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold ${
          danger && (num ?? 0) > 0
            ? 'text-red-600'
            : highlight
              ? 'text-violet-700'
              : 'text-gray-900'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function FailureCard({
  title,
  icon: Icon,
  tone,
  body,
}: {
  title: string;
  icon: LucideIcon;
  tone: 'red' | 'amber';
  body: string;
}) {
  const cls =
    tone === 'red'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <section className={`rounded-md border p-3 ${cls}`}>
      <h4 className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </h4>
      <p className="text-xs leading-relaxed">{body}</p>
    </section>
  );
}
