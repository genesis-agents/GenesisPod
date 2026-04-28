/**
 * Constraint Enforcement Service
 *
 * 约束执行与校验服务
 *
 * ⚠️ 已迁移到 AI Engine 核心能力层
 * 此文件保留为重导出，保持向后兼容
 *
 * @see ai-engine/planning/services/constraint-enforcement.service.ts
 */

// 从 AI Harness（ConstraintEnforcementService）和 AI Engine（接口类型）重导出
export { ConstraintEnforcementService } from "../../../../../ai-harness/facade";
export type {
  ConstraintSeverity,
  ExtractedConstraint,
  ConstraintViolation,
  OutputValidationResult,
} from "../../../../../ai-engine/facade";
