/**
 * Topic Insights · L5 IntentRouter / L4 OpenAPI 对外入口
 *
 * - TopicInsightsAgent: L5 IntentRouter 注册的 L2 IPlanBasedAgent 代表
 * - TOPIC_INSIGHTS_TEAM_CONFIG: L2 TeamRegistry 注册的 team config
 * - DispatcherService: AG-17-LDP 意图分类器（HTTP 入口）
 */
export { TopicInsightsAgent } from "./intent.agent";
export { TOPIC_INSIGHTS_TEAM_CONFIG } from "./team.config";
export { DispatcherService } from "./dispatcher.service";
export type { DispatchRequest, DispatchResponse } from "./dispatcher.service";
