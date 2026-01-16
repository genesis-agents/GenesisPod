/**
 * Content Sanitization Utilities
 *
 * 清理 AI 生成内容中的格式问题
 */

/**
 * 清理 Markdown 内容中的格式问题
 *
 * 处理的问题：
 * 1. 引用后的孤立下划线: [1]__ → [1]
 * 2. 连续多个下划线（非有效 markdown bold）: ____ → 无
 * 3. 不完整的 bold 标记: 文字__ → 文字
 * 4. 引用之间的多余下划线: [1] __ [2] → [1] [2]
 */
export function sanitizeMarkdownContent(content: string): string {
  if (!content) return content;

  let sanitized = content;

  // 1. 清理引用后的孤立下划线: [1]__ 或 [1] __ 或 [1, 2]__
  // 匹配 [数字] 或 [数字, 数字] 后面跟着的 _ 或 __
  sanitized = sanitized.replace(
    /(\[\d+(?:\s*,\s*\d+)*\])\s*_+(?![a-zA-Z\u4e00-\u9fa5])/g,
    "$1",
  );

  // 2. 清理句末或段落末的孤立下划线
  // 匹配 。或 . 或换行前的 __ 或 _
  sanitized = sanitized.replace(/_+\s*([。.!?！？]|\n|$)/g, "$1");

  // 3. 清理连续4个以上的下划线（不是有效的 markdown）
  sanitized = sanitized.replace(/_{4,}/g, "");

  // 4. 清理单词/句子后面的孤立 __ 但不是 bold 格式
  // 匹配 文字__ 但后面没有对应的 __ 闭合
  sanitized = sanitized.replace(/([^\s_])__(?![^\s_][\s\S]*?__)/g, "$1");

  // 5. 清理引用之间的孤立下划线: [1] __ [2] → [1] [2]
  sanitized = sanitized.replace(/(\[\d+\])\s*_+\s*(\[\d+\])/g, "$1 $2");

  // 6. 清理行首的孤立下划线
  sanitized = sanitized.replace(/^_+\s*/gm, "");

  // 7. 清理 ** 和 __ 混用导致的格式问题
  // 例如 **text__ 或 __text**
  sanitized = sanitized.replace(/\*\*([^*_]+)__/g, "**$1**");
  sanitized = sanitized.replace(/__([^*_]+)\*\*/g, "**$1**");

  return sanitized;
}

/**
 * 清理 JSON 字符串字段中的内容
 * 递归处理对象中的所有字符串字段
 */
export function sanitizeObjectContent<T>(
  obj: T,
  fieldsToSanitize: string[] = [
    "summary",
    "detailedContent",
    "content",
    "finding",
    "trend",
    "challenge",
    "opportunity",
    "implication",
    "impact",
    "potential",
    "prediction",
  ],
): T {
  if (!obj || typeof obj !== "object") return obj;

  const result = { ...obj } as Record<string, unknown>;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "string" && fieldsToSanitize.includes(key)) {
      result[key] = sanitizeMarkdownContent(value);
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        typeof item === "object" && item !== null
          ? sanitizeObjectContent(item, fieldsToSanitize)
          : item,
      );
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObjectContent(value, fieldsToSanitize);
    }
  }

  return result as T;
}
