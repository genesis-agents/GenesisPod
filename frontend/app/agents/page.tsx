'use client';

import AppShell from '@/components/layout/AppShell';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { Users2 } from 'lucide-react';
import { AgentTeamSection } from '@/components/me/team/AgentTeamSection';

/**
 * /agents —— 我的 Agent 团队（一人公司 OS，左侧主菜单「我的工作台」组）。
 * 与个人设置里的 Agent 团队同内容（共用 AgentTeamSection）；任务已剥离到 /missions。
 */
export default function AgentsPage() {
  return (
    <AppShell>
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-y-auto bg-gray-50/50">
        <PageHeaderHero
          module="ask"
          icon={<Users2 className="h-7 w-7 text-white" />}
          title="我的 Agent 团队"
          subtitle="一人公司：招募 Agent、组队、任命 CEO、编排管理团队"
        />
        <div className="mx-auto w-full max-w-7xl px-8 pb-12 pt-5">
          <AgentTeamSection />
        </div>
      </div>
    </AppShell>
  );
}
