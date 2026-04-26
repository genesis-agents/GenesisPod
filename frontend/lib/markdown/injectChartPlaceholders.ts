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

/**
 * 整篇报告级 inject：对含 H2 的 fullReport 按章节切片后逐章 inject。
 *
 * 必须用这个版本而不是直接 injectChartPlaceholders(整篇, 全部 charts)，因为
 * chart.position="after_paragraph_N" 的 N 是**章节内**段落计数，不是全文档
 * 段落计数。整篇直接 inject 会让所有 N 都解析到文档第一段范围 → 图全挤开头。
 *
 * 流程：
 *   1) 修复 mid-line H2 连体行（"xxx## 3. ..." → 强制断行）
 *   2) 按 ^## 切片，保留 heading 行；首个 H2 之前的 lead-in 一并保留
 *   3) 从每个 H2 提取 sectionNumber（"## 3. 标题" / "## 3.1 标题" → "3"）
 *   4) 按 chart.sectionId 分组，每个章节内只 inject 它自己的 charts
 *   5) 拼回单个 markdown 字符串
 *
 * 调用方（ReportEditor 连续视图）只需在"无 inline 占位符 + charts 不空"时调本函数。
 * 已含 inline 占位符（mission 成功态）应直接走原路径不进 inject。
 */
export interface ChartWithSection extends ChartLike {
  sectionId?: string | null;
}

export function injectChartPlaceholdersByChapter<C extends ChartWithSection>(
  fullReport: string,
  charts: C[]
): string {
  if (!charts.length) return fullReport;

  // mid-line H2 修复：上游某些 pipeline step 偶尔会吃掉 ## 前的换行
  const normalized = fullReport.replace(
    /([^\n])(##\s+\d+(?:\.\d+)*\.?\s)/g,
    '$1\n\n$2'
  );

  // 按 sectionId 分组（"1" / "2" / ...）
  const chartsBySectionId = new Map<string, C[]>();
  for (const c of charts) {
    const sid = c.sectionId || '';
    const arr = chartsBySectionId.get(sid);
    if (arr) arr.push(c);
    else chartsBySectionId.set(sid, [c]);
  }

  // 按 ## 行切片，保留 heading 行；首个 segment.heading=null 容纳 lead-in
  const lines = normalized.split('\n');
  type Seg = { heading: string | null; body: string[] };
  const segments: Seg[] = [{ heading: null, body: [] }];
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      segments.push({ heading: line, body: [] });
    } else {
      segments[segments.length - 1].body.push(line);
    }
  }

  // 没任何 H2 → 切不动，回退原内容（避免 paragraphIdx 错位）
  const hasH2 = segments.some((s) => s.heading !== null);
  if (!hasH2) return fullReport;

  const result: string[] = [];
  for (const seg of segments) {
    if (seg.heading) result.push(seg.heading);

    // 提取 sectionNumber："## 3. 标题" / "## 3.1 标题" → "3"
    let sectionNumber: string | null = null;
    if (seg.heading) {
      const m = seg.heading.match(/^##\s+(\d+)(?:\.\d+)*\.?\s+/);
      if (m) sectionNumber = m[1];
    }
    const sectionCharts = sectionNumber
      ? chartsBySectionId.get(sectionNumber) || []
      : [];

    const bodyText = seg.body.join('\n');
    const injected =
      sectionCharts.length > 0 && !bodyText.includes('<!-- chart:')
        ? injectChartPlaceholders(bodyText, sectionCharts)
        : bodyText;
    result.push(injected);
  }

  return result.join('\n');
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
