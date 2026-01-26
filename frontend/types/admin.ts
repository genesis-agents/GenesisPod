/**
 * Admin Types
 * 管理后台相关类型定义
 */

/**
 * API Key 健康状态
 * 用于显示多 Key 配置的健康状况
 */
export interface KeyHealthStatus {
  /** 密钥序号 (0-indexed) */
  index: number;
  /** 脱敏显示的密钥 (如 tvly-abcd****xyz) */
  maskedKey: string;
  /** 是否健康可用 */
  isHealthy: boolean;
  /** 最近错误码 (如 HTTP 429) */
  lastError?: string;
  /** 冷却结束时间 (ISO 格式) */
  cooldownUntil?: string;
}

/**
 * 支持多密钥配置的工具类型
 */
export const MULTI_KEY_TOOLS = [
  'tavily',
  'tavily-search',
  'serper',
  'serper-search',
  'web-search',
] as const;

export type MultiKeyToolId = (typeof MULTI_KEY_TOOLS)[number];

/**
 * 判断工具是否支持多密钥配置
 */
export function isMultiKeyTool(toolId: string): toolId is MultiKeyToolId {
  return (MULTI_KEY_TOOLS as readonly string[]).includes(toolId);
}
