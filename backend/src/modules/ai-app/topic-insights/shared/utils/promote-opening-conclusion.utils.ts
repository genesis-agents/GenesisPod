/**
 * Promote Opening Conclusion · "开篇即结论" util
 *
 * 来源：baseline `38347e2a7:services/core/research/research-leader.service.ts:L296-L317`
 * 以及 section-writer.service.ts 的 OPENING_CONCLUSION_RE 规则。
 *
 * 业务用途：当维度的第一个 section 以 `> **核心判断**：` 或 `> **Key Finding**：`
 * 开头时，必须把这个 blockquote 提升到 `### {sectionTitle}` 标题**之前**，
 * 避免拼接后核心判断出现在"背景概述"章节之后，违反"开篇即结论"原则。
 *
 * 第一印象很重要：用户打开维度先看到结论，再读论证。
 */

const OPENING_CONCLUSION_RE =
  /^(>\s*\*{1,4}(?:核心判断|Key Finding)\*{1,4}[：:][^\n]*)\n*/;

/**
 * 把 sections 数组拼接为完整 markdown，期间对第一 section 的开篇结论做提升。
 *
 * @param sections - 待拼接的 section 数组，index=0 为维度第一节
 * @returns 拼接后的完整 markdown，核心判断在 ### 标题前
 */
export function assembleSectionsWithPromotedConclusion(
  sections: ReadonlyArray<{ title: string; content: string }>,
): string {
  return sections
    .map((s, index) => {
      if (index === 0) {
        const match = s.content.match(OPENING_CONCLUSION_RE);
        if (match) {
          const conclusionLine = match[1];
          const remaining = s.content.slice(match[0].length).trimStart();
          return `${conclusionLine}\n\n### ${s.title}\n\n${remaining}`;
        }
      }
      return `### ${s.title}\n\n${s.content}`;
    })
    .join("\n\n");
}

/**
 * 独立 API：只对单个 content 做开篇结论提升（无 title 上下文）。
 * 返回 `{ conclusionLine, remaining }`；无匹配时 conclusionLine="", remaining=原值。
 */
export function extractOpeningConclusion(content: string): {
  readonly conclusionLine: string;
  readonly remaining: string;
} {
  const match = content.match(OPENING_CONCLUSION_RE);
  if (!match) return { conclusionLine: "", remaining: content };
  return {
    conclusionLine: match[1],
    remaining: content.slice(match[0].length).trimStart(),
  };
}

export { OPENING_CONCLUSION_RE };
