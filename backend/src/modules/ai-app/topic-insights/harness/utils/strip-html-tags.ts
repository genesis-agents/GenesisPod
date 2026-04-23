/**
 * UT-CF-HTMLSTRIP · stripHtmlTags
 *
 * 从 LLM 返回的内容中剥离 HTML 标签与实体，得到纯文本 / markdown。
 * 不用 DOMParser（backend 环境无 DOM），走正则替换。
 *
 * 保留行为：
 * - 标签之间的空白合并为单空格（避免 "<b>A</b><i>B</i>" → "AB"）
 * - 转义实体（&amp; &lt; &gt; &quot; &#39; &nbsp;）反解
 * - 保留换行（<br/> / <p> 转换为 \n）
 */

const BR_TAG = /<br\s*\/?>/gi;
const BLOCK_CLOSE = /<\/(p|div|li|h[1-6]|tr|td)\s*>/gi;
const ANY_TAG = /<[^>]+>/g;
const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

export function stripHtmlTags(input: string | null | undefined): string {
  if (!input) return "";

  let out = input;
  // <br> / block close → \n 以保留段落结构
  out = out.replace(BR_TAG, "\n");
  out = out.replace(BLOCK_CLOSE, "\n");
  // 其它标签完全剥离
  out = out.replace(ANY_TAG, "");
  // 实体反解
  for (const [entity, replacement] of Object.entries(HTML_ENTITIES)) {
    out = out.split(entity).join(replacement);
  }
  // 数字实体（&#123; / &#x7b;）
  out = out.replace(/&#(\d+);/g, (_, dec: string) =>
    String.fromCodePoint(parseInt(dec, 10)),
  );
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  // 多余空行合并（不超过连续 2 个换行）
  out = out.replace(/\n{3,}/g, "\n\n");
  return out.trim();
}
