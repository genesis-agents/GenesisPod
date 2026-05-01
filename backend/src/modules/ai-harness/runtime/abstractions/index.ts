/**
 * Runtime Abstractions Barrel (type-only re-exports)
 *
 * 运行时层需要的抽象类型——按归属拆分：
 *   - Harness 自有类型（realtime / observability）→ 直接走 harness 内部相对路径
 *   - Harness 自有类型（teams / agent / constraints）→ 走 harness 内部相对路径
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

// ==================== Teams / A2A Message (harness-owned) ====================

export type {
  A2AMessage,
  A2AMessageType,
  A2APriority,
  A2AMessageHandler,
} from "../../runtime/teams/abstractions/a2a-message.interface";

// ==================== Teams / Member (harness-owned) ====================

export type {
  ITeamMember,
  TeamMemberId,
  MemberStatus,
} from "../../runtime/teams/abstractions/member.interface";

// ==================== Teams / Role (harness-owned) ====================

export type {
  IRole,
  WorkStyle,
} from "../../runtime/teams/abstractions/role.interface";

// ==================== Teams / Team (harness-owned) ====================

export type { TeamId } from "../../runtime/teams/abstractions/team.interface";

// ==================== Core / Agent Types (engine-owned, imported from ai-engine/facade) ====================

export type { SkillId, ToolId } from "../../../ai-engine/facade";

// ==================== Orchestration / Abstractions (engine-owned) ====================

export type {
  Checkpoint,
  ExecutionContext,
} from "./orchestrator.interface";

// ==================== Teams / Constraint Engine (harness-owned) ====================

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
} from "../../runtime/teams/constraints/constraint-engine.interface";

// Also re-export ConstraintViolation under its original name for kernel-internal use
export type { ConstraintViolation } from "../../runtime/teams/constraints/constraint-engine.interface";

// ==================== Orchestration / Services / Interfaces (engine-owned) ====================

export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation as OrchestrationConstraintViolation,
  OutputValidationResult,
  HardConstraint,
  IConstraintEnforcementService,
} from "../../../ai-harness/execution/executor/interfaces";

// ==================== Teams / Constraints / Constraint Profile (harness-owned) ====================

export type { ConstraintProfile } from "../../runtime/teams/constraints/constraint-profile";

// ==================== Memory / Abstractions (harness-owned 2026-04-30) ====================

export type {
  IMemoryStore,
  IConversationMemory,
  IWorkingMemory,
  MemoryEntry,
  MemoryType,
  MemorySearchOptions,
  MemorySearchResult,
  ConversationMessage,
} from "../../memory/abstractions/memory.interface";
