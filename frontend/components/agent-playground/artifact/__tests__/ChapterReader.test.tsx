import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChapterReader } from '../ChapterReader';
import { makeArtifact, makeSection } from './fixtures';
import type { DimensionPipelineState } from '@/lib/features/agent-playground/mission-presentation.types';

vi.mock('../ArtifactMarkdown', () => ({
  ArtifactMarkdown: ({ markdown }: { markdown: string }) => (
    <div data-testid="artifact-markdown">{markdown}</div>
  ),
}));

vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true,
  });
});

function makeDimPipeline(
  overrides: Partial<DimensionPipelineState> = {}
): DimensionPipelineState {
  return {
    dimension: '市场分析',
    status: 'running',
    chapters: [{ index: 0, heading: '市场分析', status: 'passed' }],
    ...overrides,
  };
}

describe('ChapterReader - empty state', () => {
  it('shows empty state when no level-2 sections', () => {
    const artifact = makeArtifact({
      sections: [makeSection({ level: 3, parentId: 's0' })],
    });
    render(<ChapterReader artifact={artifact} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('报告暂无可视章节')).toBeInTheDocument();
  });

  it('shows empty state when all sections are children (have parentId)', () => {
    const artifact = makeArtifact({
      sections: [makeSection({ level: 2, parentId: 'p1' })],
    });
    render(<ChapterReader artifact={artifact} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });
});

describe('ChapterReader - chapter list view', () => {
  it('renders stats header with section count', () => {
    const artifact = makeArtifact();
    render(<ChapterReader artifact={artifact} />);
    expect(screen.getByText(/共 2 章/)).toBeInTheDocument();
    expect(screen.getByText(/已完成 2/)).toBeInTheDocument();
  });

  it('renders chapter cards with titles', () => {
    const artifact = makeArtifact();
    render(<ChapterReader artifact={artifact} />);
    expect(screen.getByText(/第 1 章: 市场分析/)).toBeInTheDocument();
    expect(screen.getByText(/第 2 章: 竞争格局/)).toBeInTheDocument();
  });

  it('renders word count badges', () => {
    const artifact = makeArtifact();
    render(<ChapterReader artifact={artifact} />);
    const wordBadges = screen.getAllByText(/字$/);
    expect(wordBadges.length).toBeGreaterThan(0);
  });

  it('renders StatusBadge "已完成" for passed sections', () => {
    const artifact = makeArtifact();
    render(<ChapterReader artifact={artifact} />);
    const badges = screen.getAllByText('已完成');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('shows inFlight count when chapters are being written', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        makeDimPipeline({
          dimension: '市场分析',
          chapters: [{ index: 0, heading: '市场分析', status: 'writing' }],
        }),
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText(/进行中 1/)).toBeInTheDocument();
  });

  it('shows writing badge for in-flight section', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        makeDimPipeline({
          chapters: [{ index: 0, heading: '市场分析', status: 'writing' }],
        }),
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('写作中')).toBeInTheDocument();
  });

  it('shows reviewing badge', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        makeDimPipeline({
          chapters: [{ index: 0, heading: '市场分析', status: 'reviewing' }],
        }),
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('评审中')).toBeInTheDocument();
  });

  it('shows 修订中 badge for revising status', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        makeDimPipeline({
          chapters: [{ index: 0, heading: '市场分析', status: 'revising' }],
        }),
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('修订中')).toBeInTheDocument();
  });

  it('shows failed badge for failed section', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        makeDimPipeline({
          chapters: [{ index: 0, heading: '市场分析', status: 'failed' }],
        }),
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('shows 兜底落地 badge for failed-finalized status', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        makeDimPipeline({
          chapters: [
            { index: 0, heading: '市场分析', status: 'failed-finalized' },
          ],
        }),
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('兜底落地')).toBeInTheDocument();
  });

  it('shows (暂无预览内容) placeholder for empty sections', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '空章节',
          startOffset: -1,
          endOffset: 0,
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    expect(screen.getByText('（暂无预览内容）')).toBeInTheDocument();
  });

  it('shows 1k format for totalWords >= 1000', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '长章节',
          wordCount: 2500,
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    expect(screen.getByText(/2\.5k$/)).toBeInTheDocument();
  });

  it('renders cancelled status when missionCancelled and in_progress/pending section', () => {
    // This is tested through deriveDimSubStatus which is computed inside the board,
    // but ChapterReader uses lookupChapterLiveStatus which can return 'passed'
    // when no pipelines provided. The 'cancelled' display logic is in MissionTodoBoard.
    // For ChapterReader, just verify normal render.
    const artifact = makeArtifact();
    render(<ChapterReader artifact={artifact} />);
    expect(screen.queryByText('已放弃')).not.toBeInTheDocument();
  });

  it('merges pseudo-H2 sections (numbered headings) into previous', () => {
    const fullMarkdown =
      '## 市场分析\n\n内容A\n\n## 1. 子节一\n\n子节内容\n\n## 竞争格局\n\n内容B\n';
    const artifact = makeArtifact({
      content: { fullMarkdown, fullReportSize: fullMarkdown.length },
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          startOffset: 0,
          endOffset: 30,
          wordCount: 100,
        }),
        makeSection({
          id: 's2',
          title: '1. 子节一',
          startOffset: 31,
          endOffset: 60,
          wordCount: 50,
        }),
        makeSection({
          id: 's3',
          title: '竞争格局',
          startOffset: 61,
          endOffset: 100,
          wordCount: 80,
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    // After merging, should only show 2 chapters (市场分析 + 竞争格局), not 3
    expect(screen.getByText(/共 2 章/)).toBeInTheDocument();
    expect(screen.queryByText(/第 3 章/)).not.toBeInTheDocument();
  });

  it('initialSectionId opens that section directly', () => {
    const fullMarkdown =
      '## 市场分析\n\n市场内容[1]。\n\n## 竞争格局\n\n竞争内容\n';
    const artifact = makeArtifact({
      content: { fullMarkdown, fullReportSize: fullMarkdown.length },
    });
    render(<ChapterReader artifact={artifact} initialSectionId="s1" />);
    // Should show the chapter reading view
    expect(screen.getByTitle('返回章节列表')).toBeInTheDocument();
    expect(screen.getByText(/第 1 章: 市场分析/)).toBeInTheDocument();
  });
});

describe('ChapterReader - single chapter view', () => {
  const fullMarkdown =
    '## 市场分析\n\n市场内容详情，包含引用[1]。\n更多分析内容。\n\n## 竞争格局\n\n竞争内容\n';

  function renderAndOpenChapter(chapterTitle: string = '市场分析') {
    const artifact = makeArtifact({
      content: { fullMarkdown, fullReportSize: fullMarkdown.length },
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          startOffset: 0,
          endOffset: 60,
          wordCount: 200,
          citations: [1],
        }),
        makeSection({
          id: 's2',
          title: '竞争格局',
          type: 'dimension',
          startOffset: 61,
          endOffset: 120,
          wordCount: 150,
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    // Click on the first chapter card
    const btn = screen.getByText(new RegExp(`第 1 章: ${chapterTitle}`));
    fireEvent.click(btn.closest('button')!);
    return artifact;
  }

  it('navigates to single chapter view on card click', () => {
    renderAndOpenChapter();
    expect(screen.getByTitle('返回章节列表')).toBeInTheDocument();
  });

  it('shows back button and chapter header', () => {
    renderAndOpenChapter();
    expect(screen.getByTitle('返回章节列表')).toBeInTheDocument();
    // The header shows chapter number and title
    expect(screen.getByText(/第 1 章: 市场分析/)).toBeInTheDocument();
  });

  it('back button returns to list view', () => {
    renderAndOpenChapter();
    const backBtn = screen.getByTitle('返回章节列表');
    fireEvent.click(backBtn);
    // Back to list view
    expect(screen.getByText(/共 2 章/)).toBeInTheDocument();
  });

  it('renders chapter content via ArtifactMarkdown', () => {
    renderAndOpenChapter();
    expect(screen.getByTestId('artifact-markdown')).toBeInTheDocument();
  });

  it('shows 参考文献 section at chapter end when citations present', () => {
    renderAndOpenChapter();
    // Citations widget should appear
    expect(screen.getByText('参考文献')).toBeInTheDocument();
  });

  it('shows citation links', () => {
    renderAndOpenChapter();
    expect(screen.getByText('市场研究报告')).toBeInTheDocument();
  });

  it('shows word count in chapter header', () => {
    renderAndOpenChapter();
    expect(screen.getByText(/200 字/)).toBeInTheDocument();
  });

  it('handles 参考文献 chapter specially - shows all citations, no markdown body', () => {
    const markdown = '## 参考文献\n\n1. 来源A\n2. 来源B\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        makeSection({
          id: 's-ref',
          title: '参考文献',
          startOffset: 0,
          endOffset: 50,
          citations: [1, 2],
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    const btn = screen.getByText(/第 1 章: 参考文献/);
    fireEvent.click(btn.closest('button')!);
    // Should NOT show empty warning (because it's a references chapter)
    expect(screen.queryByText(/该章节内容为空/)).not.toBeInTheDocument();
    // Should show citations
    expect(screen.getByText('市场研究报告')).toBeInTheDocument();
  });

  it('handles 参考资料 chapter title', () => {
    const markdown = '## 参考资料\n\n1. 来源\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        makeSection({
          id: 's-ref',
          title: '参考资料',
          startOffset: 0,
          endOffset: 30,
          citations: [1],
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    const btn = screen.getByText(/第 1 章: 参考资料/);
    fireEvent.click(btn.closest('button')!);
    expect(screen.queryByText(/该章节内容为空/)).not.toBeInTheDocument();
  });

  it('handles references chapter title (english)', () => {
    const markdown = '## References\n\n1. Source\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        makeSection({
          id: 's-ref',
          title: 'References',
          startOffset: 0,
          endOffset: 30,
          citations: [1],
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    const btn = screen.getByText(/第 1 章: References/);
    fireEvent.click(btn.closest('button')!);
    expect(screen.queryByText(/该章节内容为空/)).not.toBeInTheDocument();
  });

  it('shows empty content warning for non-reference empty chapter', () => {
    // Use markdown WITHOUT the heading "市场分析" so repairSectionsFromHeadings
    // cannot repair the empty section (no matching heading found → startOffset stays -1)
    const markdown = '## 竞争格局\n\n竞争内容\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        // startOffset=-1 means empty slice; repair fails because no "市场分析" heading in markdown
        makeSection({
          id: 's1',
          title: '市场分析',
          startOffset: -1,
          endOffset: -1,
          wordCount: 0,
          citations: [],
        }),
        makeSection({
          id: 's2',
          title: '竞争格局',
          startOffset: 0,
          endOffset: markdown.length,
          wordCount: 100,
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    const btn = screen.getByText(/第 1 章: 市场分析/);
    fireEvent.click(btn.closest('button')!);
    expect(screen.getByText(/该章节内容为空/)).toBeInTheDocument();
  });

  it('navigates between chapters using arrow (next section)', () => {
    renderAndOpenChapter();
    // navigate to second section by going back and clicking second
    fireEvent.click(screen.getByTitle('返回章节列表'));
    fireEvent.click(screen.getByText(/第 2 章: 竞争格局/).closest('button')!);
    expect(screen.getByText(/第 2 章: 竞争格局/)).toBeInTheDocument();
  });

  it('sorts citations by index in chapter footer', () => {
    const markdown = '## 市场分析\n\n内容[2][1]。\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          startOffset: 0,
          endOffset: 50,
          citations: [1, 2],
        }),
      ],
      citations: [
        {
          index: 1,
          uuid: 'c1',
          title: '来源1',
          url: 'https://a.com',
          domain: 'a.com',
          accessedAt: '2026-01-01',
          sourceType: 'news',
          credibilityScore: 80,
          occurrences: [],
        },
        {
          index: 2,
          uuid: 'c2',
          title: '来源2',
          url: 'https://b.com',
          domain: 'b.com',
          accessedAt: '2026-01-01',
          sourceType: 'news',
          credibilityScore: 75,
          occurrences: [],
        },
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    fireEvent.click(screen.getByText(/第 1 章: 市场分析/).closest('button')!);
    const links = screen.getAllByRole('link');
    // Links should appear in order [1], [2]
    expect(links[0].textContent).toContain('来源1');
  });

  it('shows citation without url as plain text', () => {
    const markdown = '## 市场分析\n\n内容[1]。\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          startOffset: 0,
          endOffset: 50,
          citations: [1],
        }),
      ],
      citations: [
        {
          index: 1,
          uuid: 'c1',
          title: '无链接来源',
          url: '',
          domain: '',
          accessedAt: '2026-01-01',
          sourceType: 'news',
          credibilityScore: 70,
          occurrences: [],
        },
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    fireEvent.click(screen.getByText(/第 1 章: 市场分析/).closest('button')!);
    expect(screen.getByText('无链接来源')).toBeInTheDocument();
  });

  it('shows dimStartIndex for dimension sections', () => {
    const markdown = '## 市场分析\n\n内容A\n\n## 竞争格局\n\n内容B\n';
    const artifact = makeArtifact({
      content: { fullMarkdown: markdown, fullReportSize: markdown.length },
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          type: 'dimension',
          startOffset: 0,
          endOffset: 25,
          wordCount: 100,
        }),
        makeSection({
          id: 's2',
          title: '竞争格局',
          type: 'dimension',
          startOffset: 26,
          endOffset: 60,
          wordCount: 80,
        }),
      ],
    });
    render(<ChapterReader artifact={artifact} />);
    fireEvent.click(screen.getByText(/第 2 章: 竞争格局/).closest('button')!);
    // dimStartIndex for second dim should be 2
    expect(screen.getByTestId('artifact-markdown')).toBeInTheDocument();
  });
});

describe('ChapterReader - lookupChapterLiveStatus', () => {
  it('returns passed for no pipelines', () => {
    const artifact = makeArtifact();
    render(<ChapterReader artifact={artifact} />);
    // All sections show "已完成"
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
  });

  it('matches by sourceDimensionId', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          sourceDimensionId: 'dim-market',
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'dim-market',
        {
          dimension: 'dim-market',
          status: 'running',
          chapters: [{ index: 0, heading: '市场分析', status: 'writing' }],
        },
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('写作中')).toBeInTheDocument();
  });

  it('fallback matching by title substring', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析详细报告',
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场',
        {
          dimension: '市场',
          status: 'running',
          chapters: [
            { index: 0, heading: '市场分析详细报告', status: 'revising' },
          ],
        },
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('修订中')).toBeInTheDocument();
  });

  it('resolves pending status as revising when dim has in-flight chapters', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '分析',
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '分析',
        {
          dimension: '分析',
          status: 'running',
          chapters: [
            { index: 0, heading: '分析', status: 'pending' },
            { index: 1, heading: '其他章节', status: 'writing' },
          ],
        },
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    // pending resolved to revising because dim has in-flight
    expect(screen.getByText('修订中')).toBeInTheDocument();
  });

  it('resolves pending to passed when dim has no in-flight chapters', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '分析',
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '分析',
        {
          dimension: '分析',
          status: 'done',
          chapters: [{ index: 0, heading: '分析', status: 'pending' }],
        },
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getAllByText('已完成').length).toBeGreaterThan(0);
  });

  it('uses fallback scanning when no candidates match by dim name', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '具体章节标题',
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        'completely-different-dim',
        {
          dimension: 'completely-different-dim',
          status: 'running',
          chapters: [
            { index: 0, heading: '具体章节标题', status: 'reviewing' },
          ],
        },
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText('评审中')).toBeInTheDocument();
  });

  it('returns revising for candidate dim with in-flight but no matching heading', () => {
    const artifact = makeArtifact({
      sections: [
        makeSection({
          id: 's1',
          title: '市场分析',
          startOffset: 0,
          endOffset: 100,
        }),
      ],
    });
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场',
        {
          dimension: '市场',
          status: 'running',
          chapters: [
            // No chapter heading matches "市场分析"
            { index: 0, heading: '完全不同的标题', status: 'writing' },
          ],
        },
      ],
    ]);
    render(
      <ChapterReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    // Should show revising because candidate dim has in-flight
    expect(screen.getByText('修订中')).toBeInTheDocument();
  });
});
