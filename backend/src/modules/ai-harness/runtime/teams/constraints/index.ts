/**
 * AI Engine - Teams Constraints
 * 约束配置导出
 */

// Constraint Profile
export {
  CostConstraint,
  ModelPreference,
  QualityConstraint,
  QualityDepth,
  AccuracyRequirement,
  EfficiencyConstraint,
  Priority,
  ConstraintProfile,
  ConstraintPreset,
  CONSTRAINT_PRESETS,
  createConstraintProfile,
  getDefaultConstraintProfile,
  mergeConstraintProfiles,
} from "./constraint-profile";

// Constraint Engine Interface
export {
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

// Constraint Engine Implementation — migrated to ai-harness/runtime
// export { ConstraintEngine } from "./constraint-engine";
