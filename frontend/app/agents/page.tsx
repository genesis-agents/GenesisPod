'use client';

import AppShell from '@/components/layout/AppShell';
import { HeroRosterView } from '@/components/me/hero/HeroRosterView';

/**
 * /agents —— 我的英雄（一人公司 OS，左侧主菜单「我的工作台」组）。
 * 单能力官名册：配模型、改名、下任务、移除；任务执行在 /missions。
 */
export default function AgentsPage() {
  return (
    <AppShell>
      <HeroRosterView />
    </AppShell>
  );
}
