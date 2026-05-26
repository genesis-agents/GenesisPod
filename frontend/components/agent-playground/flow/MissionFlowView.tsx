'use client';

/**
 * MissionFlowView —— 协作动态 tab 主视图（重构版）
 *
 * 取代原先 PipelineTimeline + AgentLiveGrid + RawEventLog 三层堆叠。
 * 新形态：
 *   1. 顶部 Mission Pulse —— 当前 mission 状态 + 进度 + 当前活跃 agent
 *   2. 中部 11-Stage Stepper —— S1-S11 紧凑横向 stepper（取代旧 PipelineTimeline）
 *   3. 主体 Mission-wide Narrative Timeline —— 把所有 narrativeLog 织成单一时间线
 *      + 工具调用 / 工具结果（来自 events）也作为卡片插入，按时间排序
 *
 * 用户在这里能一目了然看到 mission 实时在干什么，每个 agent 在做什么决策。
 */

import React, { useMemo, useState } from 'react';
import {
  Activity,
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  ScanSearch,
  ShieldAlert,
  Sparkles,
  Loader2,
  CheckCircle2,
  XCircle,
  Database,
  PiggyBank,
  type LucideIcon,
} from 'lucide-react';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { cn } from '@/lib/utils/common';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';
import {
  Card,
  Section,
  StatusPill,
  ExpandableText,
} from '@/components/agent-playground/ui';
// ★ B4-4b cutover：deriveTodoLedger 不再调用，仅保留类型导入。
import type {
  SystemStageId,
  MissionTodo,
} from '@/lib/features/agent-playground/todo-ledger';
import type { DerivedView } from '@/lib/features/agent-playground/derive';
import {
  fmtTimestamp,
  fmtRelative,
  ROLE_LABEL,
} from '@/lib/features/agent-playground/formatters';
import {
  StageStepper,
  type StageStepperItem,
} from '@/components/common/mission-detail/StageStepper';

const STAGE_META: Record<SystemStageId, { short: string; Icon: LucideIcon }> = {
  's1-budget': { short: '预算估算', Icon: PiggyBank },
  's2-leader-plan': { short: '维度规划', Icon: Brain },
  's3-researchers': { short: '并行研究', Icon: Search },
  's4-leader-assess': { short: '研究初审', Icon: Brain },
  's5-reconciler': { short: '跨维对账', Icon: ScanSearch },
  's6-analyst': { short: '综合分析', Icon: GitBranch },
  's7-writer-outline': { short: '章节规划', Icon: PenLine },
  's8-writer-draft': { short: '撰写报告', Icon: PenLine },
  's8b-quality-enhancement': { short: '质量闭环', Icon: ShieldAlert },
  's9-critic-l4': { short: '独立复审', Icon: ShieldAlert },
  's9b-objective-evaluation': { short: '客观评审', Icon: ShieldAlert },
  's10-leader-signoff': { short: '终审签字', Icon: Gavel },
  's11-persist': { short: '落库归档', Icon: Database },
  's12-self-evolution': { short: '自我进化', Icon: Sparkles },
};

const STAGE_ORDER: SystemStageId[] = [
  's1-budget',
  's2-leader-plan',
  's3-researchers',
  's4-leader-assess',
  's5-reconciler',
  's6-analyst',
  's7-writer-outline',
  's8-writer-draft',
  's8b-quality-enhancement',
  's9-critic-l4',
  's9b-objective-evaluation',
  's10-leader-signoff',
  's11-persist',
  's12-self-evolution',
];

interface Props {
  view: DerivedView;
  events: PlaygroundEvent[];
  /**
   * ★ B4-4b (2026-05-26 thinning plan §B4-4 / §3.4):
   *   todoLedger 由 page.tsx 从 canonical view.todoBoard.items 投影后传入；
   *   component 不再 self-derive。零参数变体保持向后兼容用作 graceful fallback
   *   （仅 §B7 future caller 才走 undefined 分支）。
   */
  todoLedger?: MissionTodo[];
  /**
   * 2026-05-20: 跨 domain stage 定义 override。传入时用调用方的 stage 列表渲染
   *   stepper（social/ai-radar 各传自己的 12/N 步），不传则用内部 playground
   *   todo-ledger 派生（playground 默认行为，零回归）。
   */
  stepperStages?: StageStepperItem[];
}

interface FlowEvent {
  ts: number;
  /** narrative / lifecycle / verdict / etc. */
  kind: 'narrative' | 'lifecycle' | 'verdict' | 'reconciliation' | 'critic';
  agentId?: string;
  role?: string;
  /** narrative tag */
  tone?: 'info' | 'success' | 'warn' | 'error';
  text: string;
  /** optional metadata */
  meta?: string;
}

function buildFlowEvents(events: PlaygroundEvent[]): FlowEvent[] {
  const out: FlowEvent[] = [];
  for (const ev of events) {
    // 2026-05-20: 规范化 namespace（同 derive.ts）—— social.* / agent-playground.*
    //   / ai-radar.* 各 domain 都 emit 相同 suffix，剥离前缀让时间线跨 domain 通用。
    const rawType = ev.type ?? '';
    const t = rawType.includes('.')
      ? rawType.slice(rawType.indexOf('.') + 1)
      : rawType;
    const p = (ev.payload ?? {}) as Record<string, unknown>;
    if (t === 'agent:narrative') {
      const text = p.text as string | undefined;
      const role = p.role as string | undefined;
      const tag = p.tag as string | undefined;
      const dim = p.dimension as string | undefined;
      if (!text) continue;
      const tone =
        tag === 'success'
          ? 'success'
          : tag === 'warning'
            ? 'warn'
            : tag === 'error'
              ? 'error'
              : 'info';
      out.push({
        ts: ev.timestamp,
        kind: 'narrative',
        role,
        tone,
        text,
        meta: dim,
        agentId: ev.agentId,
      });
    } else if (t === 'agent:lifecycle') {
      const phase = p.phase as string | undefined;
      const role = p.role as string | undefined;
      const dim = p.dimension as string | undefined;
      if (!phase || !role) continue;
      const verb =
        phase === 'started'
          ? '启动'
          : phase === 'completed'
            ? '完成'
            : phase === 'failed'
              ? '失败'
              : phase;
      out.push({
        ts: ev.timestamp,
        kind: 'lifecycle',
        role,
        tone:
          phase === 'completed'
            ? 'success'
            : phase === 'failed'
              ? 'error'
              : 'info',
        text: `${role}${dim ? `（${dim}）` : ''} ${verb}`,
        agentId: ev.agentId,
      });
    } else if (t === 'verifier:verdict') {
      const id = p.verifierId as string;
      const score = p.score as number;
      out.push({
        ts: ev.timestamp,
        kind: 'verdict',
        role: 'reviewer',
        tone: score >= 80 ? 'success' : score >= 60 ? 'warn' : 'error',
        text: `Judge "${id}" 评分 ${score}/100`,
      });
    } else if (t === 'reconciliation:completed') {
      const fact = (p.factCount as number) ?? 0;
      const conflict = (p.conflictCount as number) ?? 0;
      const gap = (p.gapCount as number) ?? 0;
      out.push({
        ts: ev.timestamp,
        kind: 'reconciliation',
        role: 'reconciler',
        tone: 'success',
        text: `对账完成 · ${fact} 条事实 / ${conflict} 处冲突 / ${gap} 处缺口`,
      });
    } else if (t === 'critic:verdict') {
      const verdict = p.verdict as string | undefined;
      const blindspots = (p.blindspotCount as number) ?? 0;
      const biases = (p.biasCount as number) ?? 0;
      const suggestions = (p.suggestionCount as number) ?? 0;
      out.push({
        ts: ev.timestamp,
        kind: 'critic',
        role: 'critic',
        tone:
          verdict === 'pass'
            ? 'success'
            : verdict === 'fail'
              ? 'error'
              : 'warn',
        text: `Critic L4 · ${verdict ?? '?'}（盲点 ${blindspots} / 偏见 ${biases} / 建议 ${suggestions}）`,
      });
    }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

function ROLE_ICON(role?: string): LucideIcon {
  switch (role) {
    case 'leader':
      return Brain;
    case 'researcher':
      return Search;
    case 'analyst':
      return GitBranch;
    case 'writer':
      return PenLine;
    case 'reviewer':
    case 'critic':
      return Gavel;
    case 'reconciler':
      return ScanSearch;
    case 'mission':
      return Sparkles;
    default:
      return Activity;
  }
}

function ROLE_TONE_CLASS(role?: string): {
  bg: string;
  text: string;
  border: string;
} {
  switch (role) {
    case 'leader':
      return {
        bg: 'bg-violet-50',
        text: 'text-violet-700',
        border: 'border-violet-200',
      };
    case 'researcher':
      return {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
      };
    case 'analyst':
      return {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
      };
    case 'writer':
      return {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
      };
    case 'reviewer':
      return {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
      };
    case 'critic':
      return {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
      };
    case 'reconciler':
      return {
        bg: 'bg-sky-50',
        text: 'text-sky-700',
        border: 'border-sky-200',
      };
    default:
      return {
        bg: 'bg-gray-50',
        text: 'text-gray-700',
        border: 'border-gray-200',
      };
  }
}

function TONE_DOT(tone?: 'info' | 'success' | 'warn' | 'error'): string {
  return tone === 'success'
    ? 'bg-emerald-500'
    : tone === 'warn'
      ? 'bg-amber-500'
      : tone === 'error'
        ? 'bg-red-500'
        : 'bg-blue-500';
}

export function MissionFlowView({
  view,
  events,
  todoLedger: todoLedgerProp,
  stepperStages,
}: Props) {
  const [filterRole, setFilterRole] = useState<string | null>(null);

  // ★ B4-4b cutover (thinning plan §B4-4 / §3.4 single-track):
  //   优先用 caller 投影后的 canonical todoLedger（来自 view.todoBoard.items）。
  //   若 caller 未传（B7 social/radar future caller），保留 zero-state 而非
  //   自派生 — 避免 component 内部重新成为 truth source（§3.4 禁止）。
  const todoLedger = useMemo<MissionTodo[]>(
    () => todoLedgerProp ?? [],
    [todoLedgerProp]
  );

  const flow = useMemo(() => {
    const all = buildFlowEvents(events);
    return filterRole ? all.filter((f) => f.role === filterRole) : all;
  }, [events, filterRole]);

  const anchor = view.mission.startedAt ?? events[0]?.timestamp ?? Date.now();

  // Active agents (running) + done count
  const runningAgents = view.agents.filter((a) => a.phase === 'running');
  const completedAgents = view.agents.filter(
    (a) => a.phase === 'completed'
  ).length;
  const failedAgents = view.agents.filter((a) => a.phase === 'failed').length;

  // Stage status from todoLedger system todos
  const systemTodoMap = new Map<SystemStageId, MissionTodo>();
  for (const td of todoLedger) {
    if (td.systemStageId) systemTodoMap.set(td.systemStageId, td);
  }

  // 角色过滤选项
  const availableRoles = Array.from(
    new Set(flow.map((f) => f.role).filter((r): r is string => Boolean(r)))
  );

  return (
    <div className="space-y-4">
      {/* ─── Mission Pulse ─── */}
      <Card className="p-4" bordered>
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-lg',
              runningAgents.length > 0
                ? 'bg-blue-100 text-blue-600'
                : view.mission.completedAt
                  ? 'bg-emerald-100 text-emerald-600'
                  : view.mission.failedAt
                    ? 'bg-red-100 text-red-600'
                    : 'bg-gray-100 text-gray-500'
            )}
          >
            {runningAgents.length > 0 ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : view.mission.completedAt ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : view.mission.failedAt ? (
              <XCircle className="h-5 w-5" />
            ) : (
              <Activity className="h-5 w-5" />
            )}
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">
              {runningAgents.length > 0
                ? `${runningAgents.length} 个 Agent 正在工作`
                : view.mission.completedAt
                  ? 'Mission 已完成'
                  : view.mission.failedAt
                    ? 'Mission 失败'
                    : 'Mission 等待启动'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {view.agents.length > 0 && (
                <>
                  共 {view.agents.length} 个 Agent · 完成 {completedAgents}
                  {failedAgents > 0 && ` · 失败 ${failedAgents}`}
                </>
              )}
            </p>
          </div>
          {runningAgents.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {runningAgents.slice(0, 3).map((a) => {
                const Icon = ROLE_ICON(a.role);
                const tone = ROLE_TONE_CLASS(a.role);
                return (
                  <span
                    key={a.agentId}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1',
                      tone.bg,
                      tone.text,
                      tone.border.replace('border-', 'ring-')
                    )}
                    title={a.agentId}
                  >
                    <Icon className="h-2.5 w-2.5" />
                    {a.dimension ?? a.agentId}
                  </span>
                );
              })}
              {runningAgents.length > 3 && (
                <span className="text-[10px] text-gray-500">
                  +{runningAgents.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* ─── stage stepper（统一 StageStepper 组件） ─── */}
      {/* stepperStages 传入（social/radar）→ 用调用方阶段；否则用 playground
          todo-ledger 派生（默认行为）。 */}
      <StageStepper
        stages={
          stepperStages ??
          STAGE_ORDER.map((sid): StageStepperItem => {
            const td = systemTodoMap.get(sid);
            const meta = STAGE_META[sid];
            const s = td?.status;
            const status: StageStepperItem['status'] =
              s === 'done'
                ? 'done'
                : s === 'in_progress'
                  ? 'in_progress'
                  : s === 'failed'
                    ? 'failed'
                    : 'pending';
            return {
              id: sid,
              short: meta.short,
              Icon: meta.Icon,
              status,
              title: td?.title ?? sid,
            };
          })
        }
      />

      {/* ─── Mission-wide narrative timeline ─── */}
      <Section
        title="Mission 实时时间线"
        count={`${flow.length} 条事件`}
        action={
          availableRoles.length > 1 && (
            <select
              value={filterRole ?? ''}
              onChange={(e) => setFilterRole(e.target.value || null)}
              onClick={(e) => e.stopPropagation()}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 text-[11px] text-gray-700"
            >
              <option value="">全部角色</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r] ?? r}
                </option>
              ))}
            </select>
          )
        }
      >
        {flow.length === 0 ? (
          <EmptyState
            title="等待 Mission 启动"
            description="事件流入后会显示在这里"
            size="sm"
          />
        ) : (
          <ol className="relative space-y-0 p-3 pl-9">
            <span
              className="absolute bottom-3 left-[20px] top-3 w-0.5 bg-gradient-to-b from-violet-200 via-blue-200 to-emerald-100"
              aria-hidden="true"
            />
            {flow.map((f, i) => {
              const Icon = ROLE_ICON(f.role);
              const tone = ROLE_TONE_CLASS(f.role);
              return (
                <li key={`${f.ts}-${i}`} className="relative pb-2.5 last:pb-0">
                  <span
                    className={cn(
                      'absolute -left-[28px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white',
                      tone.bg
                    )}
                  >
                    <Icon className={cn('h-3 w-3', tone.text)} />
                  </span>
                  <div
                    className={cn(
                      'rounded-lg border px-3 py-2',
                      tone.border,
                      tone.bg.replace('bg-', 'bg-') + '/40'
                    )}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                          tone.bg,
                          tone.text
                        )}
                      >
                        <span
                          className={cn(
                            'h-1.5 w-1.5 rounded-full',
                            TONE_DOT(f.tone)
                          )}
                        />
                        {ROLE_LABEL[f.role ?? ''] ?? f.role ?? 'Unknown'}
                      </span>
                      {f.meta && (
                        <span className="font-mono rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-gray-600">
                          {f.meta}
                        </span>
                      )}
                      <span className="ml-auto flex items-center gap-1.5">
                        <span className="font-mono text-[10px] font-semibold text-gray-600">
                          {fmtRelative(f.ts, anchor)}
                        </span>
                        <span className="font-mono text-[9px] text-gray-400">
                          {fmtTimestamp(f.ts)}
                        </span>
                      </span>
                    </div>
                    <ExpandableText
                      text={f.text}
                      maxChars={240}
                      className="block text-[12.5px] leading-relaxed text-gray-800"
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </div>
  );
}
