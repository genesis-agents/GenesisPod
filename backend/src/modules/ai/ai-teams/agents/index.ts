/**
 * AI Teams Agents 模块导出
 */

export { TeamMemberAgent } from "./team-member.agent";
export type {
  TeamMemberRole,
  TeamMemberAgentConfig,
  ToolExecutionContext,
  ToolExecutionResult,
} from "./team-member.agent";

export { TeamsLLMAdapter } from "./teams-llm-adapter";
export type { TeamsLLMAdapterConfig } from "./teams-llm-adapter";

// Re-export services
export { TeamCollaborationService } from "../services/collaboration/team-collaboration.service";
export type {
  HandoffRequest,
  HandoffResult,
  VoteRequest,
  VoteResult,
} from "../services/collaboration/team-collaboration.service";
