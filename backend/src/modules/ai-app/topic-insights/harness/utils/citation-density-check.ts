/**
 * UT-CIT-DENSITY · citationDensityCheck
 *
 * 计算一段 markdown 正文的引用密度：citations 数 / paragraphs 数。
 * 用于 quality gate：密度 < minRatio 判 FAIL；介于 minRatio 和 warnRatio
 * 之间判 warn；>= warnRatio 判 pass。
 *
 * 引用识别：
 * - `[123]` / `[12,34]` / `[12-15]` 形式（中英文方括号都算）
 * - 只计内容部分的 citation，剥离 "参考文献 / References" 段
 */

const CITATION_RE = /[[［]\d+(?:\s*[,，\-–]\s*\d+)*[\]］]/g;

export interface CitationDensityResult {
  readonly paragraphCount: number;
  readonly citationCount: number;
  readonly uniqueCitationNumbers: number;
  readonly densityPerParagraph: number;
  readonly verdict: "fail" | "warn" | "pass";
  readonly reason: string;
}

export interface CitationDensityOptions {
  /** 最小可接受密度（每段平均引用数），默认 0.5 */
  minRatio?: number;
  /** warn/pass 边界密度，默认 1.0 */
  warnRatio?: number;
  /** 少于此段数直接 pass（太短的章节不评判） */
  minParagraphs?: number;
}

export function citationDensityCheck(
  content: string,
  options: CitationDensityOptions = {},
): CitationDensityResult {
  const minRatio = options.minRatio ?? 0.5;
  const warnRatio = options.warnRatio ?? 1.0;
  const minParagraphs = options.minParagraphs ?? 3;

  const body = stripReferences(content);
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^#{1,6}\s/.test(p));

  const matches = body.match(CITATION_RE) ?? [];
  const citationCount = matches.length;

  const uniqueNumbers = new Set<number>();
  for (const m of matches) {
    const numbers = m.match(/\d+/g) ?? [];
    for (const n of numbers) uniqueNumbers.add(parseInt(n, 10));
  }

  const density = paragraphs.length > 0 ? citationCount / paragraphs.length : 0;

  if (paragraphs.length < minParagraphs) {
    return {
      paragraphCount: paragraphs.length,
      citationCount,
      uniqueCitationNumbers: uniqueNumbers.size,
      densityPerParagraph: density,
      verdict: "pass",
      reason: `Section too short (${paragraphs.length} paragraphs), density not evaluated`,
    };
  }

  let verdict: "fail" | "warn" | "pass";
  let reason: string;
  if (density < minRatio) {
    verdict = "fail";
    reason = `Density ${density.toFixed(2)} below minRatio=${minRatio}`;
  } else if (density < warnRatio) {
    verdict = "warn";
    reason = `Density ${density.toFixed(2)} between minRatio=${minRatio} and warnRatio=${warnRatio}`;
  } else {
    verdict = "pass";
    reason = `Density ${density.toFixed(2)} at or above warnRatio=${warnRatio}`;
  }

  return {
    paragraphCount: paragraphs.length,
    citationCount,
    uniqueCitationNumbers: uniqueNumbers.size,
    densityPerParagraph: density,
    verdict,
    reason,
  };
}

/** 剥离末尾 References / 参考文献 段（不参与密度计算） */
function stripReferences(content: string): string {
  const refIdx = content.search(
    /\n#{1,3}\s*(References|Bibliography|参考文献|引用)\b/i,
  );
  return refIdx === -1 ? content : content.slice(0, refIdx);
}
