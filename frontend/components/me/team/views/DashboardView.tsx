'use client';

import { Users, ListChecks, BellRing, Coins, ArrowRight } from 'lucide-react';
import { StatCard } from '@/components/ui/cards/StatCard';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { cn } from '@/lib/utils/common';
import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';
import { AgentAvatar } from '../team-shared';

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

// 待审批为 M0 mock（真实接 leader signoff / human-approval）
const PENDING_APPROVALS = [
  { id: 'a1', team: '内容组', what: '季度复盘报告终稿', when: '5 分钟前' },
  { id: 'a2', team: '研发组', what: '竞品调研结论签字', when: '21 分钟前' },
];

export function DashboardView({ onGoMission }: { onGoMission: () => void }) {
  const { teams, hired, missions } = useCompanyStore();
  const running = missions.filter(
    (m) => m.status === 'running' || m.status === 'review'
  );
  const monthlySpend = 128; // mock

  return (
    <div className="space-y-6">
      {/* 指标 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Agent Team"
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
          label="待审批"
          value={PENDING_APPROVALS.length}
          icon={<BellRing className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          label="本月算力"
          value={`¥${monthlySpend}`}
          icon={<Coins className="h-5 w-5" />}
          tone="emerald"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 各 Team 在忙啥 */}
        <div className="lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              各 Team 在忙什么
            </h3>
            <button
              onClick={onGoMission}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              查看全部任务 <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {teams.length === 0 ? (
            <EmptyState
              type="default"
              title="还没有团队"
              description="去「组队」建第一个 Team"
              size="sm"
            />
          ) : (
            <div className="space-y-3">
              {teams.map((team) => {
                const leader = hired.find(
                  (h) => h.instanceId === team.leaderId
                );
                const wf = team.workflowId
                  ? findListing(team.workflowId)
                  : null;
                const teamMissions = missions.filter(
                  (m) => m.teamId === team.id
                );
                return (
                  <div
                    key={team.id}
                    className="rounded-xl border border-gray-200 bg-white p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {leader && <AgentAvatar agent={leader} size="sm" />}
                        <div className="leading-tight">
                          <div className="text-sm font-semibold text-gray-900">
                            {team.name}
                          </div>
                          <div className="text-xs text-gray-400">
                            {team.memberIds.length} 名成员
                            {wf ? ` · ${wf.name}` : ''}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      {teamMissions.length === 0 ? (
                        <p className="text-xs text-gray-400">暂无任务</p>
                      ) : (
                        teamMissions.map((m) => {
                          const sm = STATUS_META[m.status];
                          return (
                            <div key={m.id}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="truncate text-gray-700">
                                  {m.title}
                                </span>
                                <span className={cn('flex-shrink-0', sm.text)}>
                                  {sm.label} {m.progress}%
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all',
                                    sm.bar
                                  )}
                                  style={{ width: `${m.progress}%` }}
                                />
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 待审批 */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">待我审批</h3>
          <div className="space-y-2">
            {PENDING_APPROVALS.map((a) => (
              <div
                key={a.id}
                className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"
              >
                <div className="text-sm font-medium text-gray-900">
                  {a.what}
                </div>
                <div className="mt-0.5 text-xs text-gray-500">
                  {a.team} · {a.when}
                </div>
                <div className="mt-2 flex gap-2">
                  <button className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90">
                    批准
                  </button>
                  <button className="rounded-md bg-white px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50">
                    打回
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
