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
import { useApiGet } from '@/hooks/core';
import KernelMemoryPageContent from '../../kernel/memory/content';
import KernelSchedulerPageContent from '../../kernel/scheduler/content';
import EvalDashboardPageContent from '../eval/content';
import GuardrailsPageContent from '../guardrails/content';
import TracesPageContent from '../traces/content';

/**
 * AI Harness Hub
 *
 * Wave 5 (2026-05-11): L2.5 从 8 卡精简为 4 实体后，本页升级为 4-Tab hub。
 * 架构图 4 卡分别 link 到 ?tab=execution|memory|governance|interop。
 *
 * 内嵌进度：
 *  - memory:     KernelMemoryPageContent 直接内嵌
 *  - governance: EvalDashboardPageContent + GuardrailsPageContent 堆叠内嵌
 *  - execution:  暂保持 SUBSYSTEMS 子卡导航（后续再拆 scheduler/processes/
 *                traces/observability 4 page 的 content）
 *  - interop:    facade/protocol 无独立 page，永远保持子卡导航形态
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
  // 'memory' / 'governance' entity 不再用 SUBSYSTEMS 子卡 —
  // hub Tab 直接内嵌 PageContent. kernel/security 和 system?tab=ops 不嵌（跨 hub）.
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

const ENTITY_META: Record<
  HarnessEntity,
  { title: string; description: string }
> = {
  execution: {
    title: 'AI Harness — 运行调度',
    description: 'Agent loops、调度器、进程/DAG、Mission Orchestrator',
  },
  memory: {
    title: 'AI Harness — 记忆状态',
    description: 'Working/Vector/Checkpoint、Event Store、自动索引',
  },
  governance: {
    title: 'AI Harness — 评估治理',
    description: 'Trace、Eval Judge、Guardrails、Observability',
  },
  interop: {
    title: 'AI Harness — 互联协议',
    description: 'Facade 门面、A2A/IPC/Events/Realtime、Handoffs',
  },
};

function HarnessAdminPageInner() {
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

  const meta = ENTITY_META[tab];
  const filtered = SUBSYSTEMS.filter((s) => s.entity === tab);

  return (
    <AdminPageLayout
      title={meta.title}
      description={meta.description}
      icon={Network}
      domain="ai"
    >
      {tab === 'memory' && <KernelMemoryPageContent embedded />}

      {tab === 'governance' && (
        <div className="space-y-8">
          <EvalDashboardPageContent embedded />
          <div className="border-t border-gray-200 pt-8">
            <GuardrailsPageContent embedded />
          </div>
        </div>
      )}

      {tab === 'execution' && (
        <div className="mb-8 space-y-8">
          <KernelSchedulerPageContent embedded />
          <div className="border-t border-gray-200 pt-8">
            <TracesPageContent embedded />
          </div>
        </div>
      )}

      {tab !== 'memory' && tab !== 'governance' && (
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
      )}

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
