/**
 * Slug normalization (P0a-1, llm wiki v1.5.3 §4.4)
 *
 * 上游：docs/architecture/ai-app/library/wiki/llm-wiki.md §4.4 (锁定)
 *
 * 设计要点：
 *   - 纯函数 / 确定性 / 幂等
 *   - NFKD Unicode 分解后剥离 combining diacritical marks (U+0300-U+036F)
 *   - 非 [a-z0-9] 字符折叠为单连字符
 *   - 头尾连字符 trim
 *   - 长度上限 200 字符（与 DTO `@Matches(/^[a-z0-9][a-z0-9-]{0,198}[a-z0-9]$/)` 对齐）
 *
 * 复用场景：wiki title→slug、office/research 文档锚点、跨 ai-app 任意 slugify 需求。
 * 上提同时替换全项目 5+ 处 ad-hoc slugify（P0a-2 后续 PR）。
 *
 * 注意：non-ASCII 输入（如中文）经 NFKD 后无 combining marks 可剥，仍非 ASCII，
 * 会被 `[^a-z0-9]+` 折叠为 `-`，再被头尾 trim 移除，最终返回空串。
 * 调用方应根据业务自行处理空 slug（DTO 层 `@Matches` 会拒绝）。
 */

/**
 * Normalize a title string to a kebab-case ASCII slug suitable for URL anchors and wiki links.
 *
 * Pure function, deterministic, idempotent.
 *
 * @param title 原始标题（任意 Unicode 字符串）
 * @returns kebab-case ASCII slug，长度 ≤ 200；non-ASCII 输入可能返回空串
 *
 * @example
 *   normalizeMarkdownSlug('Machine Learning')   // 'machine-learning'
 *   normalizeMarkdownSlug("OpenAI's GPT-4")     // 'openai-s-gpt-4'
 *   normalizeMarkdownSlug('café')               // 'cafe'
 *   normalizeMarkdownSlug('数据科学')            // ''
 */
export function normalizeMarkdownSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD") // Unicode decomposition (separates diacritics)
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumeric → single hyphen
    .replace(/^-+|-+$/g, "") // trim leading/trailing hyphens
    .slice(0, 200); // cap at 200 chars
}
