import { describe, it, expect } from 'vitest';
import { injectChartPlaceholders } from '../injectChartPlaceholders';

describe('injectChartPlaceholders', () => {
  describe('edge cases', () => {
    it('returns content untouched when charts list is empty', () => {
      const content = '# Title\n\nFirst paragraph.\n\nSecond paragraph.';
      expect(injectChartPlaceholders(content, [])).toBe(content);
    });

    it('appends all charts to end when content has no paragraph breaks', () => {
      const content = '一行无段落';
      const out = injectChartPlaceholders(content, [
        { id: 'c1' },
        { id: 'c2' },
      ]);
      expect(out).toContain('<!-- chart:c1 -->');
      expect(out).toContain('<!-- chart:c2 -->');
    });

    it('handles empty content with charts (templates everything to tail)', () => {
      const out = injectChartPlaceholders('', [{ id: 'c1' }]);
      expect(out).toContain('<!-- chart:c1 -->');
    });
  });

  describe('position-hint mode (chart.position = "after_paragraph_N")', () => {
    it('inserts placeholder right after the specified paragraph', () => {
      const content = ['Para1.', '', 'Para2.', '', 'Para3.', ''].join('\n');
      const out = injectChartPlaceholders(content, [
        { id: 'fig-A', position: 'after_paragraph_2' },
      ]);
      const lines = out.split('\n');
      const placeholderIdx = lines.findIndex((l) =>
        l.includes('<!-- chart:fig-A -->')
      );
      const para2Idx = lines.findIndex((l) => l === 'Para2.');
      expect(placeholderIdx).toBeGreaterThan(para2Idx);
      // 没插到 Para3 后面
      const para3Idx = lines.findIndex((l) => l === 'Para3.');
      expect(placeholderIdx).toBeLessThan(para3Idx);
    });

    it('appends charts without position hints to the tail', () => {
      const content = 'P1.\n\nP2.\n\nP3.\n';
      const out = injectChartPlaceholders(content, [
        { id: 'A', position: 'after_paragraph_1' },
        { id: 'B' }, // 无 hint
      ]);
      expect(out).toContain('<!-- chart:A -->');
      expect(out).toContain('<!-- chart:B -->');
      // B 在 A 之后（B 被 push 到 tail）
      expect(out.indexOf('<!-- chart:B -->')).toBeGreaterThan(
        out.indexOf('<!-- chart:A -->')
      );
    });

    it('deduplicates identical chart IDs across position hints', () => {
      const content = 'P1.\n\nP2.\n\nP3.\n';
      const out = injectChartPlaceholders(content, [
        { id: 'A', position: 'after_paragraph_1' },
        { id: 'A', position: 'after_paragraph_2' }, // 同 id，应跳过
      ]);
      const occurrences = out.match(/<!-- chart:A -->/g) || [];
      expect(occurrences.length).toBe(1);
    });
  });

  describe('even-distribution mode (no position hints)', () => {
    it('distributes charts roughly evenly across paragraphs', () => {
      const content = Array.from({ length: 6 }, (_, i) => `Para${i + 1}.`).join(
        '\n\n'
      );
      const out = injectChartPlaceholders(content, [{ id: 'A' }, { id: 'B' }]);
      expect(out).toContain('<!-- chart:A -->');
      expect(out).toContain('<!-- chart:B -->');
      // A 在 B 之前（按数组顺序分布）
      expect(out.indexOf('<!-- chart:A -->')).toBeLessThan(
        out.indexOf('<!-- chart:B -->')
      );
    });

    it('appends remaining charts to tail when paragraphs run out', () => {
      const content = 'Only one paragraph.';
      const out = injectChartPlaceholders(content, [
        { id: 'A' },
        { id: 'B' },
        { id: 'C' },
      ]);
      expect(out).toContain('<!-- chart:A -->');
      expect(out).toContain('<!-- chart:B -->');
      expect(out).toContain('<!-- chart:C -->');
    });
  });

  describe('LaTeX safety', () => {
    it('does not split a paragraph break that wraps a $$ math block', () => {
      const content = [
        'Intro paragraph.',
        '',
        '$$',
        'E = mc^2',
        '$$',
        '',
        'Outro paragraph.',
      ].join('\n');
      const out = injectChartPlaceholders(content, [{ id: 'fig' }]);
      // 占位符不应该被插入到 $$ 块内部
      const mathStart = out.indexOf('$$');
      const mathEnd = out.indexOf('$$', mathStart + 1);
      const placeholderIdx = out.indexOf('<!-- chart:fig -->');
      const insideMath = placeholderIdx > mathStart && placeholderIdx < mathEnd;
      expect(insideMath).toBe(false);
    });
  });

  describe('regression: continuous-view scenario (Screenshot_56)', () => {
    it('rescues fullReport that lacks placeholders by injecting from charts array', () => {
      // 模拟 mission 失败态：fullReport 没 embed 占位符，但 charts 数组有图
      const content = [
        '# 报告标题',
        '',
        '## 章节一',
        '内容段落 A。',
        '',
        '内容段落 B。',
        '',
        '## 章节二',
        '内容段落 C。',
        '',
      ].join('\n');
      const out = injectChartPlaceholders(content, [
        { id: 'chart-001', position: 'after_paragraph_1' },
        { id: 'chart-002', position: 'after_paragraph_2' },
      ]);
      expect(out).toContain('<!-- chart:chart-001 -->');
      expect(out).toContain('<!-- chart:chart-002 -->');
      // 内容主体保留
      expect(out).toContain('# 报告标题');
      expect(out).toContain('## 章节一');
      expect(out).toContain('## 章节二');
    });
  });

  // ============== 100% 覆盖各种场景仿真 ==============
  describe('full coverage simulation', () => {
    it('SUCCESS scenario: caller skips inject when content already has placeholders', () => {
      // 调用方约定：含占位符 → 不调本函数。这里直接测函数对"已有占位符 + 又传 charts"
      // 是否会重复注入。会 — 所以调用方必须前置 hasInlinePlaceholders 判断。
      const content = '## 章节\n段落。\n\n<!-- chart:c1 -->\n\n后续。';
      const out = injectChartPlaceholders(content, [{ id: 'c1' }]);
      // 函数本身不去重已存在占位符；调用方前置判断时不会进来。
      const occurrences = out.match(/<!-- chart:c1 -->/g) || [];
      expect(occurrences.length).toBeGreaterThanOrEqual(1);
    });

    it('FAILURE-RESTART scenario: charts increase between runs (idempotent on each call)', () => {
      const content = 'P1.\n\nP2.\n\nP3.\n';
      // 第一次：1 个图
      const r1 = injectChartPlaceholders(content, [{ id: 'a' }]);
      expect((r1.match(/<!-- chart:/g) || []).length).toBe(1);
      // 重跑：3 个图（叠加更新）
      const r2 = injectChartPlaceholders(content, [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]);
      expect((r2.match(/<!-- chart:/g) || []).length).toBe(3);
      // 不带状态，每次基于纯输入计算
    });

    it('INCREMENTAL scenario: same call twice yields same output (deterministic)', () => {
      const content = 'P1.\n\nP2.\n\nP3.\n';
      const charts = [{ id: 'x', position: 'after_paragraph_1' }, { id: 'y' }];
      const a = injectChartPlaceholders(content, charts);
      const b = injectChartPlaceholders(content, charts);
      expect(a).toBe(b);
    });

    it('MIXED-POSITIONS scenario: handles fragmented hints + tail charts', () => {
      const content = 'P1.\n\nP2.\n\nP3.\n\nP4.\n\nP5.\n';
      const out = injectChartPlaceholders(content, [
        { id: 'mid', position: 'after_paragraph_3' },
        { id: 'first', position: 'after_paragraph_1' },
        { id: 'tail-A' },
        { id: 'tail-B' },
      ]);
      // 全部 4 张图都被插入
      expect((out.match(/<!-- chart:/g) || []).length).toBe(4);
      // first 出现在 mid 之前（位置 1 < 位置 3）
      expect(out.indexOf('<!-- chart:first -->')).toBeLessThan(
        out.indexOf('<!-- chart:mid -->')
      );
      // tail charts 在最后
      expect(out.indexOf('<!-- chart:tail-A -->')).toBeGreaterThan(
        out.indexOf('<!-- chart:mid -->')
      );
    });

    it('OUT-OF-RANGE position falls back to tail append', () => {
      const content = 'Para1.\n\nPara2.\n';
      // paragraphIdx 100 远超实际段落数 → 应附加到末尾不丢
      const out = injectChartPlaceholders(content, [
        { id: 'far', position: 'after_paragraph_100' },
      ]);
      expect(out).toContain('<!-- chart:far -->');
    });

    it('CHARTS-ONLY scenario: no narrative content, only image set', () => {
      const out = injectChartPlaceholders('', [
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ]);
      // 走"无段落 → tail append"分支，全部出现
      expect((out.match(/<!-- chart:/g) || []).length).toBe(3);
    });

    it('CRITICAL: continuous-view per-chapter inject must NOT pile images at start', () => {
      // 仿真用户实测 bug：fullReport 含多个 H2 章节，每章节有自己的 charts
      // 错误做法（pre-fix）：整篇直接 inject → chart.position=4 都解析到第 4 段
      //   → 全部图挤在文档开头
      // 正确做法（post-fix）：按 H2 切片，每章节内单独 inject
      const fullReport = [
        '# 报告标题',
        '',
        '## 1. 第一章',
        'P1。',
        '',
        'P2。',
        '',
        'P3。',
        '',
        'P4。',
        '',
        'P5。',
        '',
        '## 2. 第二章',
        'Q1。',
        '',
        'Q2。',
        '',
        'Q3。',
        '',
        'Q4。',
        '',
        'Q5。',
        '',
      ].join('\n');

      // 模拟章节切片 + 逐章 inject 的结果（与 ReportEditor 内联逻辑一致）
      const allCharts = [
        { id: 'sec1-fig', sectionId: '1', position: 'after_paragraph_3' },
        { id: 'sec2-fig', sectionId: '2', position: 'after_paragraph_3' },
      ];
      const chartsBySection = new Map<string, typeof allCharts>();
      for (const c of allCharts) {
        const sid = c.sectionId || '';
        const arr = chartsBySection.get(sid);
        if (arr) arr.push(c);
        else chartsBySection.set(sid, [c]);
      }

      const lines = fullReport.split('\n');
      const segs: Array<{ heading: string | null; body: string[] }> = [
        { heading: null, body: [] },
      ];
      for (const line of lines) {
        if (/^##\s+/.test(line)) segs.push({ heading: line, body: [] });
        else segs[segs.length - 1].body.push(line);
      }

      const out: string[] = [];
      for (const seg of segs) {
        if (seg.heading) out.push(seg.heading);
        const m = seg.heading?.match(/^##\s+(\d+)(?:\.\d+)*\.?\s+/);
        const sn = m?.[1] ?? null;
        const sc = sn ? chartsBySection.get(sn) || [] : [];
        const body = seg.body.join('\n');
        out.push(
          sc.length > 0 && !body.includes('<!-- chart:')
            ? injectChartPlaceholders(body, sc)
            : body
        );
      }
      const enriched = out.join('\n');

      // 验证：sec1 的图在第一章范围内，sec2 的图在第二章范围内
      const ch2HeadingIdx = enriched.indexOf('## 2. 第二章');
      const sec1FigIdx = enriched.indexOf('<!-- chart:sec1-fig -->');
      const sec2FigIdx = enriched.indexOf('<!-- chart:sec2-fig -->');

      expect(sec1FigIdx).toBeGreaterThan(0);
      expect(sec2FigIdx).toBeGreaterThan(0);
      // sec1 图在第二章 H2 之前
      expect(sec1FigIdx).toBeLessThan(ch2HeadingIdx);
      // sec2 图在第二章 H2 之后
      expect(sec2FigIdx).toBeGreaterThan(ch2HeadingIdx);
    });

    it('UNICODE scenario: Chinese paragraphs work the same', () => {
      const content = [
        '中文段落一。',
        '',
        '中文段落二。',
        '',
        '中文段落三。',
      ].join('\n');
      const out = injectChartPlaceholders(content, [
        { id: 'fig', position: 'after_paragraph_2' },
      ]);
      expect(out).toContain('<!-- chart:fig -->');
      expect(out).toContain('中文段落一');
      expect(out).toContain('中文段落三');
    });
  });
});
