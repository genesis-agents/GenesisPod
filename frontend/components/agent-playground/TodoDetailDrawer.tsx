'use client';

/**
 * TodoDetailDrawer —— 单条 todo 的"完整故事"
 *
 * 信息架构（自上而下，遵循"采集 → 综合 → 评审"的真实流水线顺序）：
 *   Header        : origin badge + title + role
 *   Layer strip   : AI-APP → AI-HARNESS → AI-ENGINE → AI-INFRA（紧凑 chip）
 *   Stats         : 状态 / 耗时 / Tokens / 工具调用
 *   Reason        : 任务起因（reasonText）
 *   Failure       : 失败原因（仅 failed）
 *   关键发现       : findings 卡片（编号 + claim + evidence + source）  ← 采集结果摘要
 *   使用工具       : ToolBadge chips                                    ← 采集手段
 *   引用来源       : 去重 URL 列表                                       ← 采集材料
 *   完整时间线     : 默认折叠，narrative + thought + tool-call + tool-result 卡  ← 采集过程
 *   章节进度       : chapter pipeline 状态卡                             ← 综合（章节撰写）
 *   维度评分       : 5-axis grade                                        ← 评审（章节复审/维度打分）
 *   开发者诊断     : 默认折叠，原始 ReAct trace JSON
 *
 * 全程使用 playground-ui primitives + design tokens，禁止再写裸 Tailwind chip。
 */

import React, { useState } from 'react';
import { X as XIcon, ChevronRight, Lightbulb, RefreshCw } from 'lucide-react';
import { localRerunTodo } from '@/services/agent-playground/api';
import { cn } from '@/lib/utils/common';
import type {
  MissionTodo,
  MissionTodoNarrativeItem,
} from '@/lib/agent-playground/todo-ledger';
import { deriveLayerBreadcrumb } from '@/lib/agent-playground/todo-ledger';
import type {
  AgentLiveState,
  AgentTraceItem,
  DimensionPipelineState,
} from '@/lib/agent-playground/derive';
import { deriveDrawerSections } from '@/lib/agent-playground/drawer-derive';
import {
  Card,
  Section,
  StatusPill,
  RoleChip,
  MetricStat,
  ToolBadge,
  ToneCard,
  SourceLink,
  ExpandableText,
  linkifyText,
} from '@/components/playground-ui';
import {
  roleToken,
  toneToken,
  type ToneKey,
  type RoleKey,
} from '@/lib/playground-design/tokens';

interface Props {
  todo: MissionTodo | undefined;
  agents: AgentLiveState[];
  dimensionPipelines?: Map<string, DimensionPipelineState>;
  /** 全量 todos 列表 — 用于 dim 父级 drawer 展示「本维度被 Leader 要求修改了什么」 */
  allTodos?: MissionTodo[];
  onClose: () => void;
  /** 单 todo 重跑 —— 仅 mission 终态 + 非 abort/persist origin 时启用 */
  missionId?: string;
  missionTerminal?: boolean;
}

// ─── Origin label ────────────────────────────────────
const ORIGIN_LABEL: Record<
  MissionTodo['origin'],
  { label: string; cls: string }
> = {
  'leader-plan': {
    label: '维度规划',
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
    label: 'Leader 追加',
    cls: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
  'leader-assess-abort': {
    label: 'Leader 放弃',
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
    cls: 'bg-rose-50 text-rose-700 ring-rose-200',
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

// ─── Time helpers ─────────────────────────────────────
function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

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

function fmtDuration(startedAt?: number, endedAt?: number): string {
  if (!startedAt) return '—';
  const end = endedAt ?? Date.now();
  const ms = end - startedAt;
  if (ms < 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

// ─── Status mapping ───────────────────────────────────
function todoStatusToToken(s: MissionTodo['status']) {
  return s === 'done'
    ? 'done'
    : s === 'in_progress'
      ? 'running'
      : s === 'failed'
        ? 'failed'
        : s === 'cancelled'
          ? 'cancelled'
          : s === 'blocked'
            ? 'blocked'
            : 'pending';
}

// ─── Timeline cards ──────────────────────────────────
type TimelineKind =
  | 'narrative'
  | 'thought'
  | 'tool-call'
  | 'parallel-tool-call'
  | 'tool-result'
  | 'reflection'
  | 'finalize';

interface ParallelSubCall {
  toolId: string;
  query?: string;
}

interface TimelineEntry {
  kind: TimelineKind;
  ts: number;
  narrative?: MissionTodoNarrativeItem;
  trace?: AgentTraceItem;
  query?: string;
  subCalls?: ParallelSubCall[];
  results?: { title?: string; url?: string; snippet?: string }[];
  resultToolId?: string;
  /** ★ P0-LIVE-UI-TOOL-ERR (2026-04-30): tool 失败时的明细原因 */
  toolError?: string;
  /** 失败的子调用列表（parallel_tool_call 中部分失败时） */
  toolErrors?: { toolId?: string; url?: string; error: string }[];
  /**
   * ★ P0-LIVE-UI-TOOL-EMPTY (2026-04-30): 当 collectResultsDeep 提取不到结构化
   * results 也无 error，但 output 里其实有 markdown/text 内容（比如 scrape tool
   * 返回 {markdown}）时，存这里做兜底"raw 内容预览"，让用户至少看到抓到了什么。
   */
  rawOutputPreview?: string;
  /** 调用时的 URL（从 trace.input.url 抽出），用于让 tool-call query 可点击 */
  callUrl?: string;
}

/**
 * 简单 URL 检测：以 http/https 开头 + 至少一个非空字符。
 */
function looksLikeUrl(s: string | undefined): boolean {
  return !!s && /^https?:\/\/\S+$/i.test(s.trim());
}

/**
 * 从 output 抽人类友好的"结论摘要"。
 *
 * 输出策略（按优先级）：
 *   1) outcome / conclusion / summary / answer / verdict 字段（工具自己给的结论）
 *   2) results[] 命中数 + 首条标题 + 来源域名 → "命中 N 条 · 首条：{title} ({domain}) / Matched N · top: ..."
 *   3) 大段文本字段 (markdown / content / text / body) 截前 500
 *   4) note / message / reason 字段 → 双语化（已知模式翻译）
 *   5) success/ok flag → "成功未匹配 · No matches" / "失败 · Failed"
 *   6) 兜底：undefined（不展示 raw JSON）
 *
 * 双语原则：英文工具消息保留原文 + 附中文翻译；中文 note 保留原文 + 附英文。
 */
function extractRawOutputPreview(output: unknown): string | undefined {
  if (!output) return undefined;
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (trimmed.length === 0) return undefined;
    return trimmed.slice(0, 500);
  }
  if (typeof output !== 'object') return undefined;
  const o = output as Record<string, unknown>;

  // 1) 工具自报结论字段
  for (const key of ['outcome', 'conclusion', 'summary', 'answer', 'verdict']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim().slice(0, 500);
    }
  }

  // 2) results[] 结构化命中
  if (Array.isArray(o.results) && o.results.length > 0) {
    const total =
      typeof o.totalResults === 'number'
        ? o.totalResults
        : (o.results as unknown[]).length;
    const first = (o.results as unknown[])[0] as
      | Record<string, unknown>
      | undefined;
    const firstTitle =
      typeof first?.title === 'string' && first.title.trim()
        ? first.title.trim()
        : typeof first?.heading === 'string' && first.heading.trim()
          ? first.heading.trim()
          : undefined;
    const firstUrl = typeof first?.url === 'string' ? first.url : undefined;
    const domain = firstUrl ? safeDomain(firstUrl) : undefined;
    const zh = `命中 ${total} 条结果${
      firstTitle
        ? ` · 首条：「${firstTitle.slice(0, 60)}」${domain ? `（${domain}）` : ''}`
        : ''
    }`;
    const en = `Matched ${total} result${total > 1 ? 's' : ''}${
      firstTitle
        ? ` · top: "${firstTitle.slice(0, 60)}"${domain ? ` (${domain})` : ''}`
        : ''
    }`;
    return `${zh}\n${en}`;
  }

  // 3) 大段文本字段
  for (const key of ['markdown', 'content', 'text', 'body', 'html']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return v.trim().slice(0, 500);
    }
  }

  // 4) note / message / reason → 双语化
  for (const key of ['note', 'message', 'reason', 'description']) {
    const v = o[key];
    if (typeof v === 'string' && v.trim().length > 0) {
      return bilingualizeToolNote(v.trim());
    }
  }

  // 5) success/ok flag 兜底叙述
  if (typeof o.success === 'boolean' || typeof o.ok === 'boolean') {
    const ok = o.success === true || o.ok === true;
    const total =
      typeof o.totalResults === 'number'
        ? o.totalResults
        : Array.isArray(o.results)
          ? (o.results as unknown[]).length
          : undefined;
    if (ok && total === 0)
      return '调用成功但未匹配到结果\nSucceeded but matched 0 results';
    if (ok && typeof total === 'number')
      return `调用成功，命中 ${total} 条\nSucceeded · matched ${total} result${total > 1 ? 's' : ''}`;
    if (!ok) return '调用未成功\nCall did not succeed';
  }

  // 6) 兜底：不展示 raw JSON
  return undefined;
}

/** 提取 URL 域名，失败返回 undefined */
function safeDomain(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

/**
 * 把工具 note 双语呈现：已知英文模式 → 中英对照；其它原文 + 一句标签。
 *   "no knowledgeBaseId provided -- caller should fall back to web-search"
 *     → "未指定知识库，已切换到网页搜索 / No KB specified, fell back to web search"
 */
function bilingualizeToolNote(note: string): string {
  const lower = note.toLowerCase();
  if (
    lower.includes('no knowledgebaseid') ||
    lower.includes('fall back to web-search') ||
    lower.includes('fall back to web search')
  ) {
    return '未指定知识库，已自动切换到网页搜索\nNo knowledge base specified, fell back to web search';
  }
  if (lower.includes('rate limit') || lower.includes('rate-limit')) {
    return '调用被限流，已稍后重试\nRate limited, retrying';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return '调用超时\nCall timed out';
  }
  if (lower.includes('not found') || lower.includes('404')) {
    return '未找到匹配的资源\nResource not found';
  }
  if (lower.includes('forbidden') || lower.includes('403')) {
    return '访问被拒绝（403）\nAccess forbidden (403)';
  }
  if (lower.includes('unauthor') || lower.includes('401')) {
    return '未授权（401）\nUnauthorized (401)';
  }
  if (lower.includes('quota') || lower.includes('insufficient')) {
    return '配额不足\nQuota exhausted';
  }
  // 未识别的 note 原文返回 + 限长（已是人话不强翻）
  return note.slice(0, 240);
}

/**
 * 同时收集 tool errors（success===false 或 error 字段非空时的 message）。
 * 让 UI 在 results 为空时仍能展示具体失败原因，而不是 generic"未返回任何内容"。
 */
function collectToolErrorsDeep(
  node: unknown
): { toolId?: string; url?: string; error: string }[] {
  const out: { toolId?: string; url?: string; error: string }[] = [];
  const visit = (n: unknown, ctxToolId?: string) => {
    if (!n) return;
    if (typeof n !== 'object') return;
    if (Array.isArray(n)) {
      n.forEach((x) => visit(x, ctxToolId));
      return;
    }
    const o = n as Record<string, unknown>;
    const tid =
      typeof o.toolId === 'string'
        ? o.toolId
        : typeof o.tool === 'string'
          ? o.tool
          : ctxToolId;
    const err = typeof o.error === 'string' ? o.error : undefined;
    const success = typeof o.success === 'boolean' ? o.success : undefined;
    const url = typeof o.url === 'string' ? o.url : undefined;
    if (err && (success === false || success === undefined)) {
      out.push({ toolId: tid, url, error: err });
    }
    for (const k of ['output', 'subResults', 'data']) {
      if (o[k] !== undefined) visit(o[k], tid);
    }
  };
  visit(node);
  return out;
}

function collectResultsDeep(
  node: unknown
): { title?: string; url?: string; snippet?: string }[] {
  const out: { title?: string; url?: string; snippet?: string }[] = [];
  const regexExtract = (s: string) => {
    const titleRe = /"title"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const urlRe = /"url"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
    const contentRe =
      /"(?:content|snippet|description)"\s*:\s*"((?:[^"\\]|\\.){0,400})"/g;
    const titles = [...s.matchAll(titleRe)].map((m) => m[1]);
    const urls = [...s.matchAll(urlRe)].map((m) => m[1]);
    const contents = [...s.matchAll(contentRe)].map((m) => m[1]);
    const n = Math.max(titles.length, urls.length);
    for (let i = 0; i < n; i++) {
      if (titles[i] || urls[i]) {
        out.push({ title: titles[i], url: urls[i], snippet: contents[i] });
      }
    }
  };
  const visit = (n: unknown) => {
    if (!n) return;
    if (typeof n === 'string') {
      const trimmed = n
        .trim()
        .replace(/…$/, '')
        .replace(/\.\.\.$/, '');
      if (
        (trimmed.startsWith('{') || trimmed.startsWith('[')) &&
        (trimmed.endsWith('}') || trimmed.endsWith(']'))
      ) {
        try {
          visit(JSON.parse(trimmed));
        } catch {
          regexExtract(trimmed);
        }
      } else if (trimmed.includes('"title"') || trimmed.includes('"url"')) {
        regexExtract(trimmed);
      }
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(visit);
      return;
    }
    if (typeof n !== 'object') return;
    const o = n as Record<string, unknown>;
    // ★ 2026-04-30: 扩展识别 researcher findings 格式（{claim, evidence, source}）+
    //   通用 url 字段名（source / sourceUrl / link / href）+ title 字段名（claim / heading / name）
    const titleField =
      typeof o.title === 'string'
        ? o.title
        : typeof o.heading === 'string'
          ? o.heading
          : typeof o.claim === 'string'
            ? o.claim
            : typeof o.name === 'string'
              ? o.name
              : undefined;
    const urlField =
      typeof o.url === 'string'
        ? o.url
        : typeof o.sourceUrl === 'string'
          ? o.sourceUrl
          : typeof o.link === 'string'
            ? o.link
            : typeof o.href === 'string'
              ? o.href
              : typeof o.source === 'string' &&
                  /^https?:\/\//i.test(o.source.trim())
                ? o.source.trim()
                : undefined;
    const snippetField =
      typeof o.snippet === 'string'
        ? o.snippet
        : typeof o.description === 'string'
          ? o.description
          : typeof o.content === 'string'
            ? o.content
            : typeof o.evidence === 'string'
              ? o.evidence
              : typeof o.summary === 'string'
                ? o.summary
                : undefined;
    if (titleField || urlField) {
      out.push({
        title: titleField,
        url: urlField,
        snippet: snippetField,
      });
    }
    for (const k of [
      'results',
      'items',
      'hits',
      'output',
      'data',
      'preview',
      'subResults',
      // ★ researcher tool 输出
      'findings',
      'sources',
      // ★ rag-search 工具命中
      'matches',
      'documents',
    ]) {
      if (o[k] !== undefined) visit(o[k]);
    }
  };
  visit(node);
  return out;
}

function buildTimeline(
  narrativeLog: readonly MissionTodoNarrativeItem[],
  trace: readonly AgentTraceItem[]
): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  for (const n of narrativeLog) {
    out.push({ kind: 'narrative', ts: n.ts, narrative: n });
  }
  for (const t of trace) {
    if (t.kind === 'thought' && t.text && t.text.trim()) {
      out.push({ kind: 'thought', ts: t.ts, trace: t });
    } else if (t.kind === 'action' && t.toolId) {
      if (t.toolId === 'finalize') {
        // finalize 不另起卡（产出已在"关键发现"展示）—— 跳过
        continue;
      }
      if (t.toolId === 'parallel_tool_call' && Array.isArray(t.input)) {
        const subCalls: ParallelSubCall[] = [];
        for (const sub of t.input as unknown[]) {
          if (!sub || typeof sub !== 'object') continue;
          const o = sub as Record<string, unknown>;
          const subToolId =
            typeof o.toolId === 'string'
              ? o.toolId
              : typeof o.tool === 'string'
                ? o.tool
                : 'unknown';
          const inp = (o.input ?? {}) as Record<string, unknown>;
          const query =
            typeof inp.query === 'string'
              ? inp.query
              : typeof inp.url === 'string'
                ? inp.url
                : undefined;
          subCalls.push({ toolId: subToolId, query });
        }
        out.push({ kind: 'parallel-tool-call', ts: t.ts, trace: t, subCalls });
      } else {
        const inp = (t.input ?? {}) as Record<string, unknown>;
        const query =
          typeof inp.query === 'string'
            ? inp.query
            : typeof inp.url === 'string'
              ? inp.url
              : undefined;
        const callUrl =
          typeof inp.url === 'string' && looksLikeUrl(inp.url)
            ? inp.url
            : looksLikeUrl(query)
              ? query
              : undefined;
        out.push({ kind: 'tool-call', ts: t.ts, trace: t, query, callUrl });
      }
    } else if (t.kind === 'observation') {
      // 跳过 finalize 的 observation（产出在 findings）
      if (t.toolId === 'finalize') continue;
      // ★ P0-LIVE-UI-TOOL-ERR (2026-04-30): observation 自带 error 时之前直接
      //   skip 了整个 entry，UI 看不到任何信息。改为照常 push tool-result，
      //   把 error 透传到 toolError 字段；同时从 output 里递归提取 success:false
      //   子调用错误（parallel_tool_call 部分失败的情形）。
      const results = collectResultsDeep(t.output);
      const subErrors = collectToolErrorsDeep(t.output);
      const topError = t.error
        ? typeof t.error === 'string'
          ? t.error
          : ((t.error as { message?: string }).message ?? undefined)
        : undefined;
      const rawOutputPreview =
        results.length === 0 && !topError && subErrors.length === 0
          ? extractRawOutputPreview(t.output)
          : undefined;
      out.push({
        kind: 'tool-result',
        ts: t.ts,
        trace: t,
        results,
        resultToolId: t.toolId,
        toolError: topError,
        toolErrors: subErrors.length > 0 ? subErrors : undefined,
        rawOutputPreview,
      });
    } else if (t.kind === 'reflection' && t.text) {
      out.push({ kind: 'reflection', ts: t.ts, trace: t });
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

const KIND_TONE: Record<TimelineKind, ToneKey> = {
  narrative: 'info',
  thought: 'info',
  'tool-call': 'info',
  'parallel-tool-call': 'info',
  'tool-result': 'neutral',
  reflection: 'warn',
  finalize: 'success',
};

const KIND_LABEL: Record<TimelineKind, string> = {
  narrative: '进展',
  thought: '思考',
  'tool-call': '调用工具',
  'parallel-tool-call': '并发调用',
  'tool-result': '工具结果',
  reflection: '反思',
  finalize: '产出',
};

// ─── Main component ───────────────────────────────────
export function TodoDetailDrawer({
  todo,
  agents,
  dimensionPipelines,
  allTodos,
  onClose,
  missionId,
  missionTerminal,
}: Props) {
  const [showTimeline, setShowTimeline] = useState(true);
  const [showDiag, setShowDiag] = useState(false);
  const [rerunning, setRerunning] = useState(false);

  if (!todo) return null;

  // ★ 2026-04-30 (B 路线): 重跑按钮只在 v1 真实支持的 scope 显示，避免误导。
  //   v1 真实支持: system:s9b（10 维客观评审局部重跑，不创建新 mission）
  //   其它 scope（dimension / chapter / s10 / retry todo 等）当前不显示重跑按钮 ——
  //   避免点了走老 rerunTodo 创建新 mission，这违反"按钮意图 = 局部重跑"的语义。
  //   v1.1 扩容 chapter / dimension 后会扩展此处的 supportsLocalRerun 判定。
  const supportsLocalRerun =
    todo.scope === 'system' && todo.id.endsWith('s9b-objective-evaluation');

  const canRerun =
    !!(missionId && missionTerminal) &&
    todo.systemStageId !== 's11-persist' &&
    todo.origin !== 'leader-assess-abort' &&
    supportsLocalRerun &&
    (todo.status === 'done' ||
      todo.status === 'failed' ||
      todo.status === 'cancelled');

  const handleRerun = async () => {
    if (!missionId || rerunning || !supportsLocalRerun) return;
    setRerunning(true);
    try {
      // 局部重跑：不跳转，保留在原 mission detail 页（mission:rerun-completed
      // 事件会触发 page.tsx re-fetch persisted）
      await localRerunTodo(missionId, todo.id, {
        origin: todo.origin,
        scope: todo.scope,
        dimensionRef: todo.dimensionRef,
        todoTitle: todo.title,
        reasonText: todo.reasonText,
      });
      setRerunning(false);
    } catch (e) {
      window.alert(`重跑失败：${e instanceof Error ? e.message : String(e)}`);
      setRerunning(false);
    }
  };

  const origin = ORIGIN_LABEL[todo.origin];
  const layers = deriveLayerBreadcrumb(todo);
  const statusKey = todoStatusToToken(todo.status);

  // Linked agent
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

  const sections = deriveDrawerSections(linkedAgent);
  const timeline = buildTimeline(todo.narrativeLog, linkedAgent?.trace ?? []);
  const anchor = todo.startedAt ?? todo.createdAt;

  // 计数
  const totalToolCalls = sections.toolUsage.reduce(
    (s, t) => s + t.callCount,
    0
  );

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-gray-200 bg-gray-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Header ─── */}
        <header className="flex items-start justify-between border-b border-gray-200 bg-white px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                  origin.cls
                )}
              >
                {origin.label}
              </span>
              <RoleChip
                role={todo.assignee.role}
                agentId={todo.assignee.agentId}
                size="xs"
              />
            </div>
            <h2 className="mt-1 truncate text-base font-semibold text-gray-900">
              {todo.title}
            </h2>
          </div>
          <div className="ml-3 flex items-center gap-1.5">
            {canRerun && (
              <button
                type="button"
                onClick={() => void handleRerun()}
                disabled={rerunning}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200 transition-colors hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
                title="局部重跑：在当前 mission 内重跑此任务，产物 patch 回原报告（不创建新 mission）"
              >
                <RefreshCw
                  className={cn('h-3 w-3', rerunning && 'animate-spin')}
                />
                局部重跑
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* ─── Body ─── */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* 4 层架构 strip — 2×2 grid，避免横向滚动 */}
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-violet-100 bg-violet-50/40 p-2">
            {layers.map((l) => (
              <div
                key={l.id}
                className="min-w-0 rounded-md bg-white/70 px-2 py-1.5 ring-1 ring-violet-100"
              >
                <p className="font-mono text-[10px] font-semibold leading-tight text-violet-700">
                  {l.label}
                </p>
                <p className="mt-0.5 break-words text-[10.5px] leading-snug text-gray-600">
                  {l.detail}
                </p>
              </div>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-4 gap-2">
            <MetricStat
              label="状态"
              value={<StatusPill status={statusKey} size="sm" />}
            />
            <MetricStat
              label="耗时"
              value={fmtDuration(todo.startedAt, todo.endedAt)}
            />
            <MetricStat
              label="Tokens"
              value={
                sections.totalTokens > 0
                  ? sections.totalTokens >= 1000
                    ? `${(sections.totalTokens / 1000).toFixed(1)}k`
                    : sections.totalTokens
                  : null
              }
            />
            <MetricStat
              label="工具调用"
              value={totalToolCalls > 0 ? totalToolCalls : null}
            />
          </div>

          {/* Reason — 重派/重写类任务用更醒目的 Tone callout 展示「具体要求修改什么」 */}
          {todo.reasonText &&
            (todo.origin === 'leader-assess-retry' ||
            todo.origin === 'leader-assess-replace' ||
            todo.origin === 'leader-assess-extend' ||
            todo.origin === 'reviewer-revise' ||
            todo.origin === 'critic-blindspot' ||
            todo.origin === 'self-heal-retry' ? (
              <ToneCard
                tone={
                  todo.origin === 'critic-blindspot'
                    ? 'error'
                    : todo.origin === 'self-heal-retry'
                      ? 'warn'
                      : 'warn'
                }
                label={
                  todo.origin === 'leader-assess-retry'
                    ? 'Leader 要求修改（patch 内容）'
                    : todo.origin === 'leader-assess-replace'
                      ? 'Leader 要求换签 spec'
                      : todo.origin === 'leader-assess-extend'
                        ? 'Leader 追加维度的理由'
                        : todo.origin === 'reviewer-revise'
                          ? 'Reviewer 要求重写的 critique'
                          : todo.origin === 'critic-blindspot'
                            ? 'L4 Critic 警示'
                            : '自愈触发理由'
                }
              >
                <ExpandableText
                  text={todo.reasonText}
                  maxChars={800}
                  className="text-[13px] leading-relaxed text-amber-900"
                />
              </ToneCard>
            ) : (
              <Card className="px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600">
                  任务起因
                </p>
                <ExpandableText
                  text={todo.reasonText}
                  maxChars={300}
                  className="mt-1 text-[13px] leading-relaxed text-gray-800"
                />
              </Card>
            ))}

          {/* dim 父级 drawer：展示「本维度被 Leader / Reviewer 要求修改了什么」一览 */}
          {todo.scope === 'dimension' &&
            !todo.parentId &&
            allTodos &&
            (() => {
              const childPatches = allTodos.filter(
                (x) =>
                  x.parentId === todo.id &&
                  (x.origin === 'leader-assess-retry' ||
                    x.origin === 'leader-assess-replace' ||
                    x.origin === 'leader-assess-extend' ||
                    x.origin === 'reviewer-revise' ||
                    x.origin === 'critic-blindspot')
              );
              if (childPatches.length === 0) return null;
              return (
                <Section
                  title="Leader / Reviewer 要求的修改"
                  count={`${childPatches.length} 项`}
                >
                  <ul className="space-y-2 p-3">
                    {childPatches.map((c) => {
                      const ORIGIN_LABEL_MAP: Record<string, string> = {
                        'leader-assess-retry': 'Leader 重派',
                        'leader-assess-replace': 'Leader 换签',
                        'leader-assess-extend': 'Leader 追加',
                        'reviewer-revise': 'Reviewer 重写',
                        'critic-blindspot': 'Critic 警示',
                      };
                      const live =
                        c.status === 'in_progress' || c.status === 'pending';
                      return (
                        <li
                          key={c.id}
                          className={cn(
                            'rounded-md border px-3 py-2',
                            live
                              ? 'border-orange-200 bg-orange-50/40'
                              : c.status === 'done'
                                ? 'border-emerald-200 bg-emerald-50/40'
                                : 'border-gray-200 bg-gray-50/40'
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2">
                            <span className="font-mono text-[10px] font-semibold text-orange-700">
                              {ORIGIN_LABEL_MAP[c.origin] ?? c.origin}
                            </span>
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1',
                                live
                                  ? 'bg-orange-100 text-orange-700 ring-orange-200'
                                  : c.status === 'done'
                                    ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                                    : 'bg-gray-100 text-gray-600 ring-gray-200'
                              )}
                            >
                              {live
                                ? '进行中'
                                : c.status === 'done'
                                  ? '已完成'
                                  : c.status === 'failed'
                                    ? '失败'
                                    : c.status === 'cancelled'
                                      ? '已放弃'
                                      : '待启动'}
                            </span>
                          </div>
                          <ExpandableText
                            text={c.reasonText}
                            maxChars={500}
                            className="text-[12px] leading-relaxed text-gray-700"
                          />
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              );
            })()}

          {/* Failure callout */}
          {todo.status === 'failed' && linkedAgent?.failureMessage && (
            <ToneCard tone="error" label="失败原因">
              <ExpandableText
                text={linkedAgent.failureMessage}
                maxChars={400}
                className="text-[13px] leading-relaxed text-red-800"
              />
            </ToneCard>
          )}

          {/* 关键发现 */}
          {sections.findings.length > 0 && (
            <Section title="关键发现" count={sections.findings.length}>
              <ol className="space-y-2 p-3">
                {sections.findings.map((f, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="flex items-start gap-2">
                      <span className="font-mono mt-0.5 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <ExpandableText
                          text={f.claim}
                          maxChars={200}
                          className="text-[13px] font-medium leading-relaxed text-gray-900"
                        />
                        {f.evidence && (
                          <div className="mt-1.5">
                            <ExpandableText
                              text={f.evidence}
                              maxChars={260}
                              className="text-[11.5px] leading-relaxed text-gray-600"
                            />
                          </div>
                        )}
                        {f.source && (
                          <a
                            href={
                              /^https?:\/\//i.test(f.source) ? f.source : '#'
                            }
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono mt-1.5 inline-block break-all text-[10px] text-violet-700 hover:underline"
                          >
                            {(() => {
                              try {
                                return new URL(f.source).hostname.replace(
                                  /^www\./,
                                  ''
                                );
                              } catch {
                                return f.source;
                              }
                            })()}
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>
          )}

          {/* 使用工具 */}
          {sections.toolUsage.filter((t) => t.toolId !== 'finalize').length >
            0 && (
            <Section
              title="使用工具"
              count={
                sections.toolUsage.filter((t) => t.toolId !== 'finalize').length
              }
            >
              <div className="flex flex-wrap gap-1.5 p-3">
                {sections.toolUsage
                  .filter((t) => t.toolId !== 'finalize')
                  .map((tu) => (
                    <ToolBadge
                      key={tu.toolId}
                      toolId={tu.toolId}
                      count={tu.callCount}
                    />
                  ))}
              </div>
            </Section>
          )}

          {/* 引用来源 */}
          {sections.sources.length > 0 && (
            <Section title="引用来源" count={`${sections.sources.length} 个`}>
              <ul className="max-h-72 space-y-1.5 overflow-y-auto p-3">
                {sections.sources.map((s, i) => (
                  <li key={`${s.url}-${i}`}>
                    <SourceLink title={s.title} url={s.url} hits={s.hits} />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {/* 完整时间线 */}
          {timeline.length > 0 && (
            <Section
              title="完整时间线"
              count={`${timeline.length} 个事件`}
              collapsible
              defaultOpen={showTimeline}
            >
              <ol className="relative space-y-0 p-3 pl-9">
                <span
                  className="absolute bottom-3 left-[20px] top-3 w-0.5 bg-gradient-to-b from-violet-200 via-blue-200 to-emerald-100"
                  aria-hidden="true"
                />
                {timeline.map((c, i) => (
                  <TimelineEntryView
                    key={`${c.ts}-${i}`}
                    entry={c}
                    anchor={anchor}
                  />
                ))}
              </ol>
            </Section>
          )}

          {/* 章节进度 + 维度评分 (仅 dim todos with chapter pipeline) — 信息采集后的下游产物，故置于"使用工具/引用来源/完整时间线"之后 */}
          {todo.scope === 'dimension' &&
            todo.dimensionRef &&
            (() => {
              const pipeline = dimensionPipelines?.get(todo.dimensionRef);
              if (!pipeline || pipeline.chapters.length === 0) return null;
              return (
                <>
                  <Section
                    title="章节进度"
                    count={`${pipeline.chapters.filter((c) => c.status === 'passed').length} / ${pipeline.chapters.length} 通过${pipeline.totalWordCount ? ' · ' + pipeline.totalWordCount + ' 字' : ''}`}
                  >
                    <ul className="space-y-1.5 p-3">
                      {pipeline.chapters.map((c) => {
                        const cls =
                          c.status === 'passed'
                            ? 'bg-emerald-50 ring-emerald-200 text-emerald-700'
                            : c.status === 'writing'
                              ? 'bg-blue-50 ring-blue-200 text-blue-700'
                              : c.status === 'reviewing'
                                ? 'bg-amber-50 ring-amber-200 text-amber-700'
                                : c.status === 'revising'
                                  ? 'bg-orange-50 ring-orange-200 text-orange-700'
                                  : c.status === 'failed'
                                    ? 'bg-red-50 ring-red-200 text-red-700'
                                    : 'bg-gray-50 ring-gray-200 text-gray-600';
                        const statusLabel =
                          c.status === 'passed'
                            ? '已通过'
                            : c.status === 'writing'
                              ? '撰写中'
                              : c.status === 'reviewing'
                                ? '评审中'
                                : c.status === 'revising'
                                  ? `重写第 ${c.attempts} 轮`
                                  : c.status === 'failed'
                                    ? '失败'
                                    : '待启动';
                        return (
                          <li
                            key={c.index}
                            className="rounded-md border border-gray-200 bg-white px-3 py-2"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono text-[10px] font-bold text-gray-500">
                                #{c.index}
                              </span>
                              <span className="flex-1 text-[12.5px] font-medium text-gray-900">
                                {c.heading}
                              </span>
                              <span
                                className={cn(
                                  'inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium ring-1',
                                  cls
                                )}
                              >
                                {statusLabel}
                              </span>
                            </div>
                            {c.thesis && (
                              <p className="mt-1 text-[11px] leading-relaxed text-gray-600">
                                {c.thesis}
                              </p>
                            )}
                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-gray-500">
                              {c.wordCount != null && c.wordCount > 0 && (
                                <span>{c.wordCount} 字</span>
                              )}
                              {c.score != null && (
                                <span
                                  className={cn(
                                    'font-mono font-semibold',
                                    c.score >= 80
                                      ? 'text-emerald-600'
                                      : c.score >= 60
                                        ? 'text-amber-600'
                                        : 'text-red-600'
                                  )}
                                >
                                  {c.score}/100
                                </span>
                              )}
                              {c.attempts > 1 && (
                                <span className="text-orange-600">
                                  已重写 {c.attempts - 1} 次
                                </span>
                              )}
                            </div>
                            {c.critique && (
                              <div className="mt-1.5 rounded-md bg-amber-50/50 px-2 py-1.5 ring-1 ring-amber-100">
                                <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700">
                                  Reviewer 反馈
                                </p>
                                <ExpandableText
                                  text={c.critique}
                                  maxChars={180}
                                  className="text-[11px] leading-relaxed text-gray-700"
                                />
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Section>

                  {pipeline.grade && (
                    <Section
                      title="维度评分"
                      count={`${pipeline.grade.overall}/100 · ${
                        pipeline.grade.grade === 'excellent'
                          ? '优秀'
                          : pipeline.grade.grade === 'good'
                            ? '良好'
                            : pipeline.grade.grade === 'fair'
                              ? '一般'
                              : '不及格'
                      }`}
                    >
                      <div className="p-3">
                        <ul className="space-y-1.5">
                          {(
                            [
                              ['breadth', '广度'],
                              ['depth', '深度'],
                              ['evidence', '证据'],
                              ['coherence', '连贯性'],
                              ['freshness', '时效性'],
                            ] as const
                          ).map(([k, label]) => {
                            const a = pipeline.grade!.axes[k];
                            if (!a) return null;
                            return (
                              <li key={k}>
                                <div className="flex items-baseline justify-between text-[11px]">
                                  <span className="text-gray-700">{label}</span>
                                  <span
                                    className={cn(
                                      'font-mono font-semibold',
                                      a.score >= 80
                                        ? 'text-emerald-600'
                                        : a.score >= 60
                                          ? 'text-amber-600'
                                          : 'text-red-600'
                                    )}
                                  >
                                    {a.score}
                                  </span>
                                </div>
                                <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-gray-100">
                                  <div
                                    className={cn(
                                      'h-full rounded-full',
                                      a.score >= 80
                                        ? 'bg-emerald-400'
                                        : a.score >= 60
                                          ? 'bg-amber-400'
                                          : 'bg-red-400'
                                    )}
                                    style={{ width: `${a.score}%` }}
                                  />
                                </div>
                                {a.comment && (
                                  <p className="mt-0.5 text-[10px] text-gray-500">
                                    {a.comment}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                        {pipeline.grade.summary && (
                          <p className="mt-3 rounded bg-gray-50 px-2 py-1.5 text-[11px] leading-relaxed text-gray-700 ring-1 ring-gray-200">
                            {pipeline.grade.summary}
                          </p>
                        )}
                      </div>
                    </Section>
                  )}
                </>
              );
            })()}

          {/* 开发者诊断 */}
          {linkedAgent && linkedAgent.trace.length > 0 && (
            <Section
              title="开发者诊断视图"
              count={`${linkedAgent.trace.length} 条原始 trace`}
              collapsible
              defaultOpen={false}
            >
              <ul className="space-y-1.5 p-3">
                {linkedAgent.trace.map((t, i) => (
                  <RawTraceRow key={`${t.ts}-${i}`} trace={t} />
                ))}
              </ul>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Timeline entry view ─────────────────────────────
function TimelineEntryView({
  entry,
  anchor,
}: {
  entry: TimelineEntry;
  anchor: number;
}) {
  const tone = KIND_TONE[entry.kind];
  const label = KIND_LABEL[entry.kind];
  const tk = toneToken[tone];
  return (
    <li className="relative pb-3 last:pb-0">
      <span
        className={cn(
          'absolute -left-[28px] top-1 inline-flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white',
          tk.bg
        )}
      >
        <span
          className={cn(
            'h-2 w-2 rounded-full',
            tk.text.replace('text-', 'bg-')
          )}
        />
      </span>
      <ToneCard
        tone={tone}
        label={label}
        meta={
          <span className="flex items-center gap-1.5">
            <span className="font-mono text-[10px] font-semibold text-gray-600">
              {fmtRelative(entry.ts, anchor)}
            </span>
            <span className="font-mono text-[9px] text-gray-400">
              {fmtTime(entry.ts)}
            </span>
          </span>
        }
      >
        <TimelineEntryBody entry={entry} />
      </ToneCard>
    </li>
  );
}

function TimelineEntryBody({ entry }: { entry: TimelineEntry }) {
  if (entry.kind === 'narrative' && entry.narrative) {
    return (
      <ExpandableText
        text={entry.narrative.text}
        maxChars={300}
        className="block whitespace-pre-wrap text-[13px] leading-relaxed text-gray-800"
      />
    );
  }
  if (entry.kind === 'thought' && entry.trace?.text) {
    return (
      <ExpandableText
        text={entry.trace.text}
        maxChars={300}
        className="block whitespace-pre-wrap text-[12.5px] italic leading-relaxed text-violet-900"
      />
    );
  }
  if (entry.kind === 'tool-call') {
    return (
      <div className="space-y-1">
        {entry.trace?.toolId && (
          <ToolBadge toolId={entry.trace.toolId} size="xs" />
        )}
        {entry.query && (
          <p className="font-mono break-words text-[12px] leading-relaxed text-blue-900">
            <span className="text-blue-500">▸</span>{' '}
            {/* ★ P0-LIVE-UI-TOOL-LINK (2026-04-30): query 是 URL 时渲染可点击链接，
                之前用户看到 https://... 全是纯文本，没法直接点开溯源 */}
            {entry.callUrl ? (
              <a
                href={entry.callUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline decoration-blue-300 underline-offset-2 hover:text-blue-800 hover:decoration-blue-500"
              >
                {entry.query}
              </a>
            ) : (
              entry.query
            )}
          </p>
        )}
      </div>
    );
  }
  if (entry.kind === 'parallel-tool-call' && entry.subCalls) {
    return (
      <div className="space-y-1.5">
        <p className="text-[11px] font-medium text-gray-600">
          并发执行 {entry.subCalls.length} 个工具调用
        </p>
        <ul className="space-y-1">
          {entry.subCalls.map((sub, i) => (
            <li
              key={i}
              className="rounded-md bg-white px-2 py-1.5 ring-1 ring-blue-100"
            >
              <ToolBadge toolId={sub.toolId} size="xs" />
              {sub.query && (
                <p className="font-mono mt-1 break-words text-[12px] leading-relaxed text-blue-900">
                  <span className="text-blue-500">▸</span> {sub.query}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (entry.kind === 'tool-result') {
    const hasResults = entry.results && entry.results.length > 0;
    const hasErrors =
      !!entry.toolError || (entry.toolErrors && entry.toolErrors.length > 0);
    const hasRawPreview = !!entry.rawOutputPreview;
    // ★ P0-LIVE-UI-TOOL-ERR-PARTIAL (2026-04-30): parallel_tool_call 同时含
    //   成功 + 失败时（如 5 个抓 URL 中 1 个 HTTP 403, 4 个成功），之前只看
    //   results.length > 0 就走 ToolResultList 完全跳过 errors 显示，用户看
    //   不到失败子调用的原因。改为 results 和 errors 同时渲染（先列错误警示
    //   卡，再列成功结果）。
    if (!hasResults && !hasErrors && !hasRawPreview) {
      return (
        <p className="text-[11px] italic text-gray-500">
          （工具未返回可解析的结构化结果）
        </p>
      );
    }
    return (
      <div className="space-y-2">
        {entry.toolError && (
          <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5">
            <p className="font-mono text-[11px] leading-relaxed text-red-700">
              {entry.toolError}
            </p>
          </div>
        )}
        {entry.toolErrors && entry.toolErrors.length > 0 && (
          <div className="space-y-1.5">
            {entry.toolErrors.map((e, i) => (
              <div
                key={i}
                className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5"
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                  {e.toolId || '子调用失败'}
                </p>
                {e.url && (
                  <p className="font-mono mt-0.5 break-all text-[10.5px] leading-relaxed text-amber-700/80">
                    {e.url}
                  </p>
                )}
                <p className="font-mono mt-0.5 break-words text-[11px] leading-relaxed text-amber-900">
                  {e.error}
                </p>
              </div>
            ))}
          </div>
        )}
        {hasResults && <ToolResultList results={entry.results ?? []} />}
        {/* tool 没有结构化 {title,url} 但有可读结论时展示 —— 人话样式（非 mono） */}
        {!hasResults && hasRawPreview && entry.rawOutputPreview && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5">
            <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
              结论 · Outcome
            </p>
            <p className="whitespace-pre-wrap break-words text-[12px] leading-relaxed text-gray-700">
              {entry.rawOutputPreview}
              {entry.rawOutputPreview.length >= 500 ? ' …' : ''}
            </p>
          </div>
        )}
      </div>
    );
  }
  if (entry.kind === 'reflection' && entry.trace?.text) {
    return (
      <ExpandableText
        text={entry.trace.text}
        maxChars={260}
        className="block whitespace-pre-wrap text-[12.5px] leading-relaxed text-amber-900"
      />
    );
  }
  return null;
}

// ─── Tool result list ─────────────────────────────────
function ToolResultList({
  results,
}: {
  results: { title?: string; url?: string; snippet?: string }[];
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? results : results.slice(0, 5);
  return (
    <div className="space-y-1.5">
      {visible.map((r, i) => (
        <SourceLink key={i} title={r.title} url={r.url} snippet={r.snippet} />
      ))}
      {results.length > 5 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(!showAll);
          }}
          className="w-full rounded-md border border-dashed border-gray-300 bg-white px-2 py-1.5 text-center text-[11px] text-violet-600 hover:bg-violet-50 hover:text-violet-700"
        >
          {showAll
            ? `▴ 收起，仅显示前 5 条`
            : `▾ 展开剩余 ${results.length - 5} 条结果`}
        </button>
      )}
    </div>
  );
}

// ─── Raw trace row (developer view) ──────────────────
function RawTraceRow({ trace }: { trace: AgentTraceItem }) {
  const dump = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v, null, 2);
    } catch {
      return String(v);
    }
  };
  const inputStr = dump(trace.input);
  const outputStr = dump(trace.output);
  const kindCls =
    trace.kind === 'thought'
      ? 'bg-amber-50 text-amber-900'
      : trace.kind === 'action'
        ? 'bg-violet-50 text-violet-900'
        : trace.kind === 'observation'
          ? trace.error
            ? 'bg-red-50 text-red-900'
            : 'bg-sky-50 text-sky-900'
          : trace.kind === 'reflection'
            ? 'bg-purple-50 text-purple-900'
            : 'bg-red-50 text-red-900';
  return (
    <li
      className={cn(
        'rounded-md px-2 py-1.5 text-[11px] leading-relaxed',
        kindCls
      )}
    >
      <div className="flex items-baseline gap-1.5">
        <span className="font-semibold">{trace.kind}</span>
        {trace.toolId && (
          <span className="font-mono rounded bg-white/60 px-1.5 text-[10px]">
            {trace.toolId}
          </span>
        )}
        {trace.latencyMs != null && (
          <span className="font-mono text-[10px] opacity-60">
            {trace.latencyMs}ms
          </span>
        )}
        {trace.tokensUsed != null && trace.tokensUsed > 0 && (
          <span className="font-mono text-[10px] opacity-60">
            +{trace.tokensUsed}tk
          </span>
        )}
      </div>
      {trace.text && (
        <p className="mt-1 whitespace-pre-wrap break-words">{trace.text}</p>
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
      {trace.error && (
        <p className="mt-1 whitespace-pre-wrap break-words font-medium">
          ⚠{' '}
          {trace.error.length > 400
            ? trace.error.slice(0, 400) + '…'
            : trace.error}
        </p>
      )}
    </li>
  );
}
