/**
 * AI Kernel - Abstractions Layer
 *
 * This is the ONLY file in ai-kernel that is permitted to import from ai-engine.
 * All other kernel files must import from this barrel instead of reaching into
 * ai-engine directly. This indirection layer keeps L3 (ai-kernel) decoupled
 * from L2 (ai-engine) internal paths.
 */

// ==================== Realtime / Event Emitter ====================

export type {
  IEngineEventEmitter,
  EngineEvent,
  ProgressEvent,
  RoomConfig,
  RoomType,
} from "../../ai-engine/infra/realtime/abstractions/event-emitter.interface";

// ==================== Realtime / Progress Tracker ====================

export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../../ai-engine/infra/realtime/abstractions/progress-tracker.interface";

export { calculateOverallProgress } from "../../ai-engine/infra/realtime/abstractions/progress-tracker.interface";

// ==================== Observability / Trace ====================

export type {
  TraceType,
  SpanType,
  ExecutionStatus,
  SpanData,
  TraceData,
  TraceSummary,
  CreateTraceInput,
  CreateSpanInput,
  EndSpanInput,
  EndTraceInput,
  ListTracesOptions,
} from "../../ai-engine/infra/observability/trace.interface";

// ==================== Teams / A2A Message ====================

export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../ai-engine/teams/abstractions/a2a-message.interface";

// ==================== Teams / Member ====================

export type {
  ITeamMember,
  TeamMemberId,
  MemberStatus,
} from "../../ai-engine/teams/abstractions/member.interface";

// ==================== Teams / Role ====================

export type {
  IRole,
  WorkStyle,
} from "../../ai-engine/teams/abstractions/role.interface";

// ==================== Teams / Team ====================

export type { TeamId } from "../../ai-engine/teams/abstractions/team.interface";

// ==================== Core / Agent Types ====================

export type { SkillId, ToolId } from "../../ai-engine/core/types/agent.types";

// ==================== Orchestration / Abstractions ====================

export type {
  Checkpoint,
  ExecutionContext,
} from "../../ai-engine/orchestration/abstractions/orchestrator.interface";

// ==================== Teams / Constraint Engine ====================

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
} from "../../ai-engine/teams/constraints/constraint-engine.interface";

// Also re-export ConstraintViolation under its original name for kernel-internal use
export type { ConstraintViolation } from "../../ai-engine/teams/constraints/constraint-engine.interface";

// ==================== Orchestration / Services / Interfaces ====================

export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation as OrchestrationConstraintViolation,
  OutputValidationResult,
  HardConstraint,
  IConstraintEnforcementService,
} from "../../ai-engine/orchestration/services/interfaces";

// ==================== Teams / Constraints / Constraint Profile ====================

export type { ConstraintProfile } from "../../ai-engine/teams/constraints/constraint-profile";

// ==================== Memory / Abstractions ====================

export type {
  IMemoryStore,
  IConversationMemory,
  IWorkingMemory,
  MemoryEntry,
  MemoryType,
  MemorySearchOptions,
  MemorySearchResult,
  ConversationMessage,
} from "../../ai-engine/knowledge/memory/abstractions/memory.interface";

// ==================== DI Tokens for Service-Class Injections ====================

/**
 * DI token for TeamsService injected into A2AController.
 * The actual binding (useExisting: TeamsService) is set up in AiKernelModule.
 */
export const TEAMS_SERVICE_TOKEN = "KernelTeamsService";

/**
 * DI token for TraceCollectorService injected into A2AController.
 * The actual binding (useExisting: ProcessEventLogService) is set up in AiKernelModule.
 */
export const TRACE_COLLECTOR_TOKEN = "KernelTraceCollector";
