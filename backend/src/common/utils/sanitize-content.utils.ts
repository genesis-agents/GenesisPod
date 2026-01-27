/**
 * Content Sanitization Utilities
 *
 * 清理 AI 生成内容中的格式问题
 */

/**
 * 清理 Markdown 内容中的格式问题（超级激进模式）
 *
 * 处理的问题：
 * 1. 引用后的孤立下划线: [1]__ → [1]
 * 2. 引用前的孤立下划线: __[1] → [1]
 * 3. 任何连续下划线: ____ → 无
 * 4. 不完整的 bold 标记: 文字__ → 文字
 * 5. 引用之间的多余下划线: [1] __ [2] → [1] [2]
 * 6. 文字和引用之间的下划线: 文字__[1] → 文字[1]
 * 7. 中文/英文后紧跟的孤立下划线: 文字_ → 文字
 * 8. 任何看起来不正常的下划线模式
 */
export function sanitizeMarkdownContent(content: string): string {
  if (!content) return content;

  let sanitized = content;

  // ==================== 预处理：移除所有明显的问题下划线 ====================

  // 0. 直接移除 2 个以上连续的下划线（几乎不可能是合法的 markdown）
  sanitized = sanitized.replace(/_{2,}/g, "");

  // ==================== 第一轮：处理引用相关的下划线 ====================

  // 1. 清理引用后的任何下划线: [1]_ 或 [1] _ 或 [1, 2]_
  sanitized = sanitized.replace(/(\[\d+(?:\s*,\s*\d+)*\])\s*_+/g, "$1");

  // 2. 清理引用前的任何下划线: _[1] 或 _ [1]
  sanitized = sanitized.replace(/_+\s*(\[\d+(?:\s*,\s*\d+)*\])/g, " $1");

  // 3. 清理引用之间的孤立下划线（多次执行以处理连续情况）: [1] _ [2] → [1] [2]
  for (let i = 0; i < 10; i++) {
    const before = sanitized;
    sanitized = sanitized.replace(/(\[\d+\])\s*_+\s*(\[\d+\])/g, "$1 $2");
    if (before === sanitized) break;
  }

  // ==================== 第二轮：处理独立的下划线 ====================

  // 4. 清理独立的下划线序列（前后都是空格或标点）
  sanitized = sanitized.replace(/(\s)_+(\s)/g, "$1$2");
  sanitized = sanitized.replace(/(\s)_+/g, "$1");
  sanitized = sanitized.replace(/_+(\s)/g, "$1");

  // 5. 标点附近的下划线
  sanitized = sanitized.replace(/([，。、；：！？,.;:!?])_+/g, "$1");
  sanitized = sanitized.replace(/_+([，。、；：！？,.;:!?\[\]])/g, "$1");

  // 6. 清理句末或段落末的孤立下划线
  sanitized = sanitized.replace(/_+\s*([。.!?！？])/g, "$1");
  sanitized = sanitized.replace(/_+\s*$/gm, "");

  // ==================== 第三轮：处理文字后的孤立下划线 ====================

  // 7. 清理中文字符后的孤立下划线: 中文_ → 中文
  sanitized = sanitized.replace(/([\u4e00-\u9fa5])_+/g, "$1");

  // 8. 清理英文/数字后的孤立下划线（但保留 snake_case）: word_ → word
  // 只保留 下划线后面紧跟字母/数字 的情况
  sanitized = sanitized.replace(/([a-zA-Z0-9])_+(?![a-zA-Z0-9])/g, "$1");

  // 9. 清理行首的孤立下划线
  sanitized = sanitized.replace(/^_+\s*/gm, "");

  // ==================== 第四轮：清理残留 ====================

  // 10. 清理 ** 和 __ 混用导致的格式问题
  sanitized = sanitized.replace(/\*\*([^*_]+)__/g, "**$1**");
  sanitized = sanitized.replace(/__([^*_]+)\*\*/g, "**$1**");

  // 11. 最终清理：移除所有紧邻引用的下划线
  sanitized = sanitized.replace(/_+(\[\d+\])/g, "$1");
  sanitized = sanitized.replace(/(\[\d+\])_+/g, "$1");

  // 12. 再次确保没有连续下划线
  sanitized = sanitized.replace(/_{2,}/g, "");

  // 13. 最后一遍：移除所有孤立的单个下划线
  // 处理：空格_空格、空格_$、^_空格 等情况
  sanitized = sanitized.replace(/\s_\s/g, " ");
  sanitized = sanitized.replace(/\s_$/gm, "");
  sanitized = sanitized.replace(/^_\s/gm, "");

  // 14. 清理可能产生的多余空格
  sanitized = sanitized.replace(/  +/g, " ");

  return sanitized;
}

/**
 * 需要跳过清理的字段名（这些不是内容字段）
 */
const SKIP_SANITIZE_FIELDS = new Set([
  "id",
  "dimensionId",
  "topicId",
  "reportId",
  "userId",
  "sourceId",
  "url",
  "domain",
  "sourceType",
  "citationIndex",
  "credibilityScore",
  "version",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "accessDate",
  "index",
  "position",
  "order",
  "sortOrder",
  "direction", // 可能是 "up"/"down"
  "timeframe", // 时间范围描述，可能不需要清理，但为安全起见也清理
  "confidenceLevel",
]);

/**
 * 清理 JSON 字符串字段中的内容
 * 递归处理对象中的所有字符串字段（除了明显的 ID 和 URL 字段）
 *
 * ★ 激进模式：清理几乎所有文本内容字段
 */
export function sanitizeObjectContent<T>(
  obj: T,
  options?: {
    /** 指定要清理的字段（为空则清理所有非跳过字段） */
    fieldsToSanitize?: string[];
    /** 是否激进模式：清理所有文本字段（默认 true） */
    aggressive?: boolean;
  },
): T {
  if (!obj || typeof obj !== "object") return obj;

  const aggressive = options?.aggressive ?? true;
  const fieldsToSanitize = options?.fieldsToSanitize;

  const result = { ...obj } as Record<string, unknown>;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string") {
      // 决定是否需要清理这个字段
      const shouldSanitize = aggressive
        ? !SKIP_SANITIZE_FIELDS.has(key) && value.length > 0
        : fieldsToSanitize?.includes(key);

      if (shouldSanitize) {
        result[key] = sanitizeMarkdownContent(value);
      }
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeObjectContent(item, options)
          : typeof item === "string"
            ? sanitizeMarkdownContent(item)
            : item,
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObjectContent(value, options);
    }
  }

  return result as T;
}

/**
 * 清理纯文本字符串（不管是什么字段）
 */
export function sanitizeAllStrings<T>(obj: T): T {
  return sanitizeObjectContent(obj, { aggressive: true });
}
