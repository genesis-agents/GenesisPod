/**
 * Token Budget Service
 *
 * Token 预算管理服务
 *
 * 注意：核心实现已下沉到 AI Engine
 * 此文件重新导出 AI Engine 的能力，保持向后兼容
 */

// 重新导出 AI Engine 的 TokenBudgetService 和相关类型
export {
  TokenBudgetService,
  type ModelConfig,
  type TokenBudget,
  type ContentPriority,
  type BudgetAllocation,
} from "../../../../../ai-engine/orchestration/services";
