/**
 * Context Services Exports
 *
 * PR-X25: Shim files removed. Re-export directly from canonical facades.
 *  - ConstraintEnforcementService (service) → ai-harness/facade
 *  - Constraint types + TokenBudget* → ai-engine/facade
 */
export { ConstraintEnforcementService } from "../../../../../ai-harness/facade";
export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation,
  OutputValidationResult,
} from "../../../../../ai-engine/facade";
export {
  TokenBudgetService,
  type TokenBudgetModelConfig as ModelConfig,
  type TokenBudget,
  type ContentPriority,
  type BudgetAllocation,
} from "../../../../../ai-engine/facade";
