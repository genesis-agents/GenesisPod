'use client';

import Link from 'next/link';
import { Workflow as WorkflowIcon, Plus, ArrowUpRight } from 'lucide-react';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { toast } from '@/stores';
import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';
import type { WorkflowListing } from '@/components/marketplace/marketplace.types';

/**
 * 团队工作流 —— 我已从「工作流市场」获取的 SOP 库（独立资源，可被任意 Team 套用）。
 * design.md §5.3。
 */
export function TeamWorkflowsSection() {
  const { acquiredWorkflowIds, teams, createTeam, setWorkflow } =
    useCompanyStore();

  const workflows = acquiredWorkflowIds
    .map((id) => findListing(id))
    .filter((x): x is WorkflowListing => !!x && x.kind === 'workflow');

  const usageCount = (wfId: string) =>
    teams.filter((t) => t.workflowId === wfId).length;

  const applyAsNewTeam = (wf: WorkflowListing) => {
    const id = createTeam(`${wf.name}小组`);
    setWorkflow(id, wf.id);
    toast.success(`已用「${wf.name}」套用出新团队`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          已获取 {workflows.length} 套工作流。去
          <Link
            href="/marketplace"
            className="mx-1 font-medium text-primary hover:underline"
          >
            工作流市场
          </Link>
          获取更多 SOP。
        </p>
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          去市场 <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {workflows.length === 0 ? (
        <EmptyState
          type="default"
          title="还没有工作流"
          description="去工作流市场获取现成的团队 SOP"
          action={{
            label: '去市场',
            onClick: () => {
              window.location.href = '/marketplace';
            },
          }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="flex flex-col rounded-xl border border-gray-200 bg-white p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-sm">
                  <WorkflowIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold text-gray-900">
                    {wf.name}
                  </h3>
                  <p className="line-clamp-1 text-xs text-gray-500">
                    {wf.tagline}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {wf.stages.map((s, i) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                      {s}
                    </span>
                    {i < wf.stages.length - 1 && (
                      <span className="text-gray-300">→</span>
                    )}
                  </span>
                ))}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-400">
                <span>
                  {wf.teamSize} 人阵型 · 已被 {usageCount(wf.id)} 个团队使用
                </span>
                <button
                  onClick={() => applyAsNewTeam(wf)}
                  className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  <Plus className="h-3.5 w-3.5" /> 套用
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TeamWorkflowsSection;
