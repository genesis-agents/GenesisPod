import { splitFullReportIntoChapters } from '../splitFullReportIntoChapters';

describe('splitFullReportIntoChapters', () => {
  it('returns empty for null/empty input', () => {
    expect(splitFullReportIntoChapters(null)).toEqual([]);
    expect(splitFullReportIntoChapters(undefined)).toEqual([]);
    expect(splitFullReportIntoChapters('')).toEqual([]);
  });

  it('returns empty when no H2 headings present', () => {
    expect(splitFullReportIntoChapters('# Title\n\nJust a paragraph.')).toEqual(
      []
    );
  });

  it('splits preface, exec summary, dimensions, and supplementary sections', () => {
    const fullReport = [
      '# Topic Title',
      '',
      '> 生成时间：2026-04-17',
      '',
      '## 前言',
      '',
      '前言内容。',
      '',
      '## 执行摘要',
      '',
      '摘要内容。',
      '',
      '## 目录',
      '',
      '1. [Foo](#1-foo)',
      '',
      '## 1. Foo',
      '',
      'Dimension 1 body.',
      '',
      '## 2. Bar',
      '',
      'Dimension 2 body.',
      '',
      '## 跨维度关联分析',
      '',
      'Cross-dimension body.',
      '',
      '## 风险评估',
      '',
      'Risks body.',
      '',
      '## 战略建议',
      '',
      'Strategy body.',
      '',
      '## 结语',
      '',
      'Conclusion body.',
      '',
      '---',
      '',
      '## 参考文献',
      '',
      '[1] Some Reference. https://example.com',
    ].join('\n');

    const result = splitFullReportIntoChapters(fullReport);
    expect(result.map((c) => c.title)).toEqual([
      '前言',
      '执行摘要',
      'Foo',
      'Bar',
      '跨维度关联分析',
      '风险评估',
      '战略建议',
      '结语',
    ]);
    expect(result.map((c) => c.type)).toEqual([
      'preface',
      'summary',
      'dimension',
      'dimension',
      'cross-dimension',
      'risk',
      'strategy',
      'conclusion',
    ]);
    // Dimension section numbers parsed correctly
    expect(result[2].sectionNumber).toBe('1');
    expect(result[3].sectionNumber).toBe('2');
    // Content preserved
    expect(result[2].content).toContain('Dimension 1 body.');
    // TOC excluded, references excluded
    expect(result.find((c) => c.title === '目录')).toBeUndefined();
    expect(result.find((c) => c.title === '参考文献')).toBeUndefined();
  });

  it('handles English titles', () => {
    const fullReport = [
      '# Title',
      '',
      '## Preface',
      '',
      'Preface.',
      '',
      '## Executive Summary',
      '',
      'Summary.',
      '',
      '## 1. Section A',
      '',
      'Body.',
      '',
      '## Conclusion',
      '',
      'Done.',
    ].join('\n');
    const result = splitFullReportIntoChapters(fullReport);
    expect(result.map((c) => c.type)).toEqual([
      'preface',
      'summary',
      'dimension',
      'conclusion',
    ]);
  });

  it('preserves chart placeholders in content', () => {
    const fullReport = [
      '# Title',
      '',
      '## 1. Dim',
      '',
      'Para.',
      '',
      '<!-- chart:d0-abc -->',
      '',
      'More.',
    ].join('\n');
    const result = splitFullReportIntoChapters(fullReport);
    expect(result[0].content).toContain('<!-- chart:d0-abc -->');
  });
});
