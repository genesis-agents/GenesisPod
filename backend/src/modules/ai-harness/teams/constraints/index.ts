/**
 * AI Engine - Teams Constraints
 * 约束配置导出
 */

// Constraint Profile
export type {
  CostConstraint,
  ModelPreference,
  QualityConstraint,
  QualityDepth,
  AccuracyRequirement,
  EfficiencyConstraint,
  Priority,
  ConstraintProfile,
  ConstraintPreset,
} from "./constraint-profile";
export {
  CONSTRAINT_PRESETS,
  createConstraintProfile,
  getDefaultConstraintProfile,
  mergeConstraintProfiles,
} from "./constraint-profile";

// Constraint Engine Interface
export type {
  IConstraintEngine,
  ConstraintEvaluation,
  CostEvaluation,
  QualityEvaluation,
  EfficiencyEvaluation,
  ConstraintWarning,
  ConstraintViolation,
  ConstraintSuggestion,
  ResourceRequirement,
  ResourceAllocation,
  ResourceUsage,
  CostEstimate,
  CostBreakdown,
  DegradationStrategy,
} from "./constraint-engine.interface";

// Constraint Engine Implementation - owned by ai-harness/guardrails
// export { ConstraintEngine } from "./constraint-engine";
