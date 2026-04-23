/**
 * Topic Insights 17 agent 声明式 spec 聚合入口
 *
 * 目标架构 v2（docs/design/topic-insights-harness-redesign/11-target-architecture.md）：
 * topic-insights.module.ts onModuleInit 遍历 TOPIC_INSIGHTS_AGENT_SPECS，
 * 调 L2 AgentFactory.create(spec) → L2 AgentRegistry.register(agent)。
 *
 * 迁移进度：
 *   ✅ AG-01-LD LeaderPlanner
 *   ⏳ AG-03-SW / AG-04-SR / AG-05-MEX / AG-06-QR / AG-11-SY (Core 6)
 *   ⏳ AG-08-DP / AG-09-HV / AG-10-GS / AG-14-FC / AG-13-RE (Enhancement 5)
 *   ⏳ AG-12-SREM / AG-15-RED / AG-16-MA / AG-17-LDP + LATEX (Advanced)
 *
 * P2-1 第一个落地的是 Leader，作为模式参考；其余 spec 按同一模板逐步迁移。
 */

import type { IAgentSpec } from "@/modules/ai-engine/harness/abstractions";
import { LEADER_PLANNER_SPEC } from "./leader-planner";

export { LEADER_PLANNER_SPEC } from "./leader-planner";
export type { LeaderPlannerInput } from "./leader-planner";

/**
 * 全部 topic-insights agent spec 的聚合数组。
 * onModuleInit 统一遍历这个数组注册。
 *
 * 当新增 spec 时：import 到本文件并 push 到数组。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const TOPIC_INSIGHTS_AGENT_SPECS: ReadonlyArray<IAgentSpec<any, any>> = [
  LEADER_PLANNER_SPEC,
  // 其他 16 spec 按 P2-1 后续迭代追加
];
