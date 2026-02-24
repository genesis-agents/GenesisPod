/**
 * AI Engine Facade
 * 统一入口模块
 *
 * ★ 所有 AI App 模块必须从此文件导入，禁止直接访问 ai-engine 内部路径
 */

export { AIEngineFacade } from "./ai-engine.facade";
export * from "./types";
export { PromptSkillBridge } from "../skills/runtime";
// ★ Re-export Engine types so AI App modules can import from facade instead of engine internals
export type {
  RoomConfig,
  EngineEvent,
} from "../realtime/abstractions/event-emitter.interface";
export type { SaveEvidenceRequest } from "../evidence/abstractions/evidence.interface";
export type { AICapabilityContext } from "../capabilities/ai-capability-resolver.service";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../capabilities/types";
export type { SkillMdDefinition } from "../skills/types/skill-md.types";
export type { EmbeddingResult } from "../rag/embedding";
export type {
  SimilaritySearchOptions,
  SimilarityResult,
} from "../rag/vector/vector.service";
export { TaskCompletionType } from "../orchestration/services/circuit-breaker.service";
export { UserIntent } from "../orchestration/services/interfaces";
export type { TeamInfo } from "../teams/services/teams.service";

// ★ Registry classes — AI App 模块可直接注入，但 import 路径必须来自此文件
export { ToolRegistry } from "../tools/registry/tool-registry";
export { AgentRegistry } from "../agents/registry";
export { TeamRegistry } from "../teams/registry/team-registry";
export { RoleRegistry } from "../teams/registry/role-registry";
export { SkillRegistry } from "../skills/registry/skill-registry";

// ★ High-frequency types used across AI App modules
export type { TaskProfile } from "../llm/types";
export type { TeamConfig, ITeam } from "../teams/abstractions/team.interface";
export type { WorkflowConfig } from "../teams/abstractions/workflow.interface";
export type { ConstraintProfile } from "../teams/constraints/constraint-profile";
export { BUILTIN_ROLES } from "../teams/abstractions/role.interface";
export { BUILTIN_TOOLS } from "../core/types/agent.types";
export { createConstraintProfile } from "../teams/constraints/constraint-profile";
export type { MissionEvent } from "../teams/abstractions/mission.interface";
export type { ToolContext, ITool } from "../tools/abstractions/tool.interface";
