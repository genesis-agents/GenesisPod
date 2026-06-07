'use client';

import { Plus } from 'lucide-react';
import { toast } from '@/stores';
import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';
import type {
  AnyListing,
  WorkflowListing,
} from '@/components/marketplace/marketplace.types';
import { TeamResourceSection } from './TeamResourceSection';

/**
 * 团队工作流 —— 已从「工作流市场」获取的 SOP 库（独立资源，可被任意 Team 套用）。
 * design.md §5.3。风格与团队工具/技能统一（共用 TeamResourceSection）。
 */
export function TeamWorkflowsSection() {
  const { acquiredWorkflowIds, teams, createTeam, setWorkflow } =
    useCompanyStore();

  const items = acquiredWorkflowIds
    .map((id) => findListing(id))
    .filter((x): x is WorkflowListing => !!x && x.kind === 'workflow');

  const usageCount = (wfId: string) =>
    teams.filter((t) => t.workflowId === wfId).length;

  return (
    <TeamResourceSection
      kind="workflow"
      items={items}
      unitLabel="套工作流"
      marketLabel="工作流市场"
      hint="获取更多 SOP。"
      emptyTitle="还没有工作流"
      emptyDesc="去工作流市场获取现成的团队 SOP"
      renderMeta={(item) => {
        const wf = item as WorkflowListing;
        return wf.stages.map((s, i) => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              {s}
            </span>
            {i < wf.stages.length - 1 && (
              <span className="text-gray-300">→</span>
            )}
          </span>
        ));
      }}
      renderUsage={(item) => {
        const wf = item as WorkflowListing;
        return `${wf.teamSize} 人阵型 · 已被 ${usageCount(wf.id)} 个团队使用`;
      }}
      action={{
        icon: Plus,
        label: '套用',
        onClick: (item: AnyListing) => {
          const wf = item as WorkflowListing;
          const id = createTeam(`${wf.name}小组`);
          setWorkflow(id, wf.id);
          toast.success(`已用「${wf.name}」套用出新团队`);
        },
      }}
    />
  );
}

export default TeamWorkflowsSection;
