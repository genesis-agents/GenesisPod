'use client';

/**
 * StageTaskDrawer —— 单个 Stage Task 的「完整故事」抽屉
 *
 * 由 mission 详情页表格行点击触发，展示某个 Agent 在本次 Mission 中的任务执行
 * 细节。信息架构参考 agent-playground TodoDetailDrawer：
 *
 *   Header        : Agent badge + 任务名 + 状态 chip
 *   Agent profile : 角色名 / 描述 / 是否调 LLM
 *   Task config   : Loop / 模型 / 阶段范围 / 输入数据
 *   产出 metrics  : 该 stage 对应的 metric 子集
 *   Failure       : 失败原因（仅当本 stage 是 mission 中断点时）
 */

import { useMemo } from 'react';
import {
  AlertCircle,
  Check,
  Database,
  Loader2,
  Radar,
  Sparkles,
  Wand2,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';

import { SideDrawer } from '@/components/common/drawers/SideDrawer';
import type { RadarRun } from '@/services/ai-radar/types';
import {
  agentRoleTone,
  stageGroupStatus,
  stageStateTone,
  type StageGroup,
  type StageState,
} from './run-helpers';

const AGENT_ICON: Record<string, LucideIcon> = {
  collector: Radar,
  deduper: Database,
  scorer: Sparkles,
  enricher: Wand2,
  persister: Check,
};

interface Props {
  run: RadarRun;
  stage: StageGroup | null;
  /** 仅 mission 仍在 running 时来自 WS 的实时 stage 名 */
  currentStage: string | null;
  onClose: () => void;
}

export function StageTaskDrawer({ run, stage, currentStage, onClose }: Props) {
  const state: StageState | null = useMemo(
    () => (stage ? stageGroupStatus(run, stage, currentStage) : null),
    [stage, run, currentStage]
  );

  if (!stage || !state) return null;

  const tone = agentRoleTone(stage.agent.role);
  const stTone = stageStateTone(state);
  const Icon = AGENT_ICON[stage.agent.role] ?? Sparkles;

  const isFailureStage = state === 'failed';
  const isCancelledStage = state === 'cancelled';
  const metricVal =
    stage.metricKey != null ? (run.metrics?.[stage.metricKey] ?? null) : null;

  // 该 stage 在 mission 的相关 sourceErrors（仅 collect / dedupe / 类似阶段相关）
  const sourceErrors =
    stage.id === 'collect' ? (run.metrics?.sourceErrors ?? []) : [];

  return (
    <SideDrawer open onClose={onClose} title="Stage 任务详情" widthPx={560}>
      <div className="flex flex-col gap-4">
        {/* Header — Agent badge + 任务名 + 状态 */}
        <header className="flex items-start gap-3">
          <span
            className={`inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${tone.bg} ${tone.ring}`}
          >
            <Icon className={`h-5 w-5 ${tone.text}`} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 className="text-base font-semibold text-gray-900">
                {stage.label}
              </h3>
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium ring-1 ${stTone.bg} ${stTone.text} ${stTone.ring}`}
              >
                {state === 'running' && (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                )}
                {state === 'completed' && <Check className="h-2.5 w-2.5" />}
                {state === 'failed' && <X className="h-2.5 w-2.5" />}
                {state === 'cancelled' && <XCircle className="h-2.5 w-2.5" />}
                {stTone.label}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-600">
              {stage.hint}
            </p>
          </div>
        </header>

        {/* Agent profile */}
        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            负责 Agent
          </h4>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}
              >
                <Icon className="h-3 w-3" />
                {stage.agent.name}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-gray-600">
              {stage.agent.description}
            </p>
          </div>
        </section>

        {/* Task config */}
        <section className="rounded-lg border border-gray-200 bg-white p-3">
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            任务配置
          </h4>
          <dl className="grid grid-cols-[100px_1fr] gap-x-3 gap-y-2 text-xs">
            <dt className="text-gray-500">阶段范围</dt>
            <dd className="font-mono text-gray-800">
              stage {stage.stageNumStart}
              {stage.stageNumEnd !== stage.stageNumStart && (
                <>-{stage.stageNumEnd}</>
              )}
              {' / 8'}
            </dd>
            <dt className="text-gray-500">原子 stage</dt>
            <dd className="font-mono text-[11px] text-gray-800">
              {stage.stages.join(' → ')}
            </dd>
            <dt className="text-gray-500">是否调 LLM</dt>
            <dd
              className={
                stage.agent.usesLLM ? 'text-violet-700' : 'text-gray-600'
              }
            >
              {stage.agent.usesLLM
                ? '是 · CHAT 模型（按 TaskProfile 路由）'
                : '否'}
            </dd>
            {state === 'running' && currentStage && (
              <>
                <dt className="text-gray-500">实时阶段</dt>
                <dd className="font-mono text-violet-700">{currentStage}</dd>
              </>
            )}
          </dl>
        </section>

        {/* 产出 metrics（如果该 stage 有专属指标） */}
        {metricVal != null && stage.metricLabel && (
          <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
              本 stage 产出
            </h4>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-700">
                {metricVal}
              </span>
              <span className="text-xs text-emerald-600">
                {stage.metricLabel}
              </span>
            </div>
          </section>
        )}

        {/* Failure details — 仅本 stage 是 mission 失败/取消点 */}
        {(isFailureStage || isCancelledStage) && run.error && (
          <section
            className={`rounded-md border p-3 ${
              isFailureStage
                ? 'border-red-200 bg-red-50'
                : 'border-slate-200 bg-slate-50'
            }`}
          >
            <h4
              className={`mb-1 inline-flex items-center gap-1.5 text-xs font-semibold ${
                isFailureStage ? 'text-red-700' : 'text-slate-700'
              }`}
            >
              <AlertCircle className="h-3.5 w-3.5" />
              {isFailureStage ? '中断点：失败原因' : '中断点：取消原因'}
            </h4>
            <p
              className={`text-xs leading-relaxed ${
                isFailureStage ? 'text-red-700' : 'text-slate-700'
              }`}
            >
              {run.error}
            </p>
            <p className="mt-1.5 text-[11px] text-gray-500">
              Mission 在 stage {(run.lastCompletedStage ?? 0) + 1} 处中断 ——
              本任务正好落在中断阶段
            </p>
          </section>
        )}

        {/* 源级错误（collect stage 特有） */}
        {sourceErrors.length > 0 && (
          <section className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <h4 className="mb-1.5 text-xs font-semibold text-amber-800">
              源级错误（{sourceErrors.length} 个）
            </h4>
            <ul className="flex flex-col gap-1">
              {sourceErrors.slice(0, 20).map((e, i) => (
                <li
                  key={`${e.sourceId}-${i}`}
                  className="text-xs text-amber-700"
                >
                  <span className="font-mono">
                    {e.sourceId?.slice(0, 8) ?? '(unknown)'}
                  </span>
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

        {/* Pending hint */}
        {state === 'pending' && (
          <section className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            该阶段尚未启动。等待前置 stage 完成后 framework 会自动调度本 Agent。
          </section>
        )}
      </div>
    </SideDrawer>
  );
}
