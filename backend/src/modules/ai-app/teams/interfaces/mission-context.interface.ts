/**
 * Mission Context Package - 通用的任务上下文协议
 *
 * @deprecated 此模块已迁移到 AI Engine 层
 * 请使用: import { ... } from "@/modules/ai-engine/teams/abstractions/mission-context.interface"
 * 或: import { ... } from "@/modules/ai-engine"
 *
 * 此文件保留用于向后兼容，将在未来版本中移除。
 */

// Re-export everything from AI Engine for backwards compatibility
export {
  HardConstraint,
  CoreEntity,
  Prohibition,
  QualityStandard,
  EstablishedFact,
  TaskUnderstanding,
  MissionContextPackage,
  createEmptyContextPackage,
  validateContextPackage,
  mergeContextPackages,
} from "../../../ai-engine/facade";
