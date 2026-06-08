'use client';

import AppShell from '@/components/layout/AppShell';
import { AgentTeamSection } from '@/components/me/team/AgentTeamSection';

/**
 * /agents —— 我的 Agent 团队（一人公司 OS，左侧主菜单「我的工作台」组）。
 * 与个人设置里的 Agent 团队同内容（共用 AgentTeamSection，自带 PageHeaderHero + Tabs）；
 * 任务已剥离到 /missions。
 */
export default function AgentsPage() {
  return (
    <AppShell>
      <AgentTeamSection />
    </AppShell>
  );
}
