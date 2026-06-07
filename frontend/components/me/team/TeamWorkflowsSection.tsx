'use client';

import { Plus } from 'lucide-react';
import { toast } from '@/stores';
import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';
import type { WorkflowListing } from '@/components/marketplace/marketplace.types';
import {
  TeamResourceSection,
  type TeamResourceCard,
} from './TeamResourceSection';

/**
 * 团队工作流 —— 已获取的 SOP 库，按分类分组的卡片呈现，可套用为新 Team。
 * 工作流暂无真实后端目录，沿用 mock store（design.md §5.3 / M1 再接真数据）。
 */
export function TeamWorkflowsSection() {
  const { acquiredWorkflowIds, teams, createTeam, setWorkflow } =
    useCompanyStore();

  const workflows = acquiredWorkflowIds
    .map((id) => findListing(id))
    .filter((x): x is WorkflowListing => !!x && x.kind === 'workflow');

  const usageCount = (wfId: string) =>
    teams.filter((t) => t.workflowId === wfId).length;

  const cards: TeamResourceCard[] = workflows.map((wf) => ({
    id: wf.id,
    name: wf.name,
    subtitle: wf.tagline,
    category: wf.category,
    meta: wf.stages.map((s, i) => (
      <span key={s} className="inline-flex items-center gap-1.5">
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
          {s}
        </span>
        {i < wf.stages.length - 1 && <span className="text-gray-300">→</span>}
      </span>
    )),
    usage: `${wf.teamSize} 人阵型 · 已被 ${usageCount(wf.id)} 个团队使用`,
  }));

  return (
    <TeamResourceSection
      kind="workflow"
      cards={cards}
      unitLabel="套工作流"
      marketLabel="工作流市场"
      hint="获取更多 SOP。"
      emptyTitle="还没有工作流"
      emptyDesc="去工作流市场获取现成的团队 SOP"
      action={{
        icon: Plus,
        label: '套用',
        onClick: (id) => {
          const wf = findListing(id);
          if (wf && wf.kind === 'workflow') {
            const teamId = createTeam(`${wf.name}小组`);
            setWorkflow(teamId, wf.id);
            toast.success(`已用「${wf.name}」套用出新团队`);
          }
        },
      }}
    />
  );
}

export default TeamWorkflowsSection;
