'use client';

/**
 * ComputeUsagePanel —— 算力消耗（对标 Topic Insights，叠加我们独有能力）
 *
 * 信息架构：
 *   Section A · Token / Cost 总览（4 卡：总 tokens / 总成本 / 调用次数 / 平均延迟）
 *   Section B · 模型分布表（每个 modelId 的调用 / tokens / 占比 / 估算成本）
 *   Section C · 阶段（Stage）分布柱图  ← TI 也有
 *   Section D · Agent 实例耗时表        ← 我们独有：每个 Agent 实例 iter / wallTime / model
 *   Section E · 工具延迟表              ← 我们独有：每个 toolId 的调用次数 / 总延迟 / 平均
 *   Section F · 浪费分析（重试 / 重写）  ← 我们独有：retryCount / chapter rewrite 次数
 *
 * 全程使用 playground-ui primitives + design tokens。
 */

import React from 'react';
import {
  Coins,
  Layers,
  Cpu,
  Wrench,
  AlertTriangle,
  Activity,
  Gauge,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  CostState,
  AgentLiveState,
  DimensionPipelineState,
} from '@/lib/agent-playground/derive';
import type { MissionTodo } from '@/lib/agent-playground/todo-ledger';
import { Card } from '@/components/playground-ui';

interface Props {
  cost: CostState;
  agents: AgentLiveState[];
  todos: MissionTodo[];
  dimensionPipelines: Map<string, DimensionPipelineState>;
}

const STAGE_LABEL: Record<string, string> = {
  leader: 'Leader',
  researchers: 'Researchers',
  reconciler: 'Reconciler',
  analyst: 'Analyst',
  writer: 'Writer',
  reviewer: 'Reviewer',
  critic: 'Critic',
};

const ROLE_LABEL: Record<string, string> = {
  leader: 'Leader',
  researcher: 'Researcher',
  analyst: 'Analyst',
  writer: 'Writer',
  reviewer: 'Reviewer',
  critic: 'Critic',
};

function fmtUsd(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.001) return `$${n.toFixed(5)}`;
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}
function fmtTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
function fmtLatency(ms: number): string {
  if (!ms || ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

// ─── Section A · 总览 ────────────────────────────────
function SummaryStrip({
  totalTokens,
  costUsd,
  totalCalls,
  avgLatencyMs,
}: {
  totalTokens: number;
  costUsd: number;
  totalCalls: number;
  avgLatencyMs: number;
}) {
  const cells: {
    Icon: typeof Coins;
    label: string;
    value: string;
    sub?: string;
    tone: string;
  }[] = [
    {
      Icon: Coins,
      label: '总成本',
      value: fmtUsd(costUsd),
      sub: '估算（按 $3/1M tokens 折算）',
      tone: 'bg-amber-50 text-amber-600 ring-amber-100',
    },
    {
      Icon: Cpu,
      label: '总 tokens',
      value: fmtTokens(totalTokens),
      sub: '所有 stage 累计',
      tone: 'bg-violet-50 text-violet-600 ring-violet-100',
    },
    {
      Icon: Activity,
      label: '工具调用',
      value: String(totalCalls),
      sub: 'tool / LLM 次数',
      tone: 'bg-sky-50 text-sky-600 ring-sky-100',
    },
    {
      Icon: Gauge,
      label: '平均延迟',
      value: fmtLatency(avgLatencyMs),
      sub: '工具单次调用平均',
      tone: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cells.map((c) => (
        <Card key={c.label} className="px-4 py-3" bordered>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {c.label}
            </p>
            <span
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-lg ring-1',
                c.tone
              )}
            >
              <c.Icon className="h-4 w-4" />
            </span>
          </div>
          <p className="mt-1.5 text-2xl font-bold text-gray-900">{c.value}</p>
          {c.sub && <p className="mt-0.5 text-xs text-gray-500">{c.sub}</p>}
        </Card>
      ))}
    </div>
  );
}

// ─── Section B · 模型分布 ─────────────────────────────
interface ModelRow {
  modelId: string;
  callCount: number;
  agentCount: number;
  estTokens: number;
  pct: number;
  estCostUsd: number;
}
function buildModelDistribution(agents: AgentLiveState[]): ModelRow[] {
  const map = new Map<
    string,
    { callCount: number; agentSet: Set<string>; tokens: number }
  >();
  for (const a of agents) {
    const calls = a.trace.length;
    const tokensFromTrace = a.trace.reduce(
      (s, t) => s + (t.tokensUsed ?? 0),
      0
    );
    const m = a.modelId || '(未捕获)';
    const cur = map.get(m) ?? {
      callCount: 0,
      agentSet: new Set(),
      tokens: 0,
    };
    cur.callCount += calls;
    cur.agentSet.add(a.agentId);
    cur.tokens += tokensFromTrace;
    map.set(m, cur);
  }
  const total = [...map.values()].reduce((s, v) => s + v.tokens, 0) || 1;
  return [...map.entries()]
    .map(([modelId, v]) => ({
      modelId,
      callCount: v.callCount,
      agentCount: v.agentSet.size,
      estTokens: v.tokens,
      pct: Math.round((v.tokens / total) * 100),
      estCostUsd: (v.tokens / 1_000_000) * 3, // 粗估 $3/1M
    }))
    .sort((a, b) => b.estTokens - a.estTokens);
}

function ModelDistributionTable({ rows }: { rows: ModelRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="overflow-hidden" bordered>
      <div className="border-b border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900">模型分布</h3>
          <span className="text-xs text-gray-500">
            · 共 {rows.length} 个模型
          </span>
        </div>
      </div>
      <table className="w-full table-fixed text-[12px]">
        <thead className="bg-gray-50/80">
          <tr>
            <th className="w-[34%] px-3 py-2 text-left font-medium text-gray-600">
              模型 ID
            </th>
            <th className="w-[12%] px-2 py-2 text-right font-medium text-gray-600">
              实例
            </th>
            <th className="w-[12%] px-2 py-2 text-right font-medium text-gray-600">
              调用
            </th>
            <th className="w-[14%] px-2 py-2 text-right font-medium text-gray-600">
              估算 tokens
            </th>
            <th className="w-[14%] px-2 py-2 text-right font-medium text-gray-600">
              估算成本
            </th>
            <th className="w-[14%] px-2 py-2 text-right font-medium text-gray-600">
              占比
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.modelId} className="hover:bg-violet-50/30">
              <td className="px-3 py-2">
                <span
                  className="font-mono block truncate text-[11px] text-gray-700"
                  title={r.modelId}
                >
                  {r.modelId}
                </span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-gray-700">
                {r.agentCount}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-gray-700">
                {r.callCount}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {fmtTokens(r.estTokens)}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {fmtUsd(r.estCostUsd)}
              </td>
              <td className="px-2 py-2 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-violet-400"
                      style={{ width: `${Math.min(100, r.pct)}%` }}
                    />
                  </div>
                  <span className="font-mono w-8 text-right text-[11px] text-gray-600">
                    {r.pct}%
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-gray-400">
        Tokens 估算来自 trace.tokensUsed 累加；当模型 id
        未捕获时归入「(未捕获)」。
      </p>
    </Card>
  );
}

// ─── Section C · Stage 柱图 ──────────────────────────
function StageBars({ cost }: { cost: CostState }) {
  const stages = [
    'leader',
    'researchers',
    'reconciler',
    'analyst',
    'writer',
    'reviewer',
    'critic',
  ];
  const data = stages.map((s) => {
    const d = cost.byStage.find((b) => b.stage === s);
    return {
      stage: s,
      label: STAGE_LABEL[s] ?? s,
      tokensUsed: d?.tokensUsed ?? 0,
      costUsd: d?.costUsd ?? 0,
    };
  });
  const max = Math.max(1, ...data.map((d) => d.tokensUsed));
  return (
    <Card className="p-4" bordered>
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-gray-900">阶段分布</h3>
      </div>
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.stage}>
            <div className="mb-0.5 flex items-baseline justify-between text-[11px]">
              <span className="text-gray-700">{d.label}</span>
              <span className="font-mono text-gray-500">
                {fmtTokens(d.tokensUsed)}
                {d.costUsd > 0 && (
                  <span className="ml-1.5 text-gray-400">
                    {fmtUsd(d.costUsd)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-gradient-to-r from-amber-300 to-orange-400 transition-all"
                style={{
                  width: `${Math.round((d.tokensUsed / max) * 100)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Section D · Agent 实例表 ────────────────────────
function AgentInstanceTable({ agents }: { agents: AgentLiveState[] }) {
  if (agents.length === 0) return null;
  const sorted = [...agents].sort(
    (a, b) => (b.wallTimeMs ?? 0) - (a.wallTimeMs ?? 0)
  );
  return (
    <Card className="overflow-hidden" bordered>
      <div className="border-b border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900">
            Agent 实例耗时
          </h3>
          <span className="text-xs text-gray-500">
            · 共 {agents.length} 个实例
          </span>
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50/80">
          <tr>
            <th className="w-[12%] px-3 py-2 text-left font-medium text-gray-600">
              角色
            </th>
            <th className="w-[24%] px-2 py-2 text-left font-medium text-gray-600">
              实例 ID
            </th>
            <th className="w-[18%] px-2 py-2 text-left font-medium text-gray-600">
              维度
            </th>
            <th className="w-[18%] px-2 py-2 text-left font-medium text-gray-600">
              模型
            </th>
            <th className="w-[10%] px-2 py-2 text-right font-medium text-gray-600">
              Iter
            </th>
            <th className="w-[10%] px-2 py-2 text-right font-medium text-gray-600">
              重试
            </th>
            <th className="w-[8%] px-2 py-2 text-right font-medium text-gray-600">
              耗时
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.map((a) => (
            <tr key={a.agentId} className="hover:bg-blue-50/30">
              <td className="px-3 py-2">
                <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
                  {ROLE_LABEL[a.role] ?? a.role}
                </span>
              </td>
              <td
                className="font-mono truncate px-2 py-2 text-[11px] text-gray-700"
                title={a.agentId}
              >
                {a.agentId}
              </td>
              <td
                className="truncate px-2 py-2 text-[11px] text-gray-600"
                title={a.dimension ?? ''}
              >
                {a.dimension ?? '—'}
              </td>
              <td
                className="font-mono truncate px-2 py-2 text-[10.5px] text-gray-500"
                title={a.modelId ?? ''}
              >
                {a.modelId ?? '—'}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {a.iterations ?? 0}
              </td>
              <td
                className={cn(
                  'font-mono px-2 py-2 text-right tabular-nums',
                  (a.retryCount ?? 0) > 0
                    ? 'font-semibold text-orange-600'
                    : 'text-gray-400'
                )}
              >
                {a.retryCount ?? 0}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {a.wallTimeMs ? fmtLatency(a.wallTimeMs) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Section E · 工具延迟 ─────────────────────────────
interface ToolRow {
  toolId: string;
  callCount: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
  errorCount: number;
}
function buildToolStats(agents: AgentLiveState[]): ToolRow[] {
  const map = new Map<
    string,
    { callCount: number; totalLatency: number; errors: number }
  >();
  for (const a of agents) {
    for (const t of a.trace) {
      if (t.kind !== 'action' || !t.toolId) continue;
      const cur = map.get(t.toolId) ?? {
        callCount: 0,
        totalLatency: 0,
        errors: 0,
      };
      cur.callCount += 1;
      cur.totalLatency += t.latencyMs ?? 0;
      if (t.error) cur.errors += 1;
      map.set(t.toolId, cur);
    }
  }
  return [...map.entries()]
    .map(([toolId, v]) => ({
      toolId,
      callCount: v.callCount,
      totalLatencyMs: v.totalLatency,
      avgLatencyMs: v.totalLatency / Math.max(1, v.callCount),
      errorCount: v.errors,
    }))
    .sort((a, b) => b.totalLatencyMs - a.totalLatencyMs);
}

function ToolLatencyTable({ rows }: { rows: ToolRow[] }) {
  if (rows.length === 0) return null;
  return (
    <Card className="overflow-hidden" bordered>
      <div className="border-b border-gray-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-emerald-500" />
          <h3 className="text-sm font-semibold text-gray-900">工具延迟</h3>
          <span className="text-xs text-gray-500">
            · 共 {rows.length} 个工具
          </span>
        </div>
      </div>
      <table className="w-full text-[12px]">
        <thead className="bg-gray-50/80">
          <tr>
            <th className="w-[40%] px-3 py-2 text-left font-medium text-gray-600">
              工具 ID
            </th>
            <th className="w-[15%] px-2 py-2 text-right font-medium text-gray-600">
              调用
            </th>
            <th className="w-[15%] px-2 py-2 text-right font-medium text-gray-600">
              总延迟
            </th>
            <th className="w-[15%] px-2 py-2 text-right font-medium text-gray-600">
              平均
            </th>
            <th className="w-[15%] px-2 py-2 text-right font-medium text-gray-600">
              失败
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((r) => (
            <tr key={r.toolId} className="hover:bg-emerald-50/30">
              <td
                className="font-mono truncate px-3 py-2 text-[11px] text-gray-700"
                title={r.toolId}
              >
                {r.toolId}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {r.callCount}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {fmtLatency(r.totalLatencyMs)}
              </td>
              <td className="font-mono px-2 py-2 text-right tabular-nums text-gray-700">
                {fmtLatency(r.avgLatencyMs)}
              </td>
              <td
                className={cn(
                  'font-mono px-2 py-2 text-right tabular-nums',
                  r.errorCount > 0
                    ? 'font-semibold text-red-600'
                    : 'text-gray-400'
                )}
              >
                {r.errorCount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Section F · 浪费分析 ─────────────────────────────
function WasteAnalysis({
  agents,
  todos,
  dimensionPipelines,
}: {
  agents: AgentLiveState[];
  todos: MissionTodo[];
  dimensionPipelines: Map<string, DimensionPipelineState>;
}) {
  const totalRetries = agents.reduce((s, a) => s + (a.retryCount ?? 0), 0);
  let chapterRewrites = 0;
  for (const dp of dimensionPipelines.values()) {
    for (const c of dp.chapters) {
      chapterRewrites += Math.max(0, (c.attempts ?? 1) - 1);
    }
  }
  const reviewerRevise = todos.filter(
    (t) => t.origin === 'reviewer-revise'
  ).length;
  const selfHeal = todos.filter((t) => t.origin === 'self-heal-retry').length;
  const leaderReplay = todos.filter((t) =>
    t.origin.startsWith('leader-assess')
  ).length;

  if (
    totalRetries === 0 &&
    chapterRewrites === 0 &&
    reviewerRevise === 0 &&
    selfHeal === 0 &&
    leaderReplay === 0
  ) {
    return (
      <Card className="border-emerald-100 bg-emerald-50/50 p-4" bordered>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-emerald-600" />
          <p className="text-sm font-semibold text-emerald-700">
            零返工 · 0 次重试 / 0 次重写
          </p>
        </div>
        <p className="mt-1 text-xs text-emerald-700/80">
          本次 mission 没有 Agent 自愈重试，也没有 Chapter Reviewer 触发重写。
        </p>
      </Card>
    );
  }

  const cells = [
    {
      label: 'Agent 自愈重试',
      value: totalRetries,
      hint: 'finalize 校验失败 / fallback 模型',
    },
    {
      label: '章节重写',
      value: chapterRewrites,
      hint: 'Chapter Reviewer 评分 < 70 触发',
    },
    {
      label: 'Reviewer 重派',
      value: reviewerRevise,
      hint: 'Mission Reviewer 要求重写',
    },
    {
      label: 'Self-heal 任务',
      value: selfHeal,
      hint: '自愈生成的子任务',
    },
    {
      label: 'Leader 评审重派',
      value: leaderReplay,
      hint: 'S4 Leader 重新分配',
    },
  ].filter((c) => c.value > 0);

  return (
    <Card className="overflow-hidden" bordered>
      <div className="border-b border-amber-100 bg-amber-50/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <h3 className="text-sm font-semibold text-amber-800">
            返工 / 浪费分析
          </h3>
          <span className="text-xs text-amber-700/80">
            · 这些环节产生了额外的算力消耗
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3 md:grid-cols-3 lg:grid-cols-5">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-md border border-amber-100 bg-amber-50/30 p-2"
          >
            <p className="text-[10px] font-medium text-amber-700/80">
              {c.label}
            </p>
            <p className="mt-0.5 text-xl font-bold text-amber-700">{c.value}</p>
            <p className="mt-0.5 text-[10px] text-amber-700/60">{c.hint}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── 主组件 ──────────────────────────────────────────
export function ComputeUsagePanel({
  cost,
  agents,
  todos,
  dimensionPipelines,
}: Props) {
  const totalCalls = agents.reduce(
    (s, a) => s + a.trace.filter((t) => t.kind === 'action' && t.toolId).length,
    0
  );
  const totalLatency = agents.reduce(
    (s, a) =>
      s +
      a.trace
        .filter((t) => t.kind === 'action' && t.toolId)
        .reduce((s2, t) => s2 + (t.latencyMs ?? 0), 0),
    0
  );
  const avgLatency = totalCalls > 0 ? totalLatency / totalCalls : 0;
  const modelRows = buildModelDistribution(agents);
  const toolRows = buildToolStats(agents);

  return (
    <div className="space-y-4">
      <SummaryStrip
        totalTokens={cost.tokensUsed}
        costUsd={cost.costUsd}
        totalCalls={totalCalls}
        avgLatencyMs={avgLatency}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ModelDistributionTable rows={modelRows} />
        <StageBars cost={cost} />
      </div>
      <AgentInstanceTable agents={agents} />
      <ToolLatencyTable rows={toolRows} />
      <WasteAnalysis
        agents={agents}
        todos={todos}
        dimensionPipelines={dimensionPipelines}
      />
      <p className="text-[10px] text-gray-400">
        所有数字来自前端事件流推导。Cost 估算按 ~$3 / 1M tokens（混合模型）；以
        Credits 服务为准。
      </p>
    </div>
  );
}
