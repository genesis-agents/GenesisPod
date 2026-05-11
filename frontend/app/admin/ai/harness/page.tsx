'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
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
import { AdminTabs, type AdminTab } from '@/components/admin/shared';
import { useApiGet } from '@/hooks/core';
import { useTranslation } from '@/lib/i18n';

/**
 * AI Harness Hub
 *
 * Wave 5 (2026-05-11): L2.5 从 8 卡精简为 4 实体后，本页升级为 4-Tab hub。
 * 架构图 4 卡分别 link 到 ?tab=execution|memory|governance|interop。
 * 原 8 个独立 page（/admin/kernel/* 和 /admin/ai/{traces,eval}）保留作 deep-link
 * 兜底，本 hub 子卡 actions 仍指向它们；下次迭代再做"合并页 + 内嵌 Content"。
 */

type HarnessEntity = 'execution' | 'memory' | 'governance' | 'interop';

interface HarnessAction {
  label: string;
  href: string;
}

interface HarnessSubsystem {
  id: string;
  entity: HarnessEntity;
  title: string;
  description: string;
  modulePath: string;
  icon: LucideIcon;
  stats?: Array<{ label: string; key: string }>;
  actions: HarnessAction[];
}

const SUBSYSTEMS: HarnessSubsystem[] = [
  {
    id: 'agents',
    entity: 'execution',
    title: 'Agents',
    description:
      'Agent abstractions, runtime primitives, scheduler capacity, and capability boundary.',
    modulePath: 'backend/src/modules/ai-harness/agents',
    icon: Cpu,
    stats: [{ label: 'running', key: 'kernelRunning' }],
    actions: [
      { label: 'Scheduler', href: '/admin/kernel/scheduler' },
      { label: 'Capability guard', href: '/admin/kernel/security' },
    ],
  },
  {
    id: 'execution',
    entity: 'execution',
    title: 'Execution',
    description:
      'Executor loops, tool invocation, token tracking, checkpoints, and traceable runs.',
    modulePath: 'backend/src/modules/ai-harness/execution',
    icon: Workflow,
    stats: [{ label: 'traces', key: 'agentTraces' }],
    actions: [
      { label: 'Execution traces', href: '/admin/ai/traces' },
      { label: 'Process control', href: '/admin/kernel/processes' },
    ],
  },
  {
    id: 'process',
    entity: 'execution',
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
    id: 'harness-api',
    entity: 'execution',
    title: 'Mission Orchestration',
    description:
      'Mission orchestration, team state, cost accounting, resources, and LLM metrics.',
    modulePath: 'backend/src/modules/ai-harness/facade',
    icon: Shuffle,
    stats: [{ label: 'LLM calls', key: 'kernelLLMCalls' }],
    actions: [
      { label: 'Observability', href: '/admin/kernel/observability' },
      { label: 'Team configs', href: '/admin/ai/teams' },
      { label: 'Resource breakers', href: '/admin/kernel/resources' },
    ],
  },
  {
    id: 'memory',
    entity: 'memory',
    title: 'Memory',
    description:
      'Process memory, checkpoints, working memory, and vector-backed recall.',
    modulePath: 'backend/src/modules/ai-harness/memory',
    icon: MemoryStick,
    stats: [{ label: 'entries', key: 'kernelMemories' }],
    actions: [
      { label: 'Process memory', href: '/admin/kernel/memory' },
      { label: 'Event journal', href: '/admin/kernel/journal' },
    ],
  },
  {
    id: 'governance',
    entity: 'governance',
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
      { label: 'System monitoring', href: '/admin/system?tab=ops' },
    ],
  },
  {
    id: 'facade',
    entity: 'interop',
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
    id: 'protocol',
    entity: 'interop',
    title: 'Protocol',
    description:
      'Event bus, IPC, realtime progress, message history, MCP relay, and A2A integration.',
    modulePath: 'backend/src/modules/ai-harness/protocol',
    icon: Radio,
    stats: [{ label: 'subscriptions', key: 'kernelSubscriptions' }],
    actions: [
      { label: 'IPC bus', href: '/admin/kernel/ipc' },
      { label: 'Event journal', href: '/admin/kernel/journal' },
      { label: 'External MCP', href: '/admin/system?tab=settings' },
    ],
  },
];

function statValue(
  overviewStats: Record<string, number> | undefined,
  key: string
): number {
  return overviewStats?.[key] ?? 0;
}

function HarnessAdminPageInner() {
  const { t } = useTranslation();
  const { data: overviewStats } = useApiGet<Record<string, number>>(
    '/admin/overview-stats'
  );
  const searchParams = useSearchParams();
  const rawTab = searchParams?.get('tab');
  const tab: HarnessEntity =
    rawTab === 'memory' ||
    rawTab === 'governance' ||
    rawTab === 'interop' ||
    rawTab === 'execution'
      ? rawTab
      : 'execution';

  const tabs: AdminTab[] = [
    {
      key: 'execution',
      label: t('admin.architecture.cards.harnessExecution'),
      icon: Workflow,
    },
    {
      key: 'memory',
      label: t('admin.architecture.cards.harnessMemory'),
      icon: MemoryStick,
    },
    {
      key: 'governance',
      label: t('admin.architecture.cards.harnessGovernance'),
      icon: BarChart3,
    },
    {
      key: 'interop',
      label: t('admin.architecture.cards.harnessInterop'),
      icon: Network,
    },
  ];

  const filtered = SUBSYSTEMS.filter((s) => s.entity === tab);

  return (
    <AdminPageLayout
      title="AI Harness"
      description="L2.5 Agent runtime scaffold — 4 entities, 8 subsystem panels."
      icon={Network}
      domain="ai"
    >
      <div className="mb-6">
        <AdminTabs tabs={tabs} mode="route" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {filtered.map((subsystem) => {
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

      {tab === 'interop' && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Facade and protocol internals do not have standalone mutation screens
          yet. Panels link to the closest runtime / capability / protocol
          surfaces instead of synthesizing a Harness-only page.
        </div>
      )}
    </AdminPageLayout>
  );
}

export default function HarnessAdminPage() {
  return (
    <Suspense fallback={null}>
      <HarnessAdminPageInner />
    </Suspense>
  );
}
