'use client';

/**
 * AgentTimeline
 *
 * 支柱六 6c：Agent 执行可视化组件
 *
 * 实时展示 Trace 中所有 Span 的执行进度、状态和时长。
 * 支持父子 Span 的嵌套层级展示（缩进渲染）。
 *
 * 使用方式：
 *   <AgentTimeline traceId="trace-xxx" />
 */

import {
  CheckCircle,
  XCircle,
  Loader,
  Clock,
  ChevronRight,
} from 'lucide-react';
import {
  useAgentTrace,
  TraceData,
  SpanData,
  ExecutionStatus,
} from './useAgentTrace';

// ─── Helpers ──────────────────────────────────────────────

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusIcon({
  status,
  className = '',
}: {
  status: ExecutionStatus;
  className?: string;
}) {
  if (status === 'success')
    return (
      <CheckCircle className={`h-4 w-4 shrink-0 text-green-400 ${className}`} />
    );
  if (status === 'error')
    return <XCircle className={`h-4 w-4 shrink-0 text-red-400 ${className}`} />;
  return (
    <Loader
      className={`h-4 w-4 shrink-0 animate-spin text-blue-400 ${className}`}
    />
  );
}

/** Build a tree from flat span list */
function buildSpanTree(spans: SpanData[]): SpanData[] {
  const childrenMap = new Map<string, SpanData[]>();
  const roots: SpanData[] = [];

  for (const span of spans) {
    if (span.parentSpanId) {
      if (!childrenMap.has(span.parentSpanId)) {
        childrenMap.set(span.parentSpanId, []);
      }
      childrenMap.get(span.parentSpanId)!.push(span);
    } else {
      roots.push(span);
    }
  }

  // Flatten back with depth metadata in correct order
  return roots;
}

function getChildren(spanId: string, spans: SpanData[]): SpanData[] {
  return spans.filter((s) => s.parentSpanId === spanId);
}

// ─── Span row ─────────────────────────────────────────────

function SpanRow({
  span,
  allSpans,
  depth,
}: {
  span: SpanData;
  allSpans: SpanData[];
  depth: number;
}) {
  const children = getChildren(span.id, allSpans);

  return (
    <>
      <div
        className="flex items-center gap-2 py-1.5 text-sm"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {/* Connector lines */}
        {depth > 0 && (
          <ChevronRight className="-ml-4 h-3 w-3 shrink-0 text-gray-600" />
        )}

        <StatusIcon status={span.status} />

        {/* Span name */}
        <span
          className={`flex-1 truncate ${
            span.status === 'error'
              ? 'text-red-300'
              : span.status === 'running'
                ? 'text-white'
                : 'text-gray-300'
          }`}
        >
          {span.name}
        </span>

        {/* Span type badge */}
        <span className="font-mono shrink-0 text-xs text-gray-500">
          {span.type.replace('_', ' ')}
        </span>

        {/* Duration */}
        {span.duration !== undefined && (
          <span className="w-12 shrink-0 text-right text-xs text-gray-500">
            {formatDuration(span.duration)}
          </span>
        )}
      </div>

      {/* Children (recursive) */}
      {children.map((child) => (
        <SpanRow
          key={child.id}
          span={child}
          allSpans={allSpans}
          depth={depth + 1}
        />
      ))}
    </>
  );
}

// ─── Progress bar ─────────────────────────────────────────

function ProgressBar({ trace }: { trace: TraceData }) {
  const total = trace.spans.length;
  const done = trace.spans.filter(
    (s) => s.status === 'success' || s.status === 'error'
  ).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <div className="flex items-center gap-3 text-xs text-gray-400">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full bg-blue-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>
        {done}/{total} steps
      </span>
      {trace.duration !== undefined && (
        <>
          <Clock className="h-3 w-3" />
          <span>{formatDuration(trace.duration)}</span>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────

interface AgentTimelineProps {
  traceId: string | null;
  className?: string;
}

export function AgentTimeline({ traceId, className = '' }: AgentTimelineProps) {
  const { trace, loading, error } = useAgentTrace(traceId);

  if (!traceId) return null;

  if (loading && !trace) {
    return (
      <div
        className={`flex items-center gap-2 py-4 text-sm text-gray-400 ${className}`}
      >
        <Loader className="h-4 w-4 animate-spin" />
        <span>Loading trace…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`py-3 text-sm text-red-400 ${className}`}>
        Failed to load trace: {error}
      </div>
    );
  }

  if (!trace) return null;

  const roots = buildSpanTree(trace.spans);

  return (
    <div
      className={`overflow-hidden rounded-xl border border-white/10 bg-gray-900 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusIcon status={trace.status} />
          <span className="truncate text-sm font-medium text-white">
            {trace.name}
          </span>
        </div>
        <span className="font-mono text-xs text-gray-500">{trace.type}</span>
      </div>

      {/* Progress */}
      <div className="border-b border-white/10 px-4 py-2">
        <ProgressBar trace={trace} />
      </div>

      {/* Spans */}
      {trace.spans.length === 0 ? (
        <div className="px-4 py-3 text-sm text-gray-500">No spans yet…</div>
      ) : (
        <div className="py-1">
          {roots.map((span) => (
            <SpanRow
              key={span.id}
              span={span}
              allSpans={trace.spans}
              depth={0}
            />
          ))}
        </div>
      )}

      {/* Error summary */}
      {trace.status === 'error' && (
        <div className="border-t border-white/10 px-4 py-2 text-xs text-red-400">
          Execution failed. Check span details above.
        </div>
      )}
    </div>
  );
}
