'use client';

import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Network,
  Users2,
  Contact,
  Crown,
  Send,
} from 'lucide-react';
import { Tabs } from '@/components/ui/tabs';
import { LoadingState } from '@/components/ui/states/LoadingState';
import { ManagementOrgChart } from './team-shared';
import { DashboardView } from './views/DashboardView';
import { ComposerView } from './views/ComposerView';
import { TalentPoolView } from './views/TalentPoolView';
import { AppointCeoView } from './views/AppointCeoView';
import { MissionRunView } from './views/MissionRunView';
import { useCompanyStore } from '@/stores/company/companyStore';

type TeamTab = 'dashboard' | 'org' | 'compose' | 'talent' | 'ceo' | 'mission';

/**
 * Agent 团队 —— 一人公司 OS（个人中心「我的团队」分组下的核心 section）。
 * 内部 Tab 切换；管理团队组织图为独立 tab（2026-06-07 用户反馈：原常驻顶部 banner
 * 会挤占所有 tab 的呈现），且组织图节点支持跳转到对应团队（→ 组队 tab 并聚焦）。
 */
export function AgentTeamSection() {
  const [tab, setTab] = useState<TeamTab>('dashboard');
  const [focusTeamId, setFocusTeamId] = useState<string | null>(null);
  const { loading, loadCompany } = useCompanyStore();

  useEffect(() => {
    void loadCompany();
  }, [loadCompany]);

  const gotoTeam = (teamId: string) => {
    setFocusTeamId(teamId);
    setTab('compose');
  };

  if (loading) {
    return <LoadingState text="加载团队数据中..." />;
  }

  return (
    <div className="space-y-5">
      <Tabs
        variant="pill"
        items={[
          { key: 'dashboard', label: '驾驶舱', icon: LayoutDashboard },
          { key: 'org', label: '管理团队', icon: Network },
          { key: 'compose', label: '组队', icon: Users2 },
          { key: 'talent', label: '人才库', icon: Contact },
          { key: 'ceo', label: '任命 CEO', icon: Crown },
          { key: 'mission', label: '任务', icon: Send },
        ]}
        value={tab}
        onChange={(k) => setTab(k as TeamTab)}
      />

      <div>
        {tab === 'dashboard' && (
          <DashboardView onGoMission={() => setTab('mission')} />
        )}
        {tab === 'org' && <ManagementOrgChart onSelectTeam={gotoTeam} />}
        {tab === 'compose' && <ComposerView focusTeamId={focusTeamId} />}
        {tab === 'talent' && <TalentPoolView />}
        {tab === 'ceo' && <AppointCeoView />}
        {tab === 'mission' && <MissionRunView />}
      </div>
    </div>
  );
}

export default AgentTeamSection;
