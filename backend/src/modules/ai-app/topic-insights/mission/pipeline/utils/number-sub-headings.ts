/**
 * UT-CF-NUMBERING · numberSubHeadings
 *
 * 为维度内的 `###` / `####` 子标题加上层级编号（`### 1.1 标题` / `#### 1.1.1 标题`）。
 * 不处理 `#` / `##`（留给 report assembler 层级控制）。
 *
 * 设计约束（先迁移再删除 — 不影响 shared/report-template 的同名函数；
 * 本实现面向 harness Pipeline 调用）：
 * - 输入是单个 section / dimension 的 markdown 片段
 * - `sectionIndex` 是 dimension / top-level section 编号（1-based）
 * - 遇到已经带编号的标题（如 `### 1.2 xxx`）保持原样不重复编号
 */

/** 已带编号的标题模式：### 1., ### 1.2., #### 1.2.3. 等 */
const ALREADY_NUMBERED = /^(#{3,4})\s+\d+(\.\d+){0,2}\.?\s/;

/** 匹配任意三级/四级标题 */
const HEADING_RE = /^(#{3,4})\s+(.+?)\s*$/;

export interface NumberSubHeadingsOptions {
  /** 是否给四级标题（####）也编号，默认 true */
  includeLevel4?: boolean;
}

export function numberSubHeadings(
  content: string,
  sectionIndex: number,
  options: NumberSubHeadingsOptions = {},
): string {
  const includeL4 = options.includeLevel4 ?? true;

  if (!content || sectionIndex < 1) return content;

  const lines = content.split("\n");
  let subIndex = 0;
  let subSubIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (ALREADY_NUMBERED.test(line)) continue;

    const match = HEADING_RE.exec(line);
    if (!match) continue;

    const [, hashes, title] = match;
    const level = hashes.length;

    if (level === 3) {
      subIndex += 1;
      subSubIndex = 0;
      lines[i] = `${hashes} ${sectionIndex}.${subIndex} ${title}`;
    } else if (level === 4 && includeL4) {
      if (subIndex === 0) subIndex = 1; // 保护：没有 ### 时挂到默认 .1
      subSubIndex += 1;
      lines[i] =
        `${hashes} ${sectionIndex}.${subIndex}.${subSubIndex} ${title}`;
    }
  }

  return lines.join("\n");
}
