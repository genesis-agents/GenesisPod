'use client';

import { Crown, Star } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import {
  useCompanyStore,
  type HiredAgent,
} from '@/stores/company/companyStore';
import { SENIORITY_LABEL } from '@/components/marketplace/marketplace.types';

/** Agent 头像（渐变圆角 + 首字）。 */
export function AgentAvatar({
  agent,
  size = 'md',
  className,
}: {
  agent: Pick<HiredAgent, 'name' | 'avatarGradient'>;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim = {
    xs: 'h-7 w-7 text-xs rounded-lg',
    sm: 'h-9 w-9 text-sm rounded-lg',
    md: 'h-11 w-11 text-base rounded-xl',
    lg: 'h-14 w-14 text-xl rounded-xl',
  }[size];
  return (
    <div
      className={cn(
        'flex flex-shrink-0 items-center justify-center bg-gradient-to-br font-semibold text-white shadow-sm',
        dim,
        agent.avatarGradient,
        className
      )}
    >
      {agent.name[0]}
    </div>
  );
}

/** 角色小标签：CEO / Leader / 成员。 */
export function RoleTag({ kind }: { kind: 'ceo' | 'leader' | 'member' }) {
  if (kind === 'ceo')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white">
        <Crown className="h-3 w-3" /> CEO
      </span>
    );
  if (kind === 'leader')
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
        <Star className="h-3 w-3" /> Leader
      </span>
    );
  return (
    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
      成员
    </span>
  );
}

export function seniorityLabel(a: HiredAgent) {
  return SENIORITY_LABEL[a.seniority];
}

/**
 * 管理团队组织图（虚拟）：董事长 → CEO → 各 Team Leader。
 * 这是"多 Team 协同"的组织化表达（design.md §2）。
 * 传入 onSelectTeam 时，Leader 节点可点击跳转到对应团队。
 */
export function ManagementOrgChart({
  onSelectTeam,
}: {
  onSelectTeam?: (teamId: string) => void;
} = {}) {
  const { hired, ceoId, teams } = useCompanyStore();
  const byId = (id: string | null) =>
    id ? (hired.find((h) => h.instanceId === id) ?? null) : null;
  const ceo = byId(ceoId);
  const leaders = teams
    .map((t) => ({ team: t, leader: byId(t.leaderId) }))
    .filter((x) => x.leader);

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          管理团队 · 虚拟
        </span>
        <span className="text-xs text-slate-400">CEO + 各 Team Leader</span>
      </div>

      <div className="flex flex-col items-center gap-1">
        {/* 董事长 */}
        <div className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white">
          董事长（你）
        </div>
        <div className="h-4 w-px bg-slate-300" />

        {/* CEO */}
        {ceo ? (
          <div className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 shadow-sm">
            <AgentAvatar agent={ceo} size="sm" />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                {ceo.name} <RoleTag kind="ceo" />
              </div>
              <div className="text-xs text-gray-400">{ceo.role}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-2 text-xs text-slate-400">
            尚未任命 CEO
          </div>
        )}

        {leaders.length > 0 && <div className="h-4 w-px bg-slate-300" />}

        {/* Leaders（传入 onSelectTeam 时可点击跳转到该团队）*/}
        {leaders.length > 0 && (
          <div className="flex flex-wrap items-start justify-center gap-3">
            {leaders.map(({ team, leader }) => (
              <button
                key={team.id}
                type="button"
                onClick={() => onSelectTeam?.(team.id)}
                disabled={!onSelectTeam}
                className={cn(
                  'flex w-36 flex-col items-center rounded-xl border border-gray-200 bg-white px-2 py-2 text-center',
                  onSelectTeam &&
                    'cursor-pointer transition-colors hover:border-slate-300 hover:bg-slate-50'
                )}
              >
                <AgentAvatar agent={leader!} size="sm" />
                <div className="mt-1 flex items-center gap-1 text-xs font-medium text-gray-900">
                  {leader!.name}
                  <RoleTag kind="leader" />
                </div>
                <div className="mt-0.5 truncate text-[11px] text-gray-400">
                  {team.name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
