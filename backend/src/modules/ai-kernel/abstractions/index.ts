/**
 * AI Kernel - Abstractions Layer
 *
 * This is the ONLY file in ai-kernel that is permitted to import from ai-engine.
 * All types are imported through the ai-engine FACADE — never from internal paths.
 * This keeps L3 (ai-kernel) decoupled from L2 (ai-engine) internal structure.
 *
 * @see ai-engine/facade/index.ts (Phase 8 section)
 */

// ==================== Realtime / Event Emitter ====================

export type {
  IEngineEventEmitter,
  EngineEvent,
  ProgressEvent,
  RoomConfig,
  RoomType,
} from "../../ai-engine/facade";

// ==================== Realtime / Progress Tracker ====================

export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../../ai-engine/facade";

export { calculateOverallProgress } from "../../ai-engine/facade";

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
} from "../../ai-engine/facade";

// ==================== Teams / A2A Message ====================

export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../ai-engine/facade";

// ==================== Teams / Member ====================

export type {
  ITeamMember,
  TeamMemberId,
  MemberStatus,
} from "../../ai-engine/facade";

// ==================== Teams / Role ====================

export type { IRole, WorkStyle } from "../../ai-engine/facade";

// ==================== Teams / Team ====================

export type { TeamId } from "../../ai-engine/facade";

// ==================== Core / Agent Types ====================

export type { SkillId, ToolId } from "../../ai-engine/facade";

// ==================== Orchestration / Abstractions ====================

export type { Checkpoint, ExecutionContext } from "../../ai-engine/facade";

// ==================== Teams / Constraint Engine ====================

export type {
  IConstraintEngine,
  ConstraintEvaluation,
  CostEvaluation,
  QualityEvaluation,
  EfficiencyEvaluation,
  ConstraintWarning,
  ConstraintEngineViolation,
  ConstraintSuggestion,
  ResourceRequirement,
  ResourceAllocation,
  ResourceUsage,
  CostEstimate,
  CostBreakdown,
  DegradationStrategy,
} from "../../ai-engine/facade";

// Also re-export ConstraintViolation under its original name for kernel-internal use
// (the facade exports this as ConstraintEngineViolation to avoid collision)
export type { ConstraintEngineViolation as ConstraintViolation } from "../../ai-engine/facade";

// ==================== Orchestration / Services / Interfaces ====================

export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation as OrchestrationConstraintViolation,
  OutputValidationResult,
  HardConstraint,
  IConstraintEnforcementService,
} from "../../ai-engine/facade";

// ==================== Teams / Constraints / Constraint Profile ====================

export type { ConstraintProfile } from "../../ai-engine/facade";

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
} from "../../ai-engine/facade";

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
