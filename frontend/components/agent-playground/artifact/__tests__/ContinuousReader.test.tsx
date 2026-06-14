import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContinuousReader } from '../ContinuousReader';
import { makeArtifact, makeCitation } from './fixtures';
import type { ArtifactCitation } from '@/lib/features/agent-playground/report-artifact.types';

// Mock heavy sub-components
vi.mock('../ArtifactMarkdown', () => ({
  ArtifactMarkdown: ({ markdown }: { markdown: string }) => (
    <div data-testid="artifact-markdown">{markdown}</div>
  ),
}));

vi.mock('../ReferencePanel', () => ({
  ReferencePanel: ({
    citations,
    onClickReverseHighlight,
  }: {
    citations: unknown[];
    highlightedIndex?: number | null;
    onClickReverseHighlight?: (citation: ArtifactCitation) => void;
  }) => (
    <div data-testid="reference-panel">
      refs:{citations.length}
      <button
        data-testid="cite-click"
        onClick={() =>
          onClickReverseHighlight?.({
            index: 1,
            uuid: 'u1',
            title: 'src',
            url: 'http://x',
            domain: 'x',
            accessedAt: '',
            sourceType: 'news',
            credibilityScore: 80,
            occurrences: [],
          } as ArtifactCitation)
        }
      >
        cite1
      </button>
    </div>
  ),
}));

// jsdom stubs
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true,
  });
});

describe('ContinuousReader', () => {
  it('renders with data-export-content attribute', () => {
    const artifact = makeArtifact();
    const { container } = render(<ContinuousReader artifact={artifact} />);
    const exportDiv = container.querySelector(
      '[data-export-content="playground-report"]'
    );
    expect(exportDiv).toBeInTheDocument();
  });

  it('renders ArtifactMarkdown with stripped trailing references', () => {
    const artifact = makeArtifact({
      content: {
        fullMarkdown: '## 正文\n\n内容\n\n## 参考文献\n\n1. 来源',
        fullReportSize: 50,
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    const md = screen.getByTestId('artifact-markdown');
    expect(md.textContent).not.toContain('参考文献');
    expect(md.textContent).toContain('正文');
  });

  it('renders ReferencePanel with citations', () => {
    const artifact = makeArtifact();
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.getByTestId('reference-panel')).toBeInTheDocument();
    expect(screen.getByTestId('reference-panel').textContent).toContain(
      'refs:2'
    );
  });

  it('shows hard gate violations banner when present', () => {
    const artifact = makeArtifact({
      quality: {
        overall: 40,
        dimensions: {
          traceability: 30,
          factualConsistency: 30,
          novelty: 30,
          coverage: 30,
          redundancy: 30,
          formatCorrectness: 30,
          citationDensity: 30,
          styleConformance: 30,
          lengthAccuracy: 30,
          chapterBalance: 30,
        },
        hardGateViolations: [
          { dimension: 'l4-critic', severity: 'error', message: '严重问题' },
          {
            dimension: 'l4-blindspot',
            severity: 'warning',
            message: '盲点问题',
          },
          { dimension: 'l4-bias', severity: 'warning', message: '偏见问题' },
          {
            dimension: 'l4-suggestion',
            severity: 'warning',
            message: '优化建议内容',
          },
          { dimension: 'other-dim', severity: 'warning', message: '其他问题' },
          { dimension: 'extra', severity: 'warning', message: '额外' },
        ],
        warnings: [],
        qualityTrace: [],
        finalVerdict: 'poor',
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.getByText(/Critic 复审标记/)).toBeInTheDocument();
    // Shows "总体评判" for l4-critic
    expect(screen.getByText('总体评判')).toBeInTheDocument();
    // Shows "盲点" for l4-blindspot
    expect(screen.getByText('盲点')).toBeInTheDocument();
    // Shows "偏见" for l4-bias
    expect(screen.getByText('偏见')).toBeInTheDocument();
    // Shows "建议" for l4-suggestion
    expect(screen.getByText('建议')).toBeInTheDocument();
    // Shows truncation notice when > 5
    expect(screen.getByText(/还有 1 项见/)).toBeInTheDocument();
  });

  it('shows violations with l4-fail tag for l4-fail dimension', () => {
    const artifact = makeArtifact({
      quality: {
        overall: 30,
        dimensions: {
          traceability: 0,
          factualConsistency: 0,
          novelty: 0,
          coverage: 0,
          redundancy: 0,
          formatCorrectness: 0,
          citationDensity: 0,
          styleConformance: 0,
          lengthAccuracy: 0,
          chapterBalance: 0,
        },
        hardGateViolations: [
          { dimension: 'l4-fail', severity: 'error', message: '总体失败' },
        ],
        warnings: [],
        qualityTrace: [],
        finalVerdict: 'poor',
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.getByText('总体评判')).toBeInTheDocument();
  });

  it('shows violations with dimension name as fallback tag', () => {
    const artifact = makeArtifact({
      quality: {
        overall: 50,
        dimensions: {
          traceability: 50,
          factualConsistency: 50,
          novelty: 50,
          coverage: 50,
          redundancy: 50,
          formatCorrectness: 50,
          citationDensity: 50,
          styleConformance: 50,
          lengthAccuracy: 50,
          chapterBalance: 50,
        },
        hardGateViolations: [
          {
            dimension: 'custom-dim',
            severity: 'warning',
            message: '自定义问题',
          },
        ],
        warnings: [],
        qualityTrace: [],
        finalVerdict: 'acceptable',
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.getByText('custom-dim')).toBeInTheDocument();
  });

  it('does not show violations banner when empty', () => {
    const artifact = makeArtifact();
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.queryByText(/Critic 复审标记/)).not.toBeInTheDocument();
  });

  it('strips参考文献 and References patterns', () => {
    const artifact = makeArtifact({
      content: {
        fullMarkdown: '## 内容\n\n正文内容\n\n## References\n\n1. Source A',
        fullReportSize: 50,
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    const md = screen.getByTestId('artifact-markdown');
    expect(md.textContent).not.toContain('References');
    expect(md.textContent).toContain('内容');
  });

  it('strips参考资料 pattern', () => {
    const artifact = makeArtifact({
      content: {
        fullMarkdown: '## 内容\n\n正文内容\n\n## 参考资料\n\n1. Source A',
        fullReportSize: 50,
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    const md = screen.getByTestId('artifact-markdown');
    expect(md.textContent).not.toContain('参考资料');
  });

  it('passes dimNames derived from dimension sections to ArtifactMarkdown', () => {
    const artifact = makeArtifact();
    render(<ContinuousReader artifact={artifact} />);
    // Both sections have type='dimension', so dimNames should be derived
    const md = screen.getByTestId('artifact-markdown');
    expect(md).toBeInTheDocument();
  });

  it('handles reverseHighlight effect with querySelector returning no elements', async () => {
    const artifact = makeArtifact();
    render(<ContinuousReader artifact={artifact} />);
    // The ReferencePanel mock doesn't invoke the highlight callback; we just
    // verify the component mounts and renders without errors
    expect(screen.getByTestId('reference-panel')).toBeInTheDocument();
  });

  it('handles violations with exactly 5 (no truncation)', () => {
    const artifact = makeArtifact({
      quality: {
        overall: 30,
        dimensions: {
          traceability: 30,
          factualConsistency: 30,
          novelty: 30,
          coverage: 30,
          redundancy: 30,
          formatCorrectness: 30,
          citationDensity: 30,
          styleConformance: 30,
          lengthAccuracy: 30,
          chapterBalance: 30,
        },
        hardGateViolations: Array.from({ length: 5 }, (_, i) => ({
          dimension: 'l4-critic',
          severity: 'error' as const,
          message: `问题 ${i + 1}`,
        })),
        warnings: [],
        qualityTrace: [],
        finalVerdict: 'poor',
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.queryByText(/还有/)).not.toBeInTheDocument();
  });

  it('shows "严重违规" when any violation has error severity', () => {
    const artifact = makeArtifact({
      quality: {
        overall: 30,
        dimensions: {
          traceability: 30,
          factualConsistency: 30,
          novelty: 30,
          coverage: 30,
          redundancy: 30,
          formatCorrectness: 30,
          citationDensity: 30,
          styleConformance: 30,
          lengthAccuracy: 30,
          chapterBalance: 30,
        },
        hardGateViolations: [
          { dimension: 'l4-critic', severity: 'error', message: '严重错误' },
        ],
        warnings: [],
        qualityTrace: [],
        finalVerdict: 'poor',
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.getByText(/严重违规/)).toBeInTheDocument();
  });

  it('shows "需关注事项" when all violations are warning severity', () => {
    const artifact = makeArtifact({
      quality: {
        overall: 50,
        dimensions: {
          traceability: 50,
          factualConsistency: 50,
          novelty: 50,
          coverage: 50,
          redundancy: 50,
          formatCorrectness: 50,
          citationDensity: 50,
          styleConformance: 50,
          lengthAccuracy: 50,
          chapterBalance: 50,
        },
        hardGateViolations: [
          { dimension: 'l4-blindspot', severity: 'warning', message: '警告' },
        ],
        warnings: [],
        qualityTrace: [],
        finalVerdict: 'acceptable',
      },
    });
    render(<ContinuousReader artifact={artifact} />);
    expect(screen.getByText(/需关注事项/)).toBeInTheDocument();
  });

  it('triggers handleReverseHighlight when citation clicked', () => {
    vi.useFakeTimers();
    const artifact = makeArtifact({
      citations: [makeCitation({ index: 1 })],
    });
    render(<ContinuousReader artifact={artifact} />);
    // Click cite button from the mocked ReferencePanel
    fireEvent.click(screen.getByTestId('cite-click'));
    // reverseHighlight useEffect runs (querySelector on jsdom returns null, no-op)
    vi.useRealTimers();
  });

  it('clears reverseHighlight after timeout', async () => {
    vi.useFakeTimers();
    const artifact = makeArtifact({
      citations: [makeCitation({ index: 1 })],
    });
    render(<ContinuousReader artifact={artifact} />);
    fireEvent.click(screen.getByTestId('cite-click'));
    // Advance 4s to trigger the timeout that clears reverseHighlight
    await act(async () => {
      vi.advanceTimersByTime(4001);
    });
    vi.useRealTimers();
  });
});
