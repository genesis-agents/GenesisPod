'use client';

import { useCompanyStore } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';
import {
  TOOL_SOURCE_LABEL,
  type ToolListing,
} from '@/components/marketplace/marketplace.types';
import { TeamResourceSection } from './TeamResourceSection';

/**
 * 团队工具 —— 已从「工具市场」获取的工具库（独立资源，可装配给任意 Agent）。
 * 风格与团队工作流/技能统一（共用 TeamResourceSection）。design.md §5.3。
 */
export function TeamToolsSection() {
  const { acquiredToolIds, hired } = useCompanyStore();

  const items = acquiredToolIds
    .map((id) => findListing(id))
    .filter((x): x is ToolListing => !!x && x.kind === 'tool');

  const equippedCount = (toolId: string) =>
    hired.filter((a) => a.toolIds.includes(toolId)).length;

  return (
    <TeamResourceSection
      kind="tool"
      items={items}
      unitLabel="个工具"
      marketLabel="工具市场"
      hint="获取更多工具。"
      emptyTitle="还没有工具"
      emptyDesc="去工具市场获取团队可用的工具"
      renderMeta={(item) => {
        const t = item as ToolListing;
        return (
          <>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              来自 {TOOL_SOURCE_LABEL[t.source]}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
              {t.category}
            </span>
          </>
        );
      }}
      renderUsage={(item) => `已被 ${equippedCount(item.id)} 名成员装配`}
    />
  );
}

export default TeamToolsSection;
