'use client';

import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Cpu,
  GitBranch,
  MemoryStick,
  Network,
  Radio,
  Shuffle,
  Workflow,
  type LucideIcon,
} from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';
import { useApiGet } from '@/hooks/core';

interface HarnessAction {
  label: string;
  href: string;
}

interface HarnessSubsystem {
  id: string;
  title: string;
  description: string;
  modulePath: string;
  icon: LucideIcon;
  stats?: Array<{ label: string; key: string }>;
  actions: HarnessAction[];
}

const SUBSYSTEMS: HarnessSubsystem[] = [
  {
    id: 'facade',
    title: 'Facade',
    description:
      'Internal entry layer for AI, chat, RAG, agents, teams, and tool execution.',
    modulePath: 'backend/src/modules/ai-harness/facade',
    icon: Network,
    actions: [
      { label: 'Agent configs', href: '/admin/ai/agents' },
      { label: 'Team configs', href: '/admin/ai/teams' },
      { label: 'Tool configs', href: '/admin/ai/tools' },
      { label: 'Skill configs', href: '/admin/ai/skills' },
    ],
  },
  {
    id: 'kernel',
    title: 'Kernel',
    description:
      'Agent abstractions, runtime primitives, scheduler capacity, and capability boundary.',
    modulePath: 'backend/src/modules/ai-harness/kernel',
    icon: Cpu,
    stats: [{ label: 'running', key: 'kernelRunning' }],
    actions: [
      { label: 'Scheduler', href: '/admin/kernel/scheduler' },
      { label: 'Capability guard', href: '/admin/kernel/security' },
    ],
  },
  {
    id: 'execution',
    title: 'Execution',
    description:
      'Executor loops, tool invocation, token tracking, checkpoints, and traceable runs.',
    modulePath: 'backend/src/modules/ai-harness/execution',
    icon: Workflow,
    stats: [{ label: 'traces', key: 'agentTraces' }],
    actions: [
      { label: 'Execution traces', href: '/admin/ai/traces' },
      { label: 'Process control', href: '/admin/kernel/processes' },
      { label: 'Eval runs', href: '/admin/ai/eval' },
    ],
  },
  {
    id: 'memory',
    title: 'Memory',
    description:
      'Process memory, checkpoints, working memory, and vector-backed recall.',
    modulePath: 'backend/src/modules/ai-harness/memory',
    icon: MemoryStick,
    stats: [{ label: 'entries', key: 'kernelMemories' }],
    actions: [{ label: 'Process memory', href: '/admin/kernel/memory' }],
  },
  {
    id: 'process',
    title: 'Process',
    description:
      'Process manager, supervisor, scheduler, subagents, handoff, and collaboration state.',
    modulePath: 'backend/src/modules/ai-harness/process',
    icon: GitBranch,
    stats: [
      { label: 'processes', key: 'kernelProcesses' },
      { label: 'running', key: 'kernelRunning' },
    ],
    actions: [
      { label: 'Processes', href: '/admin/kernel/processes' },
      { label: 'Scheduler', href: '/admin/kernel/scheduler' },
      { label: 'Event journal', href: '/admin/kernel/journal' },
    ],
  },
  {
    id: 'protocol',
    title: 'Protocol',
    description:
      'Event bus, IPC, realtime progress, message history, MCP relay, and A2A integration.',
    modulePath: 'backend/src/modules/ai-harness/protocol',
    icon: Radio,
    stats: [{ label: 'subscriptions', key: 'kernelSubscriptions' }],
    actions: [
      { label: 'IPC bus', href: '/admin/kernel/ipc' },
      { label: 'Event journal', href: '/admin/kernel/journal' },
      { label: 'External MCP', href: '/admin/system/mcp-server' },
    ],
  },
  {
    id: 'governance',
    title: 'Governance',
    description:
      'Trace quality evaluation, observability, judges, cost/resource controls, and constraints.',
    modulePath: 'backend/src/modules/ai-harness/governance',
    icon: BarChart3,
    stats: [
      { label: 'eval runs', key: 'harnessEvalRuns' },
      { label: 'guardrails', key: 'guardrailRules' },
    ],
    actions: [
      { label: 'Evaluation', href: '/admin/ai/eval' },
      { label: 'Guardrails', href: '/admin/ai/guardrails' },
      { label: 'Kernel security', href: '/admin/kernel/security' },
      { label: 'System monitoring', href: '/admin/system/monitoring' },
    ],
  },
  {
    id: 'harness-api',
    title: 'Harness API',
    description:
      'Mission orchestration, team state, cost accounting, resources, and LLM metrics.',
    modulePath: 'backend/src/modules/ai-harness/facade',
    icon: Shuffle,
    stats: [{ label: 'LLM calls', key: 'kernelLLMCalls' }],
    actions: [
      { label: 'Observability', href: '/admin/kernel/observability' },
      { label: 'Team configs', href: '/admin/ai/teams' },
      { label: 'Scheduler', href: '/admin/kernel/scheduler' },
      { label: 'Resource breakers', href: '/admin/kernel/resources' },
    ],
  },
];

function statValue(
  overviewStats: Record<string, number> | undefined,
  key: string
): number {
  return overviewStats?.[key] ?? 0;
}

export default function HarnessAdminPage() {
  const { data: overviewStats } = useApiGet<Record<string, number>>(
    '/admin/overview-stats'
  );

  return (
    <AdminPageLayout
      title="AI Harness"
      description="Runtime management map for the Harness layer and its real admin surfaces"
      icon={Network}
      domain="ai"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {SUBSYSTEMS.map((subsystem) => {
          const Icon = subsystem.icon;
          return (
            <section
              key={subsystem.id}
              id={subsystem.id}
              className="scroll-mt-24 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="text-base font-semibold text-gray-900">
                      {subsystem.title}
                    </h2>
                    {subsystem.stats && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {subsystem.stats.map((stat) => (
                          <span
                            key={stat.key}
                            className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600"
                          >
                            <strong className="text-gray-900">
                              {statValue(overviewStats, stat.key)}
                            </strong>{' '}
                            {stat.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-600">
                    {subsystem.description}
                  </p>
                  <p className="font-mono mt-2 truncate text-xs text-gray-400">
                    {subsystem.modulePath}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {subsystem.actions.map((action) => (
                  <Link
                    key={`${subsystem.id}-${action.href}-${action.label}`}
                    href={action.href}
                    className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700"
                  >
                    {action.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Facade and protocol internals do not have standalone mutation screens
        yet. Their panels route to the closest real runtime, capability, and
        protocol surfaces instead of pretending Engine or Open API pages are the
        Harness module itself.
      </div>
    </AdminPageLayout>
  );
}
