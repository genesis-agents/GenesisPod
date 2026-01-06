/**
 * Retry Utilities
 *
 * 重试相关的工具函数
 *
 * 注意：核心实现已下沉到 AI Engine
 * 此文件重新导出 AI Engine 的能力，保持向后兼容
 *
 * RetryConfig 类型由 ./config/mission.config.ts 定义，不在此重复导出
 */

// 从 AI Engine 重新导出所有错误检测和重试工具
export {
  isRetryableError,
  isRateLimitError,
  isPermanentError,
  isApiErrorContent,
  parseErrorType,
  calculateBackoffDelay,
  sleep,
  withRetry,
  // DEFAULT_RETRY_CONFIG 使用 AI Engine 的通用配置
  // 项目特定配置使用 ./config/mission.config.ts 中的 RETRY_CONFIG
  DEFAULT_RETRY_CONFIG as AI_ENGINE_RETRY_CONFIG,
  type ErrorDetectionRetryConfig,
} from "../../../../../ai-engine/orchestration/utils/error-detection.utils";
