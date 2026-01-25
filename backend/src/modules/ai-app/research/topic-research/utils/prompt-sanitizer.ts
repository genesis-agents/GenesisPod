/**
 * Prompt Sanitizer Utility
 *
 * ★ Security: 防止 Prompt Injection 攻击
 *
 * 用于消毒用户输入，防止：
 * - 指令覆盖攻击 (Instruction Override)
 * - 角色劫持攻击 (Role Hijacking)
 * - 上下文逃逸 (Context Escape)
 * - 隐藏 Unicode 字符
 *
 * @see https://owasp.org/www-project-top-10-for-large-language-model-applications/
 */

import { Logger } from "@nestjs/common";

const logger = new Logger("PromptSanitizer");

/**
 * 危险模式定义
 */
interface DangerousPattern {
  pattern: RegExp;
  replacement: string;
  reason: string;
}

/**
 * 危险指令模式 - 匹配常见的 prompt injection 尝试
 * 这些模式会被移除或替换
 */
const DANGEROUS_PATTERNS: DangerousPattern[] = [
  // 指令覆盖类
  {
    pattern:
      /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|rules?)/gi,
    replacement: "[FILTERED]",
    reason: "Instruction override attempt",
  },
  {
    pattern:
      /forget\s+(everything|all|what)\s+(you\s+)?(know|learned|were\s+told)/gi,
    replacement: "[FILTERED]",
    reason: "Memory manipulation attempt",
  },
  {
    pattern:
      /disregard\s+(all|the|previous|above)\s+(instructions?|prompts?|rules?)/gi,
    replacement: "[FILTERED]",
    reason: "Disregard instruction attempt",
  },
  {
    pattern: /override\s+(your|the|all)\s+(instructions?|programming|rules?)/gi,
    replacement: "[FILTERED]",
    reason: "Override attempt",
  },

  // 角色劫持类
  {
    pattern: /you\s+are\s+(now|actually)\s+(a|an|the)/gi,
    replacement: "[FILTERED]",
    reason: "Role hijacking attempt",
  },
  {
    pattern: /pretend\s+(you\s+are|to\s+be|you're)\s+(a|an)/gi,
    replacement: "[FILTERED]",
    reason: "Role pretending attempt",
  },
  {
    pattern: /act\s+as\s+(if\s+)?(you\s+)?(are|were)\s+(a|an)/gi,
    replacement: "[FILTERED]",
    reason: "Act as attempt",
  },
  {
    pattern: /from\s+now\s+on,?\s+you\s+(are|will\s+be)/gi,
    replacement: "[FILTERED]",
    reason: "Identity change attempt",
  },

  // 系统角色伪装
  {
    pattern: /\[system\]/gi,
    replacement: "[user]",
    reason: "System role spoofing",
  },
  {
    pattern: /\[assistant\]/gi,
    replacement: "[user]",
    reason: "Assistant role spoofing",
  },
  {
    pattern: /<\/?system>/gi,
    replacement: "",
    reason: "System tag injection",
  },

  // 提示泄露类
  {
    pattern: /reveal\s+(your|the)\s+(system\s+)?prompt/gi,
    replacement: "[FILTERED]",
    reason: "Prompt reveal attempt",
  },
  {
    pattern: /show\s+(me\s+)?(your|the)\s+(original\s+)?instructions?/gi,
    replacement: "[FILTERED]",
    reason: "Instruction reveal attempt",
  },
  {
    pattern: /what\s+(are|were)\s+your\s+(original\s+)?instructions?/gi,
    replacement: "[FILTERED]",
    reason: "Instruction query attempt",
  },

  // 开发者模式类
  {
    pattern: /developer\s+mode/gi,
    replacement: "[FILTERED]",
    reason: "Developer mode attempt",
  },
  {
    pattern: /jailbreak/gi,
    replacement: "[FILTERED]",
    reason: "Jailbreak attempt",
  },
  {
    pattern: /DAN\s*mode/gi,
    replacement: "[FILTERED]",
    reason: "DAN mode attempt",
  },
];

/**
 * 隐藏的 Unicode 字符（用于隐藏恶意指令）
 */
const HIDDEN_UNICODE_RANGES = [
  // 零宽字符
  /[\u200B-\u200F]/g, // Zero-width characters
  /[\u2028-\u202F]/g, // Various space characters
  /[\u2060-\u206F]/g, // Word joiner and invisible operators
  /[\uFEFF]/g, // Byte order mark
  // 控制字符
  /[\u0000-\u001F]/g, // C0 control characters (except newline, tab)
  /[\u007F-\u009F]/g, // C1 control characters
  // 特殊空白
  /[\u00A0\u1680\u180E]/g, // Non-breaking space, Ogham space, etc.
  /[\u2000-\u200A]/g, // Various width spaces
];

/**
 * 消毒配置选项
 */
export interface SanitizeOptions {
  /** 是否移除危险模式 (默认 true) */
  removeDangerousPatterns?: boolean;
  /** 是否移除隐藏 Unicode (默认 true) */
  removeHiddenUnicode?: boolean;
  /** 是否规范化空白字符 (默认 true) */
  normalizeWhitespace?: boolean;
  /** 最大长度限制 */
  maxLength?: number;
  /** 是否记录过滤操作 (默认 true) */
  logFiltered?: boolean;
}

/**
 * 消毒结果
 */
export interface SanitizeResult {
  /** 消毒后的文本 */
  sanitized: string;
  /** 是否检测到危险内容 */
  hasDangerousContent: boolean;
  /** 检测到的危险模式列表 */
  detectedPatterns: string[];
  /** 原始长度 */
  originalLength: number;
  /** 消毒后长度 */
  sanitizedLength: number;
}

/**
 * 消毒用户输入
 *
 * @param input 用户输入的原始文本
 * @param options 消毒选项
 * @returns 消毒结果
 */
export function sanitizePromptInput(
  input: string,
  options: SanitizeOptions = {},
): SanitizeResult {
  const {
    removeDangerousPatterns = true,
    removeHiddenUnicode = true,
    normalizeWhitespace = true,
    maxLength = 10000,
    logFiltered = true,
  } = options;

  const detectedPatterns: string[] = [];
  let sanitized = input;
  const originalLength = input.length;

  // 1. 移除隐藏的 Unicode 字符
  if (removeHiddenUnicode) {
    for (const pattern of HIDDEN_UNICODE_RANGES) {
      sanitized = sanitized.replace(pattern, "");
    }
    // 保留 \n 和 \t
    sanitized = sanitized.replace(/[\u0000-\u0008\u000B-\u001F]/g, "");
  }

  // 2. 检测并替换危险模式
  if (removeDangerousPatterns) {
    for (const { pattern, replacement, reason } of DANGEROUS_PATTERNS) {
      if (pattern.test(sanitized)) {
        detectedPatterns.push(reason);
        sanitized = sanitized.replace(pattern, replacement);
      }
    }
  }

  // 3. 规范化空白字符
  if (normalizeWhitespace) {
    // 将多个空格合并为一个
    sanitized = sanitized.replace(/  +/g, " ");
    // 将多个换行合并为两个
    sanitized = sanitized.replace(/\n{3,}/g, "\n\n");
    // 去除首尾空白
    sanitized = sanitized.trim();
  }

  // 4. 长度限制
  if (maxLength && sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
    if (logFiltered) {
      logger.warn(
        `Input truncated from ${originalLength} to ${maxLength} characters`,
      );
    }
  }

  // 5. 记录检测结果
  if (logFiltered && detectedPatterns.length > 0) {
    logger.warn(
      `Detected ${detectedPatterns.length} dangerous pattern(s): ${detectedPatterns.join(", ")}`,
    );
  }

  return {
    sanitized,
    hasDangerousContent: detectedPatterns.length > 0,
    detectedPatterns,
    originalLength,
    sanitizedLength: sanitized.length,
  };
}

/**
 * 快速消毒 - 返回消毒后的字符串
 *
 * @param input 用户输入
 * @param maxLength 最大长度
 * @returns 消毒后的字符串
 */
export function sanitize(input: string, maxLength = 2000): string {
  return sanitizePromptInput(input, { maxLength }).sanitized;
}

/**
 * 检查输入是否包含危险内容
 *
 * @param input 用户输入
 * @returns 是否包含危险内容
 */
export function containsDangerousContent(input: string): boolean {
  return sanitizePromptInput(input, { logFiltered: false }).hasDangerousContent;
}

/**
 * 转义特殊字符用于嵌入提示
 * 将用户输入用引号包裹并转义内部引号
 *
 * @param input 用户输入
 * @returns 转义后的字符串
 */
export function escapeForPrompt(input: string): string {
  const sanitized = sanitize(input);
  // 转义双引号
  const escaped = sanitized.replace(/"/g, '\\"');
  // 用三重引号包裹，防止上下文逃逸
  return `"""${escaped}"""`;
}
