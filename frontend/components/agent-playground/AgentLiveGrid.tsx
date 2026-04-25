'use client';

import { useState } from 'react';
import {
  Brain,
  Search,
  GitBranch,
  PenLine,
  Gavel,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Wrench,
  Eye,
  Lightbulb,
  Repeat,
  AlertCircle,
  ChevronDown,
} from 'lucide-react';
import type {
  AgentLiveState,
  AgentRole,
  AgentTraceItem,
} from '@/lib/agent-playground/derive';

const ROLE_META: Record<
  AgentRole,
  { Icon: typeof Brain; label: string; tone: string }
> = {
  leader: { Icon: Brain, label: 'Leader', tone: 'violet' },
  researcher: { Icon: Search, label: 'Researcher', tone: 'sky' },
  analyst: { Icon: GitBranch, label: 'Analyst', tone: 'amber' },
  writer: { Icon: PenLine, label: 'Writer', tone: 'rose' },
  reviewer: { Icon: Gavel, label: 'Reviewer', tone: 'emerald' },
};

const TONE_CLASS: Record<string, { bg: string; text: string; ring: string }> = {
  violet: {
    bg: 'bg-violet-50',
    text: 'text-violet-600',
    ring: 'ring-violet-200',
  },
  sky: { bg: 'bg-sky-50', text: 'text-sky-600', ring: 'ring-sky-200' },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-200',
  },
  rose: { bg: 'bg-rose-50', text: 'text-rose-600', ring: 'ring-rose-200' },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    ring: 'ring-emerald-200',
  },
};

function PhaseBadge({ phase }: { phase: AgentLiveState['phase'] }) {
  if (phase === 'completed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" /> Done
      </span>
    );
  if (phase === 'running')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 ring-1 ring-violet-200">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </span>
    );
  if (phase === 'failed')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200">
        <XCircle className="h-3 w-3" /> Failed
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-500 ring-1 ring-gray-200">
      <Clock className="h-3 w-3" /> Pending
    </span>
  );
}

function previewOutput(output: unknown): string {
  if (output == null) return '';
  if (typeof output === 'string')
    return output.length > 240 ? output.slice(0, 240) + '…' : output;
  try {
    const s = JSON.stringify(output);
    return s.length > 240 ? s.slice(0, 240) + '…' : s;
  } catch {
    return String(output);
  }
}

function TraceItem({ item }: { item: AgentTraceItem }) {
  if (item.kind === 'thought')
    return (
      <li className="flex gap-2">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        <p className="flex-1 text-[12px] leading-relaxed text-gray-700">
          <span className="font-medium text-gray-900">Thought · </span>
          {item.text || '(empty)'}
        </p>
      </li>
    );
  if (item.kind === 'action')
    return (
      <li className="flex gap-2">
        <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
        <p className="flex-1 text-[12px] leading-relaxed text-gray-700">
          <span className="font-medium text-gray-900">Action · </span>
          <span className="font-mono rounded bg-violet-50 px-1 py-0.5 text-[11px] text-violet-700">
            {item.toolId || 'unknown'}
          </span>
          {item.input != null && (
            <span className="ml-1 text-gray-500">
              {previewOutput(item.input)}
            </span>
          )}
        </p>
      </li>
    );
  if (item.kind === 'observation')
    return (
      <li className="flex gap-2">
        <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" />
        <div className="flex-1 text-[12px] leading-relaxed text-gray-700">
          <p>
            <span className="font-medium text-gray-900">Observation</span>
            {item.toolId && (
              <span className="ml-1 text-gray-500">
                · <span className="font-mono">{item.toolId}</span>
              </span>
            )}
            {item.latencyMs != null && (
              <span className="font-mono ml-1 text-[10px] text-gray-400">
                {item.latencyMs}ms
              </span>
            )}
            {item.tokensUsed != null && item.tokensUsed > 0 && (
              <span className="font-mono ml-1 text-[10px] text-amber-600">
                +{item.tokensUsed}tk
              </span>
            )}
          </p>
          {item.error ? (
            <p className="mt-0.5 text-[11px] text-red-600">{item.error}</p>
          ) : (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-gray-500">
              {previewOutput(item.output)}
            </p>
          )}
        </div>
      </li>
    );
  if (item.kind === 'reflection')
    return (
      <li className="flex gap-2">
        <Repeat className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-500" />
        <p className="flex-1 text-[12px] leading-relaxed text-gray-700">
          <span className="font-medium text-gray-900">Reflexion · </span>
          {item.text || '(empty)'}
        </p>
      </li>
    );
  return (
    <li className="flex gap-2">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />
      <p className="flex-1 text-[12px] text-red-600">{item.error}</p>
    </li>
  );
}

function AgentCard({ agent }: { agent: AgentLiveState }) {
  const meta = ROLE_META[agent.role];
  const tone = TONE_CLASS[meta.tone];
  const Icon = meta.Icon;
  const [expanded, setExpanded] = useState(false);
  const trace = expanded ? agent.trace : agent.trace.slice(-4);
  const dur =
    agent.startedAt && agent.endedAt
      ? `${((agent.endedAt - agent.startedAt) / 1000).toFixed(1)}s`
      : agent.startedAt
        ? '…'
        : null;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone.bg} ${tone.text} ring-1 ${tone.ring}`}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {meta.label}
              {agent.attempt && agent.attempt > 1 && (
                <span className="ml-1 text-[10px] font-normal text-gray-400">
                  (attempt {agent.attempt})
                </span>
              )}
            </p>
            <p className="font-mono text-[10px] text-gray-400">
              {agent.dimension ?? agent.agentId}
            </p>
          </div>
        </div>
        <PhaseBadge phase={agent.phase} />
      </div>

      <div className="mb-2 flex items-center gap-3 text-[10px] text-gray-500">
        {dur && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {dur}
          </span>
        )}
        {agent.iterations != null && agent.iterations > 0 && (
          <span>· {agent.iterations} iters</span>
        )}
        <span className="ml-auto">{agent.trace.length} trace</span>
      </div>

      {agent.trace.length === 0 ? (
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-400">
          {agent.phase === 'pending'
            ? 'Waiting to start…'
            : 'No trace events yet'}
        </p>
      ) : (
        <>
          <ul className="space-y-1.5">
            {trace.map((item, i) => (
              <TraceItem key={`${item.ts}-${i}`} item={item} />
            ))}
          </ul>
          {agent.trace.length > 4 && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-gray-100 bg-gray-50 py-1.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              <ChevronDown
                className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
              />
              {expanded
                ? 'Collapse'
                : `Show all ${agent.trace.length} trace items`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function AgentLiveGrid({ agents }: { agents: AgentLiveState[] }) {
  if (agents.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center">
        <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin text-gray-400" />
        <p className="text-sm font-medium text-gray-700">
          Waiting for agents to spin up
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Once Leader plans dimensions, parallel Researchers will appear here
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Agents · Live</h3>
        <span className="text-xs text-gray-500">
          {agents.filter((a) => a.phase === 'running').length} running ·{' '}
          {agents.filter((a) => a.phase === 'completed').length} done
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {agents.map((a) => (
          <AgentCard key={a.agentId} agent={a} />
        ))}
      </div>
    </div>
  );
}
