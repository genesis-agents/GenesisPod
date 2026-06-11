'use client';

import { MyTeamView } from './views/MyTeamView';

/**
 * 专家团队 —— 个人中心「我的团队」分组下的专家团 section。
 * 与主侧栏「我的专家团」(/agents) 一致：heroes 模型双 Tab（我的专家 / 专家任务）。
 * 复用 MyTeamView，保证两处入口体验完全一致。
 */
export function AgentTeamSection() {
  return <MyTeamView />;
}

export default AgentTeamSection;
