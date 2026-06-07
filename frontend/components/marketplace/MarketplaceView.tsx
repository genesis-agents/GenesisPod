'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Store, ArrowUpRight } from 'lucide-react';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/stores';
import { useCompanyStore } from '@/stores/company/companyStore';
import { ALL_LISTINGS } from './marketplace.mock';
import type { AnyListing, ListingKind } from './marketplace.types';
import { KIND_META } from './listing-shared';
import { ShelfGrid } from './ShelfGrid';
import { ListingDetailDrawer } from './ListingDetailDrawer';

const SHELVES: ListingKind[] = ['agent', 'skill', 'tool', 'workflow'];

export function MarketplaceView() {
  const [tab, setTab] = useState<ListingKind>('agent');
  const [detail, setDetail] = useState<AnyListing | null>(null);

  const {
    hired,
    acquiredSkillIds,
    acquiredToolIds,
    teamWorkflows,
    hireAgent,
    acquireSkill,
    acquireTool,
    acquireWorkflow,
  } = useCompanyStore();

  const isAcquired = (l: AnyListing): boolean => {
    switch (l.kind) {
      case 'agent':
        return hired.some((h) => h.listingId === l.id);
      case 'skill':
        return acquiredSkillIds.includes(l.id);
      case 'tool':
        return acquiredToolIds.includes(l.id);
      case 'workflow':
        return teamWorkflows.some((w) => w.sourceListingId === l.id);
    }
  };

  const acquire = (l: AnyListing) => {
    switch (l.kind) {
      case 'agent':
        hireAgent(l);
        toast.success(`已招聘「${l.name}」到我的团队`);
        break;
      case 'skill':
        acquireSkill(l.id);
        toast.success(`已加入团队技能：${l.name}`);
        break;
      case 'tool':
        acquireTool(l.id);
        toast.success(`已加入团队工具：${l.name}`);
        break;
      case 'workflow':
        acquireWorkflow(l.id);
        toast.success(`已加入团队工作流：${l.name}`);
        break;
    }
    setDetail(null);
  };

  const tabItems = SHELVES.map((k) => ({
    key: k,
    label: `${KIND_META[k].label}市场`,
    count: ALL_LISTINGS[k].length,
  }));

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50/50">
      <PageHeaderHero
        module="market"
        icon={<Store className="h-7 w-7 text-white" />}
        title="智能体市场"
        subtitle="平台共享货架 —— 招 Agent、配技能与工具、套用工作流，带回「我的团队」"
        actions={
          <Link
            href="/me/agents"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            我的团队
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        }
      >
        <Tabs
          items={tabItems}
          value={tab}
          onChange={(k) => setTab(k as ListingKind)}
        />
      </PageHeaderHero>

      <div className="mx-auto w-full max-w-7xl px-8 pb-12">
        <ShelfGrid
          listings={ALL_LISTINGS[tab] as AnyListing[]}
          isAcquired={(id) =>
            isAcquired(
              (ALL_LISTINGS[tab] as AnyListing[]).find((x) => x.id === id)!
            )
          }
          onOpen={setDetail}
          onAcquire={acquire}
        />
      </div>

      <ListingDetailDrawer
        listing={detail}
        acquired={detail ? isAcquired(detail) : false}
        onClose={() => setDetail(null)}
        onAcquire={() => detail && acquire(detail)}
      />
    </div>
  );
}
