'use client';

import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';
import type { SkillListing } from '@/components/marketplace/marketplace.types';
import { TeamResourceSection } from './TeamResourceSection';

/**
 * 团队技能 —— 已从「技能市场」获取的技能库（独立资源，可装配给任意 Agent）。
 * 风格与团队工具/工作流统一（共用 TeamResourceSection）。design.md §5.3。
 */
export function TeamSkillsSection() {
  const { acquiredSkillIds, hired } = useCompanyStore();

  const items = acquiredSkillIds
    .map((id) => findListing(id))
    .filter((x): x is SkillListing => !!x && x.kind === 'skill');

  const masteredCount = (skillId: string) =>
    hired.filter((a) => a.skillIds.includes(skillId)).length;

  return (
    <TeamResourceSection
      kind="skill"
      items={items}
      unitLabel="项技能"
      marketLabel="技能市场"
      hint="获取更多技能。"
      emptyTitle="还没有技能"
      emptyDesc="去技能市场获取团队可用的技能"
      renderMeta={(item) => {
        const s = item as SkillListing;
        return (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
            适用 {s.activatesFor.join(' / ')}
          </span>
        );
      }}
      renderUsage={(item) => `已被 ${masteredCount(item.id)} 名成员掌握`}
    />
  );
}

export default TeamSkillsSection;
