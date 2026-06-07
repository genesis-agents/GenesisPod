'use client';

import { useState } from 'react';
import { LayoutDashboard, Users2, Contact, Crown, Send } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { ManagementOrgChart } from './team-shared';
import { DashboardView } from './views/DashboardView';
import { ComposerView } from './views/ComposerView';
import { TalentPoolView } from './views/TalentPoolView';
import { AppointCeoView } from './views/AppointCeoView';
import { MissionRunView } from './views/MissionRunView';

type TeamTab = 'dashboard' | 'compose' | 'talent' | 'ceo' | 'mission';

/**
 * Agent 团队 —— 一人公司 OS（个人中心「我的团队」分组下的核心 section）。
 * 布局方案 A：顶部管理团队组织图横幅 + 内部 Tab 切换。
 * 详见 docs/features/one-person-company-os/design.md §5.2、§9.1。
 */
export function AgentTeamSection() {
  const [tab, setTab] = useState<TeamTab>('dashboard');

  return (
    <div className="space-y-5">
      {/* 顶部：管理团队组织图 */}
      <ManagementOrgChart />

      {/* 内部 Tab */}
      <Tabs
        variant="pill"
        items={[
          { key: 'dashboard', label: '驾驶舱', icon: LayoutDashboard },
          { key: 'compose', label: '组队', icon: Users2 },
          { key: 'talent', label: '人才库', icon: Contact },
          { key: 'ceo', label: '任命 CEO', icon: Crown },
          { key: 'mission', label: '任务', icon: Send },
        ]}
        value={tab}
        onChange={(k) => setTab(k as TeamTab)}
      />

      {/* 内容 */}
      <div>
        {tab === 'dashboard' && (
          <DashboardView onGoMission={() => setTab('mission')} />
        )}
        {tab === 'compose' && <ComposerView />}
        {tab === 'talent' && <TalentPoolView />}
        {tab === 'ceo' && <AppointCeoView />}
        {tab === 'mission' && <MissionRunView />}
      </div>
    </div>
  );
}

export default AgentTeamSection;
