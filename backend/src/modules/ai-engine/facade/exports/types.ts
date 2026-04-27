/**
 * High-frequency types used across AI App modules
 * Note: TaskProfile, ChatMessage are already re-exported via facade/types/facade.types.ts
 */
export type { CreativityLevel, OutputLengthLevel } from "../../llm/types";
// Note: TeamConfig is also defined in facade.types.ts (facade-level interface).
// Engine-internal TeamConfig override is done via explicit named export in facade/index.ts
// if needed — here we export only ITeam which has no conflict.
export type { ITeam } from "../../../ai-harness/runtime/teams/abstractions/team.interface";
export { BUILTIN_TEAMS } from "../../../ai-harness/runtime/teams/abstractions/team.interface";
export type { WorkflowConfig } from "../../../ai-harness/runtime/teams/abstractions/workflow.interface";
export type { ConstraintProfile } from "../../../ai-harness/runtime/teams/constraints/constraint-profile";
export { BUILTIN_ROLES } from "../../../ai-harness/runtime/teams/abstractions/role.interface";
// Note: BUILTIN_TOOLS and BuiltinToolId are already in facade.types.ts bottom section.
export type {
  PlanStep,
  AgentPlan,
  AgentEvent as PlanAgentEvent,
  AgentTemplate,
  ToolId,
  AgentConfig,
} from "../../core/types/agent.types";
export { BUILTIN_AGENTS } from "../../core/types/agent.types";
export type { ExecutionMode } from "../../core/types/context.types";
export type { TaskPlan } from "../../orchestration/services/task-planner.service";
export { createConstraintProfile } from "../../../ai-harness/runtime/teams/constraints/constraint-profile";
// Note: MissionInput and MissionResult are defined in facade.types.ts (facade-level interfaces).
// Engine-internal overrides were previously done via explicit named exports in facade/index.ts.
export type { MissionEvent } from "../../../ai-harness/runtime/teams/abstractions/mission.interface";
export type {
  ToolContext,
  ITool,
  JSONSchema,
} from "../../tools/abstractions/tool.interface";
export type { TeamInfo } from "../../../ai-harness/runtime/teams/services/teams.service";
export type { SkillId } from "../../core/types/agent.types";
export type { TeamId } from "../../../ai-harness/runtime/teams/abstractions/team.interface";

// Mission context types
export type {
  MissionContextPackage,
  HardConstraint,
  CoreEntity,
  Prohibition,
  QualityStandard,
  EstablishedFact,
  TaskUnderstanding,
} from "../../../ai-harness/runtime/teams/abstractions/mission-context.interface";
export {
  createEmptyContextPackage,
  validateContextPackage,
  mergeContextPackages,
} from "../../../ai-harness/runtime/teams/abstractions/mission-context.interface";

// Orchestration interfaces
export type {
  TeamMemberInfo,
  IConstraintEnforcementService,
} from "../../orchestration/services/interfaces";

// Agent interface types (PR-X5: moved to ai-harness/kernel/abstractions)
export type {
  IAgent,
  AgentContext,
  AgentResult,
  AgentCapability,
  ExecutionPlan,
  AgentMessage,
  AgentMemory,
  AgentArtifact,
  ToolCallRecord,
  SkillCallRecord,
  AgentResultError,
  AgentResultMetadata,
  AgentDefinition,
  ReActPlanStep,
  AgentEventType,
  AgentOutput as AgentIfaceOutput,
  AgentEvent as AgentIfaceEvent,
} from "../../../ai-harness/kernel/abstractions/legacy-agent.interface";
export type { IPlanBasedAgent } from "../../../ai-harness/kernel/base/plan-based-agent";

// Skills interfaces
export type { ISkillOutputManager } from "../../skills/output-manager/skill-output-manager.interface";
export { createSkillOutputManager } from "../../skills/output-manager/skill-output-manager";
export type {
  ISkill,
  SkillContext,
  SkillResult,
  SkillPermissions,
  SkillLayer,
  SkillResultError,
  SkillResultMetadata,
  SkillDefinition,
  SkillConfig,
} from "../../skills/abstractions/skill.interface";
export { SKILL_LAYERS } from "../../skills/abstractions/skill.interface";

// A2A messaging
export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../../ai-harness/runtime/teams/abstractions/a2a-message.interface";

// Team member
export type {
  ITeamMember,
  TeamMemberId,
  MemberStatus,
} from "../../../ai-harness/runtime/teams/abstractions/member.interface";

// Role
export type { IRole, WorkStyle } from "../../../ai-harness/runtime/teams/abstractions/role.interface";

// Constraint engine interface types
export type {
  IConstraintEngine,
  ConstraintEvaluation,
  CostEvaluation,
  QualityEvaluation,
  EfficiencyEvaluation,
  ConstraintWarning,
  ConstraintViolation as ConstraintEngineViolation,
  ConstraintSuggestion,
  ResourceRequirement,
  ResourceAllocation,
  ResourceUsage,
  CostEstimate,
  CostBreakdown,
  DegradationStrategy,
} from "../../../ai-harness/runtime/teams/constraints/constraint-engine.interface";

// Memory abstractions
// Note: MemoryType is also defined in facade.types.ts — engine-internal override was previously
// done via explicit named export in facade/index.ts.
export type {
  IMemoryStore,
  IConversationMemory,
  IWorkingMemory,
  MemoryEntry,
  MemorySearchOptions,
  MemorySearchResult,
  ConversationMessage,
} from "../../knowledge/memory/abstractions/memory.interface";

// Orchestrator abstractions
export type {
  Checkpoint,
  ExecutionContext,
} from "../../orchestration/abstractions/orchestrator.interface";

// Error detection utilities
export type { ErrorDetectionRetryConfig } from "../../orchestration/utils/error-detection.utils";
export {
  DEFAULT_RETRY_CONFIG,
  isRetryableError,
  isRateLimitError,
  isPermanentError,
  withRetry,
  calculateBackoffDelay,
  sleep,
  isApiErrorContent,
  parseErrorType,
} from "../../orchestration/utils/error-detection.utils";

// Image generation interface & tokens
export {
  IMAGE_GENERATION_SERVICE,
  TTS_SERVICE,
} from "../../tools/abstractions/generation-services.interface";
export type { IImageGenerationService } from "../../tools/abstractions/generation-services.interface";
export { IMAGE_GENERATION_SERVICE_TOKEN } from "../../core/interfaces/image.interface";
export type { IResearchService } from "../../core/interfaces/research.interface";
export { RESEARCH_SERVICE_TOKEN } from "../../core/interfaces/research.interface";
export type { ISimulationService } from "../../core/interfaces/simulation.interface";
export { SIMULATION_SERVICE_TOKEN } from "../../core/interfaces/simulation.interface";
export type { IRAGPipelineService } from "../../core/interfaces/rag.interface";
export { RAG_PIPELINE_SERVICE_TOKEN } from "../../core/interfaces/rag.interface";

// Skill types
export type { SkillMdDefinition } from "../../skills/types/skill-md.types";
export type {
  SkillPromptBundle,
  SkillPromptOptions,
} from "../../orchestration/capabilities/types";
// Note: AICapabilityContext is already re-exported via facade/types/facade.types.ts
