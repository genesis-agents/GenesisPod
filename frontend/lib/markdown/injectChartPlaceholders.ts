/**
 * 把 `<!-- chart:ID -->` 占位符注入到 markdown 中。
 *
 * 抽自 ChapterizedReportView 的同名内联函数 — 连续视图 (ReportEditor) 也需要
 * 同样行为，否则当 backend 没在 fullReport 里 embed 占位符时，连续视图就完全
 * 看不到任何图（章节视图能看到是因为它自己跑了 inject）。
 *
 * 行为：
 * - charts 里有 `position: "after_paragraph_N"` 的，按位置插入
 * - 没有 position 的，等距插入到段落之间
 * - 同一 chart.id 只插入一次
 * - 已经在 content 里的占位符不会被重复添加（caller 应自行判断是否 inject）
 *
 * 调用方建议：
 *   const finalContent = content.includes('<!-- chart:')
 *     ? content
 *     : injectChartPlaceholders(content, charts);
 */

export interface ChartLike {
  id: string;
  position?: string | null;
}

export function injectChartPlaceholders<C extends ChartLike>(
  content: string,
  charts: C[]
): string {
  if (!charts.length) return content;

  const lines = content.split('\n');

  // Parse position hints from charts
  const placements: Array<{ chartId: string; paragraphIdx: number }> = [];
  for (const chart of charts) {
    const match = chart.position?.match(/after_paragraph_(\d+)/);
    if (match) {
      placements.push({
        chartId: chart.id,
        paragraphIdx: parseInt(match[1], 10),
      });
    }
  }

  // Find paragraph boundaries (blank line after non-blank line)
  // 跳过 LaTeX 公式块（$$ / \[），避免在公式内部插入占位符破坏渲染
  const paragraphEnds: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '' && i > 0 && lines[i - 1].trim() !== '') {
      const prevLine = lines[i - 1].trim();
      const nextLine =
        lines
          .slice(i + 1)
          .find((l) => l.trim() !== '')
          ?.trim() || '';
      if (
        prevLine.includes('$$') ||
        nextLine.startsWith('$$') ||
        prevLine.startsWith('\\[') ||
        nextLine.startsWith('\\[')
      ) {
        continue;
      }
      paragraphEnds.push(i);
    }
  }

  if (placements.length === 0) {
    // No position hints — distribute evenly
    if (paragraphEnds.length === 0) {
      return content + charts.map((c) => `\n<!-- chart:${c.id} -->\n`).join('');
    }
    const interval = Math.max(
      1,
      Math.floor(paragraphEnds.length / (charts.length + 1))
    );
    let paraCount = 0;
    let chartIdx = 0;
    const result: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      if (
        lines[i].trim() === '' &&
        i > 0 &&
        lines[i - 1].trim() !== '' &&
        !lines[i - 1].trim().includes('$$')
      ) {
        paraCount++;
        if (paraCount % interval === 0 && chartIdx < charts.length) {
          result.push(`<!-- chart:${charts[chartIdx].id} -->`);
          result.push('');
          chartIdx++;
        }
      }
    }
    while (chartIdx < charts.length) {
      result.push('', `<!-- chart:${charts[chartIdx].id} -->`);
      chartIdx++;
    }
    return result.join('\n');
  }

  // Insert at position hints (bottom-up to avoid index shifting)
  placements.sort((a, b) => b.paragraphIdx - a.paragraphIdx);
  const usedChartIds = new Set<string>();
  for (const { chartId, paragraphIdx } of placements) {
    if (usedChartIds.has(chartId)) continue;
    usedChartIds.add(chartId);
    const targetEnd = paragraphEnds[paragraphIdx - 1];
    if (targetEnd !== undefined) {
      lines.splice(targetEnd + 1, 0, `<!-- chart:${chartId} -->`, '');
      for (let j = 0; j < paragraphEnds.length; j++) {
        if (paragraphEnds[j] > targetEnd) paragraphEnds[j] += 2;
      }
    } else {
      lines.push('', `<!-- chart:${chartId} -->`);
    }
  }

  // Append charts without position hints
  const placedIds = new Set(placements.map((p) => p.chartId));
  for (const chart of charts) {
    if (!placedIds.has(chart.id)) {
      lines.push('', `<!-- chart:${chart.id} -->`);
    }
  }

  return lines.join('\n');
}
