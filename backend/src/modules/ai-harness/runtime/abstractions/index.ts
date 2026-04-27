/**
 * Runtime Abstractions Barrel (type-only re-exports)
 *
 * 所有运行时层需要的抽象类型从 ai-engine/facade 重新导出，便于 runtime/ 内部文件
 * 使用统一的类型入口；运行时值的解析路径仍然走各自服务的直接路径。
 *
 * @see ai-engine/facade/index.ts
 */

// ==================== Realtime / Event Emitter ====================

export type {
  IEngineEventEmitter,
  EngineEvent,
  ProgressEvent,
  RoomConfig,
  RoomType,
} from "../../../ai-engine/facade";

// ==================== Realtime / Progress Tracker ====================

export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../../../ai-engine/facade";

// ★ Inlined from ai-engine to avoid circular dependency at runtime:
// facade barrel → AIEngineFacade → AiChatService → CircuitBreakerService(shim)
// → ai-engine/facade → ProgressTrackerService → abstractions → facade (cycle!)
// All `export type` are erased at runtime (safe). Only runtime values trigger the cycle.
import type { TaskPhase as _TaskPhase } from "../../../ai-engine/facade";

export function calculateOverallProgress(phases: _TaskPhase[]): number {
  const totalWeight = phases.reduce((sum, p) => sum + p.weight, 0);
  if (totalWeight === 0) return 0;

  let completedWeight = 0;
  for (const phase of phases) {
    if (phase.status === "completed" || phase.status === "skipped") {
      completedWeight += phase.weight;
    }
  }

  return Math.round((completedWeight / totalWeight) * 100);
}

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
} from "../../../ai-engine/facade";

// ==================== Teams / A2A Message ====================

export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../../ai-engine/facade";

// ==================== Teams / Member ====================

export type { ITeamMember, TeamMemberId, MemberStatus } from "../../../ai-engine/facade";

// ==================== Teams / Role ====================

export type { IRole, WorkStyle } from "../../../ai-engine/facade";

// ==================== Teams / Team ====================

export type { TeamId } from "../../../ai-engine/facade";

// ==================== Core / Agent Types ====================

export type { SkillId, ToolId } from "../../../ai-engine/facade";

// ==================== Orchestration / Abstractions ====================

export type { Checkpoint, ExecutionContext } from "../../../ai-engine/facade";

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
} from "../../../ai-engine/facade";

// Also re-export ConstraintViolation under its original name for kernel-internal use
// (the facade exports this as ConstraintEngineViolation to avoid collision)
export type { ConstraintEngineViolation as ConstraintViolation } from "../../../ai-engine/facade";

// ==================== Orchestration / Services / Interfaces ====================

export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation as OrchestrationConstraintViolation,
  OutputValidationResult,
  HardConstraint,
  IConstraintEnforcementService,
} from "../../../ai-engine/facade";

// ==================== Teams / Constraints / Constraint Profile ====================

export type { ConstraintProfile } from "../../../ai-engine/facade";

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
} from "../../../ai-engine/facade";

// ==================== DI Tokens ====================
// A2A DI tokens (TEAMS_SERVICE_TOKEN / TRACE_COLLECTOR_TOKEN) moved to
// @/modules/ai-harness/protocol/a2a/a2a.tokens (PR 1 of kernel-merge refactor)
