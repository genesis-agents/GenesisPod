'use client';

import { useState } from 'react';
import { Crown, ListChecks } from 'lucide-react';
import { Tabs } from '@/components/ui/tabs/Tabs';
import { HeroRosterView } from '@/components/me/hero/HeroRosterView';
import { MissionRunView } from '@/components/me/team/views/MissionRunView';

type TeamTab = 'roster' | 'missions';

/**
 * MyTeamView —— /agents「我的团队」。
 * 薄壳：顶部 canonical Tabs 切换「我的专家」（花名册）/「专家任务」（任务记录），
 * 两个子视图各自保留页头与滚动容器（零共享组件改造）。
 */
export function MyTeamView() {
  const [tab, setTab] = useState<TeamTab>('roster');

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-gray-50/50">
      <div className="flex-shrink-0 bg-white px-8 pt-3">
        <Tabs
          items={[
            { key: 'roster', label: '我的专家', icon: Crown },
            { key: 'missions', label: '专家任务', icon: ListChecks },
          ]}
          value={tab}
          onChange={(k) => setTab(k as TeamTab)}
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'roster' ? (
          <HeroRosterView onDispatch={() => setTab('missions')} />
        ) : (
          <MissionRunView />
        )}
      </div>
    </div>
  );
}

export default MyTeamView;
