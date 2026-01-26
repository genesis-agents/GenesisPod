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
 * 支持多密钥配置的 Secret 分类
 * 这些分类的免费 API 配额有限，需要多 Key 轮换
 */
export const MULTI_KEY_CATEGORIES = [
  'SEARCH', // Tavily, Serper
  'EXTRACTION', // Jina, Firecrawl, Tavily Extract
  'YOUTUBE', // Supadata
  'TTS', // ElevenLabs
] as const;

export type MultiKeyCategory = (typeof MULTI_KEY_CATEGORIES)[number];

/**
 * 判断分类是否支持多密钥配置
 */
export function isMultiKeyCategory(
  category: string
): category is MultiKeyCategory {
  return (MULTI_KEY_CATEGORIES as readonly string[]).includes(category);
}
