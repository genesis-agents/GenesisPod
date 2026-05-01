/**
 * Collaboration Services - Main Exports
 *
 * 目录结构:
 * - mission/   任务相关服务
 * - agent/     Agent 相关服务
 * - context/   上下文相关服务
 * - utils/     工具函数
 * - config/    配置常量
 * - interfaces/ 类型定义
 * - prompt/    提示词模板
 */

// 接口定义（优先导出，避免冲突）
export * from "./interfaces";

// Mission 服务（排除冲突的类型）
export {
  TeamMissionService,
  MissionExecutionService,
  MissionReviewService,
  MissionPromptService,
  MissionQueryService,
  MissionContextService,
  MissionInputService,
  MissionStateManager,
  // TaskBreakdownService 已删 (2026-04-30)
  MissionLifecycleService,
  MissionRetryService,
  MissionHealthCheckService,
  MissionAICallerService,
  TeamMessageService,
  TeamMemberService,
  // MissionPromptService 中的非冲突类型
  TaskBreakdown,
  TeamMemberInfo,
} from "./mission";

// Context 服务（排除冲突的类型）
export {
  ConstraintEnforcementService,
  TokenBudgetService,
  // 使用别名避免冲突
  ConstraintSeverity,
  ExtractedConstraint,
  OutputValidationResult,
} from "./context";
export type { ConstraintViolation as ContextConstraintViolation } from "../../../../ai-engine/facade";

// 协作服务（根目录）
export * from "./team-collaboration.service";
export * from "./debate.service";

// 工具函数
export * from "./utils";

// 配置
export * from "./config";

// 提示词模板
export * from "./prompt";
