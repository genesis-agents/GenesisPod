'use client';

import AppShell from '@/components/layout/AppShell';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { Send } from 'lucide-react';
import { MissionRunView } from '@/components/me/team/views/MissionRunView';

/**
 * /missions —— 我的团队任务（从 Agent 团队剥离的独立任务区）。
 * 下达任务 + 任务卡片列表，点卡进整页详情（类 playground 的六 Tab 视图）。
 */
export default function MissionsPage() {
  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50/50">
        <PageHeaderHero
          module="ask"
          icon={<Send className="h-7 w-7 text-white" />}
          title="我的团队任务"
          subtitle="给团队下达任务，实时看协作过程，完成后查看完整研究报告"
        />
        <div className="mx-auto w-full max-w-7xl px-8 pb-12 pt-5">
          <MissionRunView />
        </div>
      </div>
    </AppShell>
  );
}
