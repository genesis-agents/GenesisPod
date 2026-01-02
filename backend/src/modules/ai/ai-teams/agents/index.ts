/**
 * AI Teams Agents 模块导出
 *
 * 注意: TeamsLLMAdapter 已删除，请使用 AI Engine 的 FunctionCallingLLMAdapter
 * import { FunctionCallingLLMAdapter } from "@/modules/ai/ai-engine/llm";
 */

export { TeamMemberAgent } from "./team-member.agent";
export type {
  TeamMemberRole,
  TeamMemberAgentConfig,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./team-member.agent";

// Note: TeamCollaborationService is exported from ./services to avoid circular dependencies
