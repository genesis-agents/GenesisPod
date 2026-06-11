'use client';

import {
  Users,
  ListChecks,
  CheckCircle2,
  UserCog,
  ArrowRight,
} from 'lucide-react';
import { StatCard } from '@/components/ui/cards/StatCard';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table/Table';
import { cn } from '@/lib/utils/common';
import { useCompanyStore } from '@/stores/company/companyStore';

const STATUS_META: Record<
  string,
  { label: string; bar: string; text: string }
> = {
  running: { label: '进行中', bar: 'bg-blue-500', text: 'text-blue-600' },
  review: { label: '评审中', bar: 'bg-amber-500', text: 'text-amber-600' },
  done: { label: '已完成', bar: 'bg-green-500', text: 'text-green-600' },
  failed: { label: '失败', bar: 'bg-red-500', text: 'text-red-600' },
  queued: { label: '排队中', bar: 'bg-gray-400', text: 'text-gray-500' },
};

export function DashboardView({ onGoMission }: { onGoMission: () => void }) {
  const { teams, hired, missions, teamWorkflows } = useCompanyStore();
  const running = missions.filter(
    (m) => m.status === 'running' || m.status === 'review'
  );
  const done = missions.filter((m) => m.status === 'done');

  return (
    <div className="space-y-6">
      {/* 指标（全部真实） */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="专家团队"
          value={teams.length}
          icon={<Users className="h-5 w-5" />}
          tone="slate"
        />
        <StatCard
          label="进行中任务"
          value={running.length}
          icon={<ListChecks className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          label="已完成任务"
          value={done.length}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="emerald"
        />
        <StatCard
          label="在编专家"
          value={hired.length}
          icon={<UserCog className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      {/* 各团队在忙啥 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">
            各团队在忙什么
          </h3>
          <button
            onClick={onGoMission}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            查看全部任务 <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {missions.length === 0 ? (
          <EmptyState
            type="default"
            title="暂无任务"
            description="去「我的任务」给团队下达第一个任务"
            size="sm"
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <Table className="text-left text-sm">
              <THead className="bg-gray-50 text-xs text-gray-500">
                <Tr>
                  <Th className="px-4 py-2.5 font-medium">任务</Th>
                  <Th className="px-4 py-2.5 font-medium">团队</Th>
                  <Th className="px-4 py-2.5 font-medium">工作流</Th>
                  <Th className="px-4 py-2.5 font-medium">状态</Th>
                  <Th className="px-4 py-2.5 font-medium">进度</Th>
                </Tr>
              </THead>
              <TBody>
                {missions.map((m) => {
                  const team = teams.find((t) => t.id === m.teamId);
                  const wf = team
                    ? teamWorkflows.find((w) => w.id === team.workflowId)
                    : null;
                  const sm = STATUS_META[m.status] ?? STATUS_META.queued;
                  return (
                    <Tr key={m.id} className="border-t border-gray-100">
                      <Td className="px-4 py-2.5">
                        <button
                          type="button"
                          onClick={onGoMission}
                          className="font-medium text-primary hover:underline"
                        >
                          {m.title}
                        </button>
                      </Td>
                      <Td className="px-4 py-2.5 text-gray-600">
                        {team?.name ?? '—'}
                      </Td>
                      <Td className="px-4 py-2.5 text-gray-500">
                        {wf?.name ?? '—'}
                      </Td>
                      <Td className="px-4 py-2.5">
                        <span className={cn('text-xs font-medium', sm.text)}>
                          {sm.label}
                        </span>
                      </Td>
                      <Td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
                            <div
                              className={cn('h-full rounded-full', sm.bar)}
                              style={{ width: `${m.progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400">
                            {m.progress}%
                          </span>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
