'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  Star,
  X,
  UserPlus,
  Workflow as WorkflowIcon,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { cn } from '@/lib/utils/common';
import { toast } from '@/stores';
import { useCompanyStore } from '@/stores/company/companyStore';
import { AgentAvatar, RoleTag, seniorityLabel } from '../team-shared';

export function ComposerView({
  focusTeamId,
}: {
  focusTeamId?: string | null;
} = {}) {
  const {
    teams,
    hired,
    createTeam,
    deleteTeam,
    addMember,
    removeMember,
    setLeader,
    setWorkflow,
    renameTeam,
    teamWorkflows,
  } = useCompanyStore();

  const [activeTeamId, setActiveTeamId] = useState<string | null>(
    focusTeamId ?? teams[0]?.id ?? null
  );

  // 从管理团队组织图点击跳转过来时，聚焦到对应团队
  useEffect(() => {
    if (focusTeamId) setActiveTeamId(focusTeamId);
  }, [focusTeamId]);
  const [showAddMember, setShowAddMember] = useState(false);

  const activeTeam =
    teams.find((t) => t.id === activeTeamId) ?? teams[0] ?? null;

  const handleCreateTeam = () => {
    void createTeam(`新团队 ${teams.length + 1}`).then((id) => {
      if (id) setActiveTeamId(id);
      toast.success('已创建新团队');
    });
  };

  const memberOf = (id: string) => hired.find((h) => h.instanceId === id);
  const availableToAdd = hired.filter(
    (h) => !activeTeam?.memberIds.includes(h.instanceId)
  );

  return (
    <div className="flex flex-col gap-5 lg:flex-row">
      {/* 左：团队列表 */}
      <aside className="w-full flex-shrink-0 lg:w-52">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            团队
          </h3>
          <button
            onClick={handleCreateTeam}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> 新建
          </button>
        </div>
        <div className="space-y-1">
          {teams.map((t) => {
            const leader = memberOf(t.leaderId ?? '');
            return (
              <button
                key={t.id}
                onClick={() => setActiveTeamId(t.id)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                  t.id === activeTeam?.id
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                {leader ? (
                  <AgentAvatar agent={leader} size="xs" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
                    <WorkflowIcon className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {t.name}
                </span>
                <span className="text-xs text-gray-400">
                  {t.memberIds.length}
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      {/* 右：选中团队画布 */}
      <div className="min-w-0 flex-1">
        {!activeTeam ? (
          <EmptyState
            type="default"
            title="还没有团队"
            description="点左侧「新建」组建第一个专家团队"
            action={{ label: '新建团队', onClick: handleCreateTeam }}
          />
        ) : (
          <div className="space-y-4">
            {/* 团队头 + 工作流 */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex min-w-0 items-center gap-2">
                <input
                  value={activeTeam.name}
                  onChange={(e) =>
                    void renameTeam(activeTeam.id, e.target.value)
                  }
                  aria-label="团队名称"
                  className="min-w-0 max-w-[14rem] rounded-md border border-transparent bg-transparent px-1.5 py-0.5 text-lg font-semibold text-gray-900 transition-colors hover:border-gray-200 focus:border-gray-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="flex-shrink-0 text-xs text-gray-400">
                  {activeTeam.memberIds.filter((mid) => memberOf(mid)).length}{' '}
                  名成员
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">工作流</label>
                <select
                  value={activeTeam.workflowId ?? ''}
                  onChange={(e) =>
                    void setWorkflow(activeTeam.id, e.target.value || null)
                  }
                  className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">未选择</option>
                  {teamWorkflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => {
                    void deleteTeam(activeTeam.id);
                    setActiveTeamId(null);
                    toast.info('已解散该团队');
                  }}
                  className="rounded-md px-2 py-1.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
                >
                  解散
                </button>
              </div>
            </div>

            {/* 成员画布 */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {activeTeam.memberIds.map((mid) => {
                const m = memberOf(mid);
                if (!m) return null;
                const isLeader = activeTeam.leaderId === mid;
                return (
                  <div
                    key={mid}
                    className={cn(
                      'group relative rounded-xl border bg-white p-3 transition-colors',
                      isLeader
                        ? 'border-amber-300 ring-1 ring-amber-200'
                        : 'border-gray-200'
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <AgentAvatar agent={m} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {m.name}
                          </span>
                          <RoleTag kind={isLeader ? 'leader' : 'member'} />
                        </div>
                        <p className="truncate text-xs text-gray-400">
                          {m.role} · {seniorityLabel(m)}
                        </p>
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1 text-xs text-gray-500">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      {m.skillIds.length}
                      <Wrench className="ml-1.5 h-3 w-3 text-blue-500" />
                      {m.toolIds.length}
                    </div>

                    <div className="mt-3 flex items-center gap-1 border-t border-gray-100 pt-2.5">
                      <button
                        onClick={() => void setLeader(activeTeam.id, mid)}
                        disabled={isLeader}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                          isLeader
                            ? 'cursor-default text-amber-600'
                            : 'text-gray-500 hover:bg-amber-50 hover:text-amber-600'
                        )}
                      >
                        <Star
                          className={cn(
                            'h-3.5 w-3.5',
                            isLeader && 'fill-amber-400'
                          )}
                        />
                        {isLeader ? 'Leader' : '设为 Leader'}
                      </button>
                      <button
                        onClick={() => void removeMember(activeTeam.id, mid)}
                        className="ml-auto rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                        aria-label="移出团队"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* 添加成员卡 */}
              <button
                onClick={() => setShowAddMember(true)}
                className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 transition-colors hover:border-primary hover:text-primary"
              >
                <UserPlus className="h-6 w-6" />
                <span className="text-sm font-medium">添加成员</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 添加成员 Modal */}
      {showAddMember && activeTeam && (
        <Modal
          open
          onClose={() => setShowAddMember(false)}
          size="md"
          title="从人才库添加成员"
          subtitle={`加入「${activeTeam.name}」`}
        >
          {availableToAdd.length === 0 ? (
            <EmptyState
              type="default"
              size="sm"
              title="没有可添加的专家"
              description="人才库里的人都在这个团队了"
              action={
                <Link
                  href="/marketplace"
                  className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  去市场招人
                </Link>
              }
            />
          ) : (
            <div className="space-y-2">
              {availableToAdd.map((a) => (
                <button
                  key={a.instanceId}
                  onClick={() => {
                    void addMember(activeTeam.id, a.instanceId);
                    toast.success(`已把 ${a.name} 加入 ${activeTeam.name}`);
                  }}
                  className="flex w-full items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-primary hover:bg-gray-50"
                >
                  <AgentAvatar agent={a} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900">
                      {a.name}
                    </div>
                    <div className="truncate text-xs text-gray-400">
                      {a.role} · {seniorityLabel(a)}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
