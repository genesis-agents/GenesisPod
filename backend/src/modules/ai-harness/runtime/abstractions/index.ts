/**
 * Runtime Abstractions Barrel (type-only re-exports)
 *
 * 运行时层需要的抽象类型——按归属拆分：
 *   - Harness 自有类型（realtime / observability）→ 直接走 harness 内部相对路径
 *   - Engine 自有类型（teams / agent / memory / orchestration）→ 走 ai-engine/facade
 */

// ==================== Realtime / Event Emitter (harness-owned) ====================

export type {
  IEngineEventEmitter,
  EngineEvent,
  ProgressEvent,
  RoomConfig,
  RoomType,
} from "../../protocol/realtime/abstractions/event-emitter.interface";

// ==================== Realtime / Progress Tracker (harness-owned) ====================

export type {
  IProgressTracker,
  TrackedTask,
  CreateTrackedTaskRequest,
  TaskPhase,
} from "../../protocol/realtime/abstractions/progress-tracker.interface";

import type { TaskPhase as _TaskPhase } from "../../protocol/realtime/abstractions/progress-tracker.interface";

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

// ==================== Observability / Trace (harness-owned) ====================

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
} from "../../governance/observability/trace.interface";

// ==================== Teams / A2A Message (engine-owned) ====================

export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../../ai-engine/facade";

// ==================== Teams / Member (engine-owned) ====================

export type { ITeamMember, TeamMemberId, MemberStatus } from "../../../ai-engine/facade";

// ==================== Teams / Role (engine-owned) ====================

export type { IRole, WorkStyle } from "../../../ai-engine/facade";

// ==================== Teams / Team (engine-owned) ====================

export type { TeamId } from "../../../ai-engine/facade";

// ==================== Core / Agent Types (engine-owned) ====================

export type { SkillId, ToolId } from "../../../ai-engine/facade";

// ==================== Orchestration / Abstractions (engine-owned) ====================

export type { Checkpoint, ExecutionContext } from "../../../ai-engine/facade";

// ==================== Teams / Constraint Engine (engine-owned) ====================

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

// ==================== Orchestration / Services / Interfaces (engine-owned) ====================

export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation as OrchestrationConstraintViolation,
  OutputValidationResult,
  HardConstraint,
  IConstraintEnforcementService,
} from "../../../ai-engine/facade";

// ==================== Teams / Constraints / Constraint Profile (engine-owned) ====================

export type { ConstraintProfile } from "../../../ai-engine/facade";

// ==================== Memory / Abstractions (engine-owned) ====================

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
