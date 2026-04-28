'use client';

/**
 * TodoDetailDrawer —— 单条 todo 的"完整故事"
 *
 * Header：
 *   - 4 层架构面包屑（AI-APP → AI-HARNESS → AI-ENGINE → AI-INFRA）
 *   - origin badge（Leader 拆维度 / Reviewer 重写 / Critic 警示...）
 *   - 起因（reasonText）
 *
 * Body：
 *   - 主时间线：narrativeLog 渲染为可读 timeline（人话，不是 JSON）
 *   - 产出物（artifacts）卡片化展示
 *   - 失败时优先显示失败原因
 *   - 底部 collapsed "开发者诊断视图"：原始 trace（仅在 agentRefId 命中 agent 时有内容）
 */

import React from 'react';
import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Loader2,
  CheckCircle2,
  X as XIcon,
  Lightbulb,
  AlertTriangle,
  Sparkles,
  RotateCcw,
  ScanSearch,
  ShieldAlert,
  PiggyBank,
  Database,
  ChevronRight,
  Info,
} from 'lucide-react';
import type {
  MissionTodo,
  MissionTodoNarrativeItem,
} from '@/lib/agent-playground/todo-ledger';
import { deriveLayerBreadcrumb } from '@/lib/agent-playground/todo-ledger';
import type {
  AgentLiveState,
  AgentTraceItem,
} from '@/lib/agent-playground/derive';
import {
  deriveDrawerSections,
  TOOL_LABEL,
} from '@/lib/agent-playground/drawer-derive';

interface Props {
  todo: MissionTodo | undefined;
  agents: AgentLiveState[];
  onClose: () => void;
}

const TONE_STYLE: Record<
  NonNullable<MissionTodoNarrativeItem['tone']>,
  { ring: string; bg: string; chip: string; Icon: typeof Info }
> = {
  info: {
    ring: 'ring-sky-200',
    bg: 'bg-sky-50/60',
    chip: 'bg-sky-100 text-sky-700',
    Icon: Info,
  },
  success: {
    ring: 'ring-emerald-200',
    bg: 'bg-emerald-50/60',
    chip: 'bg-emerald-100 text-emerald-700',
    Icon: CheckCircle2,
  },
  warn: {
    ring: 'ring-amber-200',
    bg: 'bg-amber-50/60',
    chip: 'bg-amber-100 text-amber-700',
    Icon: AlertTriangle,
  },
  error: {
    ring: 'ring-red-200',
    bg: 'bg-red-50/60',
    chip: 'bg-red-100 text-red-700',
    Icon: AlertTriangle,
  },
};

function originLabel(origin: MissionTodo['origin']): {
  label: string;
  cls: string;
} {
  const map: Record<MissionTodo['origin'], { label: string; cls: string }> = {
    'leader-plan': {
      label: 'Leader 拆维度',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-retry': {
      label: 'Leader 评审重派',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-replace': {
      label: 'Leader 换 spec',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-extend': {
      label: 'Leader 追加维度',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'leader-assess-abort': {
      label: 'Leader 放弃维度',
      cls: 'bg-amber-50 text-amber-700 ring-amber-200',
    },
    'leader-chat-create': {
      label: 'Leader Chat 追加',
      cls: 'bg-violet-50 text-violet-700 ring-violet-200',
    },
    'self-heal-retry': {
      label: '自愈重试',
      cls: 'bg-orange-50 text-orange-700 ring-orange-200',
    },
    'reviewer-revise': {
      label: 'Reviewer 重写',
      cls: 'bg-pink-50 text-pink-700 ring-pink-200',
    },
    'critic-blindspot': {
      label: 'Critic 警示',
      cls: 'bg-red-50 text-red-700 ring-red-200',
    },
    'reconciler-gap': {
      label: 'Reconciler 缺口',
      cls: 'bg-sky-50 text-sky-700 ring-sky-200',
    },
    'system-stage': {
      label: '系统阶段',
      cls: 'bg-gray-50 text-gray-700 ring-gray-200',
    },
  };
  return map[origin];
}

function statusBadge(status: MissionTodo['status']): {
  label: string;
  cls: string;
  Icon: typeof Loader2;
  spin?: boolean;
} {
  switch (status) {
    case 'done':
      return {
        label: '已完成',
        cls: 'text-emerald-700 bg-emerald-50 ring-emerald-200',
        Icon: CheckCircle2,
      };
    case 'in_progress':
      return {
        label: '进行中',
        cls: 'text-blue-700 bg-blue-50 ring-blue-200',
        Icon: Loader2,
        spin: true,
      };
    case 'failed':
      return {
        label: '失败',
        cls: 'text-red-700 bg-red-50 ring-red-200',
        Icon: XIcon,
      };
    case 'cancelled':
      return {
        label: '已放弃',
        cls: 'text-gray-600 bg-gray-100 ring-gray-200',
        Icon: XIcon,
      };
    case 'blocked':
      return {
        label: '阻塞',
        cls: 'text-amber-700 bg-amber-50 ring-amber-200',
        Icon: AlertTriangle,
      };
    default:
      return {
        label: '待生成',
        cls: 'text-gray-600 bg-gray-50 ring-gray-200',
        Icon: Loader2,
      };
  }
}

function roleIcon(role: string, className: string) {
  const Icon =
    role === 'leader'
      ? Brain
      : role === 'researcher'
        ? Search
        : role === 'analyst'
          ? GitBranch
          : role === 'writer'
            ? PenLine
            : role === 'reviewer' || role === 'critic'
              ? Gavel
              : role === 'reconciler'
                ? ScanSearch
                : role === 'mission'
                  ? Sparkles
                  : ShieldAlert;
  return <Icon className={className} />;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

/** 相对时间（相对 anchor），人话 +1.2s / +5m 32s */
function fmtRelative(ts: number, anchor: number): string {
  const ms = ts - anchor;
  if (ms < 0) return fmtTime(ts);
  if (ms < 1000) return `+${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `+${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  return `+${m}m ${rs}s`;
}

/**
 * 把长文本智能拆成结构化片段：
 * - 编号列表 "1) ... 2) ..." → bullet items
 * - 多行 → 段落
 * - 内嵌 URL → 链接化
 */
function splitNarrativeText(
  text: string
): { kind: 'p' | 'li'; text: string; idx?: string }[] {
  const trimmed = text.trim();
  // 如果包含 "N)" 或 "N、" 或 "N." 编号 → 拆 bullets
  const numbered = trimmed.match(/(?:^|\n|；|;)\s*(\d+)[)）.、]\s+/g);
  if (numbered && numbered.length >= 2) {
    const parts = trimmed.split(/(?<=^|\n|；|;)\s*(\d+)[)）.、]\s+/);
    const items: { kind: 'li'; text: string; idx?: string }[] = [];
    for (let i = 1; i < parts.length; i += 2) {
      const idx = parts[i];
      const body = (parts[i + 1] ?? '').trim();
      if (body) items.push({ kind: 'li', text: body, idx });
    }
    if (items.length > 0) return items;
  }
  // 多行 → 多段落
  const lines = trimmed
    .split(/\n\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length > 1)
    return lines.map((l) => ({ kind: 'p' as const, text: l }));
  return [{ kind: 'p', text: trimmed }];
}

/** 把 markdown link [text](url) + 裸 URL 转成 React node */
function linkify(text: string): React.ReactNode[] {
  // 先处理 markdown link
  const mdLink = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  const nodes: React.ReactNode[] = [];
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = mdLink.exec(text)) !== null) {
    if (m.index > lastIdx) {
      nodes.push(linkifyBare(text.slice(lastIdx, m.index), key++));
    }
    nodes.push(
      <a
        key={`md-${key++}`}
        href={m[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="text-violet-700 underline-offset-2 hover:underline"
      >
        {m[1]}
      </a>
    );
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push(linkifyBare(text.slice(lastIdx), key++));
  }
  return nodes;
}

function linkifyBare(text: string, baseKey: number): React.ReactNode {
  const urlRe = /(https?:\/\/[^\s)）]+)/g;
  const parts = text.split(urlRe);
  return (
    <React.Fragment key={`bare-${baseKey}`}>
      {parts.map((p, i) => {
        if (urlRe.test(p)) {
          urlRe.lastIndex = 0;
          return (
            <a
              key={i}
              href={p}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-violet-700 underline-offset-2 hover:underline"
            >
              {p.length > 50 ? p.slice(0, 50) + '…' : p}
            </a>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </React.Fragment>
  );
}

// ─── 时间线统一卡片：把 narrativeLog + trace action/observation 织成单一序列 ───

type TimelineCardKind =
  | 'narrative'
  | 'thought'
  | 'tool-call'
  | 'tool-result'
  | 'reflection'
  | 'finalize';

interface TimelineCard {
  kind: TimelineCardKind;
  ts: number;
  /** 给 narrative 用 */
  narrative?: MissionTodoNarrativeItem;
  /** 给 trace 用 */
  trace?: AgentTraceItem;
  /** 工具调用解包后的查询 */
  query?: string;
  /** observation 解出来的 search results */
  results?: { title?: string; url?: string; snippet?: string }[];
}

function buildTimelineCards(
  narrativeLog: readonly MissionTodoNarrativeItem[],
  trace: readonly AgentTraceItem[]
): TimelineCard[] {
  const cards: TimelineCard[] = [];
  for (const n of narrativeLog) {
    cards.push({ kind: 'narrative', ts: n.ts, narrative: n });
  }
  for (const t of trace) {
    if (t.kind === 'thought' && t.text && t.text.trim()) {
      cards.push({ kind: 'thought', ts: t.ts, trace: t });
    } else if (t.kind === 'action' && t.toolId) {
      const inp = (t.input ?? {}) as Record<string, unknown>;
      const query =
        typeof inp.query === 'string'
          ? inp.query
          : typeof inp.url === 'string'
            ? inp.url
            : undefined;
      if (t.toolId === 'finalize') {
        cards.push({ kind: 'finalize', ts: t.ts, trace: t });
      } else {
        cards.push({ kind: 'tool-call', ts: t.ts, trace: t, query });
      }
    } else if (t.kind === 'observation' && !t.error) {
      // 解 search results
      const collected: { title?: string; url?: string; snippet?: string }[] =
        [];
      const visit = (node: unknown) => {
        if (!node) return;
        if (typeof node === 'string') {
          const trimmed = node.trim();
          if (
            (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
            (trimmed.startsWith('[') && trimmed.endsWith(']'))
          ) {
            try {
              visit(JSON.parse(trimmed));
            } catch {
              /* ignore */
            }
          }
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(visit);
          return;
        }
        if (typeof node !== 'object') return;
        const o = node as Record<string, unknown>;
        if (typeof o.title === 'string' || typeof o.url === 'string') {
          collected.push({
            title: typeof o.title === 'string' ? o.title : undefined,
            url: typeof o.url === 'string' ? o.url : undefined,
            snippet:
              typeof o.snippet === 'string'
                ? o.snippet
                : typeof o.description === 'string'
                  ? o.description
                  : typeof o.content === 'string'
                    ? o.content.slice(0, 280)
                    : undefined,
          });
        }
        for (const k of [
          'results',
          'items',
          'hits',
          'output',
          'data',
          'preview',
        ]) {
          if (o[k] !== undefined) visit(o[k]);
        }
      };
      visit(t.output);
      cards.push({
        kind: 'tool-result',
        ts: t.ts,
        trace: t,
        results: collected.slice(0, 6),
      });
    } else if (t.kind === 'reflection' && t.text) {
      cards.push({ kind: 'reflection', ts: t.ts, trace: t });
    }
  }
  cards.sort((a, b) => a.ts - b.ts);
  return cards;
}

/** TI 配色：phase → bg/text/ring/Icon */
const KIND_STYLE: Record<
  TimelineCardKind,
  {
    bg: string;
    border: string;
    chip: string;
    iconBg: string;
    iconColor: string;
    label: string;
    Icon: typeof Brain;
  }
> = {
  thought: {
    bg: 'bg-purple-50/60',
    border: 'border-purple-200',
    chip: 'bg-purple-100 text-purple-700',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    label: '思考',
    Icon: Brain,
  },
  'tool-call': {
    bg: 'bg-blue-50/60',
    border: 'border-blue-200',
    chip: 'bg-blue-100 text-blue-700',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    label: '调用工具',
    Icon: Search,
  },
  'tool-result': {
    bg: 'bg-indigo-50/60',
    border: 'border-indigo-200',
    chip: 'bg-indigo-100 text-indigo-700',
    iconBg: 'bg-indigo-100',
    iconColor: 'text-indigo-600',
    label: '工具结果',
    Icon: Database,
  },
  reflection: {
    bg: 'bg-amber-50/60',
    border: 'border-amber-200',
    chip: 'bg-amber-100 text-amber-700',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-700',
    label: '反思',
    Icon: Lightbulb,
  },
  finalize: {
    bg: 'bg-emerald-50/70',
    border: 'border-emerald-300',
    chip: 'bg-emerald-100 text-emerald-700',
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
    label: '产出',
    Icon: CheckCircle2,
  },
  narrative: {
    bg: 'bg-sky-50/50',
    border: 'border-sky-200',
    chip: 'bg-sky-100 text-sky-700',
    iconBg: 'bg-sky-100',
    iconColor: 'text-sky-600',
    label: '进展',
    Icon: Info,
  },
};

function safeHostname(u: string): string | undefined {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

export function TodoDetailDrawer({ todo, agents, onClose }: Props) {
  if (!todo) return null;

  const origin = originLabel(todo.origin);
  const status = statusBadge(todo.status);
  const StatusIcon = status.Icon;
  const layers = deriveLayerBreadcrumb(todo);

  // 找到 agent trace（如果有 agentRefId）
  const linkedAgent = todo.agentRefId
    ? agents.find(
        (a) =>
          a.agentId === todo.agentRefId ||
          a.agentId.startsWith(`${todo.agentRefId}.`)
      )
    : todo.assignee.dimensionName
      ? agents.find(
          (a) =>
            a.role === 'researcher' &&
            a.dimension === todo.assignee.dimensionName
        )
      : undefined;

  const wallSec =
    todo.startedAt && todo.endedAt
      ? `${((todo.endedAt - todo.startedAt) / 1000).toFixed(1)}s`
      : todo.startedAt
        ? '运行中…'
        : '—';

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-xl flex-col overflow-hidden border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-4 py-3">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${origin.cls}`}
            >
              {origin.label}
            </span>
            <h3 className="mt-1 truncate text-base font-semibold text-gray-900">
              {todo.title}
            </h3>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {roleIcon(
                todo.assignee.role,
                'inline h-3 w-3 mr-1 align-middle text-gray-400'
              )}
              {todo.assignee.role}
              {todo.assignee.agentId ? ` · ${todo.assignee.agentId}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* 4-layer architecture breadcrumb */}
          <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-violet-50/40 to-purple-50/30 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
              4 层架构定位
            </p>
            <div className="flex flex-wrap items-center gap-1">
              {layers.map((l, i) => (
                <React.Fragment key={l.id}>
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] font-semibold text-violet-700">
                      {l.label}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {l.detail}
                    </span>
                  </div>
                  {i < layers.length - 1 && (
                    <ChevronRight className="h-3 w-3 text-gray-300" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* 4 stat cards */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                状态
              </p>
              <p
                className={`mt-0.5 inline-flex items-center gap-1 text-xs font-semibold`}
              >
                <StatusIcon
                  className={`h-3 w-3 ${status.spin ? 'animate-spin' : ''}`}
                />
                {status.label}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                耗时
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {wallSec}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 px-2 py-2">
              <p className="text-[9px] uppercase tracking-wide text-gray-500">
                叙事
              </p>
              <p className="font-mono mt-0.5 text-xs font-semibold text-gray-900">
                {todo.narrativeLog.length} 条
              </p>
            </div>
          </div>

          {/* Reason */}
          {todo.reasonText && (
            <div className="rounded-lg border border-violet-100 bg-violet-50/40 px-3 py-2">
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                起因
              </p>
              <p className="text-[12px] leading-relaxed text-gray-800">
                {todo.reasonText}
              </p>
            </div>
          )}

          {/* Artifacts */}
          {todo.artifacts.length > 0 && (
            <section className="rounded-lg border border-gray-100 bg-white">
              <div className="border-b border-gray-100 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                  产出物 · {todo.artifacts.length}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5 p-2">
                {todo.artifacts.map((a, i) => (
                  <span
                    key={`${a.kind}-${i}`}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200"
                  >
                    <span className="text-emerald-600/70">{a.label}</span>
                    {a.value !== undefined && (
                      <span className="font-mono font-semibold text-emerald-900">
                        {a.value}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* 关键发现 / 工具使用 / 引用来源 三段结构化派生 */}
          {linkedAgent &&
            (() => {
              const d = deriveDrawerSections(linkedAgent);
              return (
                <>
                  {d.findings.length > 0 && (
                    <section className="rounded-lg border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-teal-50/40">
                      <div className="border-b border-emerald-100 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                          ⭐ 关键发现 · {d.findings.length} 条
                        </p>
                      </div>
                      <ol className="space-y-2 p-3">
                        {d.findings.map((f, i) => (
                          <li
                            key={i}
                            className="rounded-md bg-white px-3 py-2 ring-1 ring-emerald-100"
                          >
                            <div className="flex items-start gap-2">
                              <span className="font-mono mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-[12.5px] font-medium leading-relaxed text-gray-900">
                                  {f.claim}
                                </p>
                                {f.evidence && (
                                  <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                                    {f.evidence}
                                  </p>
                                )}
                                {f.source && (
                                  <a
                                    href={
                                      /^https?:\/\//i.test(f.source)
                                        ? f.source
                                        : '#'
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-mono mt-1 inline-flex items-center gap-1 break-all text-[10px] text-violet-700 hover:underline"
                                  >
                                    🔗{' '}
                                    {safeHostname(f.source) ??
                                      f.source.slice(0, 60)}
                                  </a>
                                )}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}

                  {d.toolUsage.length > 0 && (
                    <section className="rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50/60 to-purple-50/30 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <Search className="h-3.5 w-3.5 text-blue-600" />
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-700">
                          使用工具 · {d.toolUsage.length} 个
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {d.toolUsage.map((tu) => {
                          const meta = TOOL_LABEL[tu.toolId] ?? {
                            label: tu.toolId,
                            emoji: '🔧',
                          };
                          return (
                            <span
                              key={tu.toolId}
                              className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-blue-700 ring-1 ring-blue-200"
                              title={tu.samples.join('\n')}
                            >
                              <span>{meta.emoji}</span>
                              <span>{meta.label}</span>
                              <span className="rounded bg-blue-100 px-1.5 text-[10px] font-bold">
                                ×{tu.callCount}
                              </span>
                            </span>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {d.sources.length > 0 && (
                    <section className="rounded-lg border border-gray-100 bg-white">
                      <div className="border-b border-gray-100 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                          引用来源 · {d.sources.length} 个唯一 URL
                        </p>
                      </div>
                      <ul className="max-h-56 space-y-1 overflow-y-auto p-2">
                        {d.sources.slice(0, 12).map((s, i) => (
                          <li
                            key={`${s.url}-${i}`}
                            className="rounded-md px-2 py-1.5 hover:bg-violet-50/40"
                          >
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block min-w-0"
                            >
                              <p className="truncate text-[11.5px] font-medium text-gray-800 group-hover:text-violet-700">
                                {s.title ?? s.url}
                              </p>
                              <p className="font-mono mt-0.5 truncate text-[10px] text-gray-400">
                                {s.domain ?? s.url}{' '}
                                {s.hits > 1 && (
                                  <span className="text-violet-500">
                                    · 引用 {s.hits} 次
                                  </span>
                                )}
                              </p>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </>
              );
            })()}

          {/* 完整时间线 —— 卡片式呈现 narrativeLog + trace events */}
          <section className="rounded-lg border border-gray-100 bg-white">
            <div className="border-b border-gray-100 px-3 py-2">
              {(() => {
                const cards = buildTimelineCards(
                  todo.narrativeLog,
                  linkedAgent?.trace ?? []
                );
                return (
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-700">
                    完整时间线 · {cards.length} 个事件
                  </p>
                );
              })()}
            </div>
            {(() => {
              const cards = buildTimelineCards(
                todo.narrativeLog,
                linkedAgent?.trace ?? []
              );
              const anchor = todo.startedAt ?? todo.createdAt;
              if (cards.length === 0) {
                return (
                  <p className="px-3 py-4 text-center text-[11px] text-gray-500">
                    {todo.status === 'pending'
                      ? '该任务尚未启动'
                      : '等待事件流入…'}
                  </p>
                );
              }
              return (
                <ol className="relative space-y-0 p-3 pl-9">
                  <span
                    className="absolute bottom-3 left-[20px] top-3 w-0.5 bg-gradient-to-b from-purple-200 via-blue-200 to-emerald-100"
                    aria-hidden="true"
                  />
                  {cards.map((c, i) => {
                    const style = KIND_STYLE[c.kind];
                    const Icon = style.Icon;
                    return (
                      <li
                        key={`${c.ts}-${i}`}
                        className="relative pb-3 last:pb-0"
                      >
                        <span
                          className={`absolute -left-[28px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${style.iconBg}`}
                        >
                          <Icon className={`h-3 w-3 ${style.iconColor}`} />
                        </span>
                        <div
                          className={`rounded-lg border ${style.border} ${style.bg}`}
                        >
                          <div className="flex flex-wrap items-center gap-2 border-b border-black/5 px-3 py-1.5">
                            <span
                              className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.chip}`}
                            >
                              {style.label}
                            </span>
                            {c.kind === 'tool-call' && c.trace?.toolId && (
                              <span className="font-mono inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-blue-100">
                                {TOOL_LABEL[c.trace.toolId]?.emoji ?? '🔧'}{' '}
                                {TOOL_LABEL[c.trace.toolId]?.label ??
                                  c.trace.toolId}
                              </span>
                            )}
                            {c.kind === 'tool-result' &&
                              (c.results?.length ?? 0) > 0 && (
                                <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-100">
                                  {c.results!.length} 条结果
                                </span>
                              )}
                            {c.trace?.tokensUsed != null &&
                              c.trace.tokensUsed > 0 && (
                                <span className="font-mono text-[10px] text-gray-500">
                                  +{c.trace.tokensUsed}tk
                                </span>
                              )}
                            {c.trace?.latencyMs != null && (
                              <span className="font-mono text-[10px] text-gray-500">
                                {c.trace.latencyMs}ms
                              </span>
                            )}
                            <span className="ml-auto flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-semibold text-gray-600">
                                {fmtRelative(c.ts, anchor)}
                              </span>
                              <span className="font-mono text-[9px] text-gray-400">
                                {fmtTime(c.ts)}
                              </span>
                            </span>
                          </div>
                          <div className="space-y-1.5 px-3 py-2">
                            {c.kind === 'narrative' &&
                              c.narrative &&
                              (() => {
                                const segs = splitNarrativeText(
                                  c.narrative.text
                                );
                                return segs.length === 1 ? (
                                  <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-gray-800">
                                    {linkify(segs[0].text)}
                                  </p>
                                ) : (
                                  <ul className="space-y-1 text-[12px] leading-relaxed text-gray-800">
                                    {segs.map((seg, si) => (
                                      <li key={si} className="flex gap-2">
                                        <span className="font-mono text-[10px] text-gray-400">
                                          {seg.kind === 'li'
                                            ? `${seg.idx}.`
                                            : '·'}
                                        </span>
                                        <span className="flex-1 whitespace-pre-wrap break-words">
                                          {linkify(seg.text)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                );
                              })()}
                            {c.kind === 'thought' && c.trace?.text && (
                              <p className="whitespace-pre-wrap text-[12px] italic leading-relaxed text-purple-900">
                                💭 {c.trace.text}
                              </p>
                            )}
                            {c.kind === 'tool-call' && c.query && (
                              <p className="font-mono break-words text-[11.5px] leading-relaxed text-blue-900">
                                <span className="text-blue-500">▸</span>{' '}
                                {c.query}
                              </p>
                            )}
                            {c.kind === 'tool-result' &&
                              c.results &&
                              c.results.length > 0 && (
                                <ul className="space-y-1.5">
                                  {c.results.slice(0, 4).map((r, ri) => (
                                    <li
                                      key={ri}
                                      className="rounded-md bg-white px-2 py-1.5 ring-1 ring-indigo-100"
                                    >
                                      <a
                                        href={r.url ?? '#'}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block min-w-0"
                                      >
                                        <p className="truncate text-[11.5px] font-medium text-gray-800 hover:text-violet-700">
                                          {r.title ?? r.url ?? '(无标题)'}
                                        </p>
                                        {r.url && (
                                          <p className="font-mono truncate text-[10px] text-gray-400">
                                            {safeHostname(r.url) ?? r.url}
                                          </p>
                                        )}
                                        {r.snippet && (
                                          <p className="mt-0.5 line-clamp-2 text-[10.5px] leading-relaxed text-gray-600">
                                            {r.snippet}
                                          </p>
                                        )}
                                      </a>
                                    </li>
                                  ))}
                                  {c.results.length > 4 && (
                                    <li className="text-center text-[10px] text-gray-400">
                                      … 还有 {c.results.length - 4} 条
                                    </li>
                                  )}
                                </ul>
                              )}
                            {c.kind === 'reflection' && c.trace?.text && (
                              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-amber-900">
                                ✨ {c.trace.text}
                              </p>
                            )}
                            {c.kind === 'finalize' && (
                              <p className="text-[12px] font-medium text-emerald-800">
                                ✓ 任务产出已完成（详见上方"关键发现"）
                              </p>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              );
            })()}
          </section>

          {/* 失败原因优先显示 */}
          {todo.status === 'failed' && linkedAgent?.failureMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-red-700">
                <AlertTriangle className="h-3.5 w-3.5" />
                失败原因（来自 agent lifecycle）
              </p>
              <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-red-800">
                {linkedAgent.failureMessage}
              </p>
            </div>
          )}

          {/* 子任务（如果有 children） */}
          {/* 子任务由父级 board 直接负责渲染 + 缩进，此处不再重复 */}

          {/* 开发者诊断视图：原始 trace (collapsed) */}
          {linkedAgent && linkedAgent.trace.length > 0 && (
            <details className="group rounded-lg border border-gray-200 bg-gray-50/40">
              <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 hover:bg-gray-100">
                <Lightbulb className="h-3.5 w-3.5" />
                开发者诊断视图 · 原始 ReAct trace · {
                  linkedAgent.trace.length
                }{' '}
                条
              </summary>
              <ul className="space-y-1.5 p-2">
                {linkedAgent.trace.map((t, i) => {
                  const dump = (v: unknown): string | null => {
                    if (v == null) return null;
                    if (typeof v === 'string') return v;
                    try {
                      return JSON.stringify(v, null, 2);
                    } catch {
                      return String(v);
                    }
                  };
                  const inputStr = dump(t.input);
                  const outputStr = dump(t.output);
                  return (
                    <li
                      key={`${t.ts}-${i}`}
                      className={`rounded-md px-2 py-1.5 text-[11px] leading-relaxed ${
                        t.kind === 'thought'
                          ? 'bg-amber-50 text-amber-900'
                          : t.kind === 'action'
                            ? 'bg-violet-50 text-violet-900'
                            : t.kind === 'observation'
                              ? t.error
                                ? 'bg-red-50 text-red-900'
                                : 'bg-sky-50 text-sky-900'
                              : t.kind === 'reflection'
                                ? 'bg-purple-50 text-purple-900'
                                : 'bg-red-50 text-red-900'
                      }`}
                    >
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-semibold">{t.kind}</span>
                        {t.toolId && (
                          <span className="font-mono rounded bg-white/60 px-1.5 text-[10px]">
                            {t.toolId}
                          </span>
                        )}
                        {t.latencyMs != null && (
                          <span className="font-mono text-[10px] opacity-60">
                            {t.latencyMs}ms
                          </span>
                        )}
                        {t.tokensUsed != null && t.tokensUsed > 0 && (
                          <span className="font-mono text-[10px] opacity-60">
                            +{t.tokensUsed}tk
                          </span>
                        )}
                      </div>
                      {t.text && (
                        <p className="mt-1 whitespace-pre-wrap break-words">
                          {t.text}
                        </p>
                      )}
                      {inputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ input
                          </summary>
                          <pre className="font-mono mt-1 max-h-64 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {inputStr.length > 6000
                              ? inputStr.slice(0, 6000) + '\n…(已截断)'
                              : inputStr}
                          </pre>
                        </details>
                      )}
                      {outputStr && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-[10px] opacity-70 hover:opacity-100">
                            ▸ output
                          </summary>
                          <pre className="font-mono mt-1 max-h-64 overflow-auto rounded bg-white/60 p-1.5 text-[10px] text-gray-700">
                            {outputStr.length > 6000
                              ? outputStr.slice(0, 6000) + '\n…(已截断)'
                              : outputStr}
                          </pre>
                        </details>
                      )}
                      {t.error && (
                        <p className="mt-1 whitespace-pre-wrap break-words font-medium">
                          ⚠{' '}
                          {t.error.length > 400
                            ? t.error.slice(0, 400) + '…'
                            : t.error}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
