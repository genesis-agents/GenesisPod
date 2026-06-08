'use client';

import { useState } from 'react';
import Link from 'next/link';
import { UserPlus, Trash2, Sparkles, Wrench, Settings2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.catalog';
import { AgentAvatar, RoleTag, seniorityLabel } from '../team-shared';
import { AgentConfigModal } from '../AgentConfigModal';

export function TalentPoolView() {
  const { hired, ceoId, teams, fireAgent } = useCompanyStore();
  const [configId, setConfigId] = useState<string | null>(null);

  const leaderIds = new Set(teams.map((t) => t.leaderId).filter(Boolean));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          已招募 {hired.length} 名 Agent。去
          <Link
            href="/marketplace"
            className="mx-1 font-medium text-primary hover:underline"
          >
            智能体市场
          </Link>
          招更多人。
        </p>
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <UserPlus className="h-4 w-4" /> 去招人
        </Link>
      </div>

      {hired.length === 0 ? (
        <EmptyState
          type="default"
          title="人才库是空的"
          description="先去智能体市场招聘 Agent"
          action={{
            label: '去招人',
            onClick: () => {
              window.location.href = '/marketplace';
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {hired.map((a) => {
            const role: 'ceo' | 'leader' | 'member' =
              a.instanceId === ceoId
                ? 'ceo'
                : leaderIds.has(a.instanceId)
                  ? 'leader'
                  : 'member';
            return (
              <div
                key={a.instanceId}
                className="flex flex-col rounded-xl border border-gray-200 bg-white p-4"
              >
                <div className="flex items-start gap-3">
                  <AgentAvatar agent={a} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h3 className="truncate font-semibold text-gray-900">
                        {a.name}
                      </h3>
                      <RoleTag kind={role} />
                    </div>
                    <p className="text-xs text-gray-500">
                      {a.role} · {seniorityLabel(a)} ·{' '}
                      {a.models.join(' → ') || '—'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-1.5 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                    {a.skillIds.length === 0
                      ? '无技能'
                      : a.skillIds
                          .map((id) => findListing(id)?.name ?? id)
                          .join('、')}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Wrench className="h-3.5 w-3.5 text-blue-500" />
                    {a.toolIds.length === 0
                      ? '无工具'
                      : a.toolIds
                          .map((id) => findListing(id)?.name ?? id)
                          .join('、')}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                  <button
                    onClick={() => setConfigId(a.instanceId)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100"
                  >
                    <Settings2 className="h-3.5 w-3.5" /> 配置
                  </button>
                  <button
                    onClick={() => void fireAgent(a.instanceId)}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 解雇
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {configId && (
        <AgentConfigModal
          instanceId={configId}
          onClose={() => setConfigId(null)}
        />
      )}
    </div>
  );
}
