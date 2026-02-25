/**
 * Content Fetch Types
 * AI Engine 核心能力 - 通用内容获取类型定义
 */

export interface FetchedContent {
  content: string;
  title?: string;
  url?: string;
  contentType?: string;
  metadata?: Record<string, unknown>;
  /** 原文内容（英文或原始语言） */
  originalContent?: string;
  /** 翻译内容（中文） */
  translatedContent?: string;
  /** 是否为双语内容 */
  isBilingual?: boolean;
  coverImage?: string;
  images?: string[];
}

export interface FetchOptions {
  maxLength?: number;
  includeMetadata?: boolean;
  timeout?: number;
}

/**
 * Sanitize string by removing characters that can cause PostgreSQL protocol errors.
 * Removes null bytes, control characters (except tab/LF/CR), replacement character,
 * and lone surrogates that can corrupt the PostgreSQL binary protocol.
 */
export function sanitizeForDb(str: string | undefined | null): string {
  if (!str) return "";
  return str
    .replace(/\x00/g, "") // Remove null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F]/g, "") // Remove control chars except tab, LF, CR
    .replace(/\uFFFD/g, "") // Remove replacement character
    .replace(/[\uD800-\uDFFF]/g, ""); // Remove lone surrogates
}

/**
 * Sanitize JSON data recursively to remove problematic characters.
 */
export function sanitizeJson(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") return sanitizeForDb(data);
  if (Array.isArray(data)) return data.map(sanitizeJson);
  if (typeof data === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[key] = sanitizeJson(value);
    }
    return result;
  }
  return data;
}
