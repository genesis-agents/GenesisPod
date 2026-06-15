import { describe, it, expect } from 'vitest';
import { segmentRunOnParagraphs } from '../segmentParagraphs';

const sentence = '这是一段用于测试的中文句子，描述了某个技术细节与其影响[1]。';
const runon = sentence.repeat(8); // 多句、>240 字、0 段落空行

describe('segmentRunOnParagraphs', () => {
  it('把 run-on 长散文切成多个自然段', () => {
    const out = segmentRunOnParagraphs(runon);
    expect(out).not.toBe(runon);
    expect(out.split(/\n\s*\n/).length).toBeGreaterThan(1);
    expect(out.replace(/\s/g, '')).toBe(runon.replace(/\s/g, '')); // 不丢内容
  });

  it('短段不切分', () => {
    const short = '一句话。两句话。';
    expect(segmentRunOnParagraphs(short)).toBe(short);
  });

  it('已正常分段保持不变', () => {
    const ok = `${sentence.repeat(2)}\n\n${sentence.repeat(2)}`;
    expect(segmentRunOnParagraphs(ok)).toBe(ok);
  });

  it('代码块 / 列表 / 表格 不切分', () => {
    const code = '```\n' + runon + '\n```';
    expect(segmentRunOnParagraphs(code)).toBe(code);
    const list = `- ${sentence}\n- ${sentence}\n- ${sentence}`;
    expect(segmentRunOnParagraphs(list)).toBe(list);
    const table = `| A | B |\n| --- | --- |\n| ${sentence} | ${sentence} |`;
    expect(segmentRunOnParagraphs(table)).toBe(table);
  });

  it('标题保留、其后 run-on 段被切', () => {
    const out = segmentRunOnParagraphs(`## 标题\n\n${runon}`);
    expect(out.startsWith('## 标题')).toBe(true);
    expect(out.split(/\n\s*\n/).length).toBeGreaterThan(2);
  });
});
