/**
 * UT-LTX-VALIDATE · validateLatexDelimiters
 *
 * 扫描 markdown 中的 LaTeX 公式 delimiter 是否配对：
 * - `$...$`（inline）
 * - `$$...$$`（block）
 * - `\(...\)` / `\[...\]`（替代 delimiter）
 *
 * 返回 issues 列表 + 粗暴修复版本（不配对的 $ 前后补齐）。
 * 真实 Advanced Tier 的 AG-14-LX 走 LLM 修复；本 utility 只做结构守护。
 */

export interface LatexIssue {
  readonly type:
    | "unmatched-$"
    | "unmatched-$$"
    | "unmatched-paren"
    | "unmatched-bracket";
  readonly position: number;
  readonly context: string;
}

export interface LatexValidationResult {
  readonly issues: ReadonlyArray<LatexIssue>;
  readonly hasLatex: boolean;
  /** 粗暴修复版本（丢弃不配对的单侧 delimiter），不保证语义 */
  readonly repaired?: string;
}

export function validateLatexDelimiters(md: string): LatexValidationResult {
  if (!md) return { issues: [], hasLatex: false };

  const issues: LatexIssue[] = [];
  const lower = md;

  // 检查 $$ 配对（block）
  const blockMatches = [...lower.matchAll(/\$\$/g)];
  const hasBlockLatex = blockMatches.length > 0;
  if (blockMatches.length % 2 !== 0) {
    const last = blockMatches[blockMatches.length - 1];
    issues.push({
      type: "unmatched-$$",
      position: last.index ?? 0,
      context: lower.slice(
        Math.max(0, (last.index ?? 0) - 30),
        (last.index ?? 0) + 30,
      ),
    });
  }

  // 单 $ 配对（去掉 $$ 对后剩下的）
  const stripped = lower.replace(/\$\$[\s\S]*?\$\$/g, "");
  const singleMatches = [...stripped.matchAll(/(?<!\\)\$/g)];
  const hasInlineLatex = singleMatches.length > 0;
  if (singleMatches.length % 2 !== 0) {
    const last = singleMatches[singleMatches.length - 1];
    issues.push({
      type: "unmatched-$",
      position: last.index ?? 0,
      context: stripped.slice(
        Math.max(0, (last.index ?? 0) - 30),
        (last.index ?? 0) + 30,
      ),
    });
  }

  // \(...\) 配对
  const parenOpens = [...lower.matchAll(/\\\(/g)].length;
  const parenCloses = [...lower.matchAll(/\\\)/g)].length;
  if (parenOpens !== parenCloses) {
    issues.push({
      type: "unmatched-paren",
      position: 0,
      context: `opens=${parenOpens} closes=${parenCloses}`,
    });
  }

  // \[...\] 配对
  const brackOpens = [...lower.matchAll(/\\\[/g)].length;
  const brackCloses = [...lower.matchAll(/\\\]/g)].length;
  if (brackOpens !== brackCloses) {
    issues.push({
      type: "unmatched-bracket",
      position: 0,
      context: `opens=${brackOpens} closes=${brackCloses}`,
    });
  }

  const hasLatex =
    hasBlockLatex || hasInlineLatex || parenOpens > 0 || brackOpens > 0;

  // 粗暴修复：只处理 $ 数量奇偶，其它 issue 保持原样
  let repaired: string | undefined;
  if (issues.length > 0) {
    repaired = md;
    if (blockMatches.length % 2 !== 0) repaired += "\n$$";
    if (singleMatches.length % 2 !== 0) repaired += "$";
  }

  return { issues, hasLatex, repaired };
}
