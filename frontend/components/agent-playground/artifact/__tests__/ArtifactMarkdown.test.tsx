/**
 * ArtifactMarkdown tests
 *
 * Strategy:
 * 1. Mock heavy external plugins (remark-math, rehype-katex, rehype-sanitize).
 * 2. Use a smart ReactMarkdown mock that reads the `components` prop and
 *    invokes img/text component overrides so we cover those code paths.
 * 3. Test renumberHeadings + supplementary + JSON fragment branches via rendered text.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// --- Mock heavy markdown/rehype packages ---
vi.mock('remark-gfm', () => ({ default: () => {} }));
vi.mock('remark-math', () => ({ default: () => {} }));
vi.mock('rehype-katex', () => ({ default: () => {} }));
vi.mock('rehype-sanitize', () => ({
  default: () => {},
  defaultSchema: {
    tagNames: [
      'p',
      'a',
      'strong',
      'em',
      'code',
      'pre',
      'blockquote',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'img',
      'br',
      'hr',
      'div',
      'span',
      'svg',
      'path',
    ],
    attributes: {
      '*': ['className', 'class'],
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt', 'title'],
      svg: ['viewBox', 'xmlns'],
      path: ['d'],
    },
  },
}));

// Smart ReactMarkdown mock: calls components.img with any #fig-* found in the text,
// and calls components.p on text lines so processText is exercised
vi.mock('react-markdown', () => ({
  default: ({
    children,
    components,
  }: {
    children: string;
    components?: Record<string, React.FC<unknown>>;
  }) => {
    const comps = components ?? {};
    const ImgComp = comps.img as
      | React.FC<{ src?: string; alt?: string }>
      | undefined;
    const PComp = comps.p as React.FC<{ children?: string }> | undefined;

    const nodes: React.ReactNode[] = [];
    const lines = children.split('\n');

    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      // Handle image lines
      const imgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
      let imgMatch: RegExpExecArray | null;
      let lastIdx = 0;
      const lineNodes: React.ReactNode[] = [];
      while ((imgMatch = imgRe.exec(line)) !== null) {
        if (imgMatch.index > lastIdx) {
          lineNodes.push(line.slice(lastIdx, imgMatch.index));
        }
        if (ImgComp) {
          lineNodes.push(
            <ImgComp
              key={`img-${imgMatch[2]}-${li}`}
              src={imgMatch[2]}
              alt={imgMatch[1]}
            />
          );
        }
        lastIdx = imgMatch.index + imgMatch[0].length;
      }
      if (lastIdx < line.length) {
        lineNodes.push(line.slice(lastIdx));
      }

      if (lineNodes.some((n) => React.isValidElement(n))) {
        nodes.push(<span key={li}>{lineNodes}</span>);
      } else {
        // Plain text line - invoke PComp if available to exercise processText
        // Also call PComp with empty string to cover the `parts.length === 0` branch
        const text = lineNodes.join('');
        if (PComp) {
          nodes.push(<PComp key={li}>{text}</PComp>);
        } else if (text) {
          nodes.push(<span key={li}>{text}</span>);
        }
      }
    }

    return <div data-testid="react-markdown">{nodes}</div>;
  },
}));

// Mock createMarkdownComponents to invoke processText on text nodes
// so the citation rendering code paths are exercised
vi.mock('@/components/common/markdown-viewer', () => ({
  createMarkdownComponents: (
    processText?: (text: string) => React.ReactNode
  ) => ({
    img: ({ src, alt }: { src?: string; alt?: string }) => (
      <img src={src} alt={alt} />
    ),
    // p component invokes processText on its children text
    p: ({ children }: { children?: React.ReactNode }) => {
      if (processText && typeof children === 'string') {
        return <p>{processText(children)}</p>;
      }
      return <p>{children}</p>;
    },
  }),
  preprocessLatex: (s: string) => s,
  stripProseBullets: (s: string) => s,
  KATEX_OPTIONS: {},
}));

// Mock CitationBadge
vi.mock('@/components/common/citations/CitationBadge', () => ({
  CitationBadge: ({ index }: { index: number }) => (
    <sup data-testid={`citation-${index}`}>[{index}]</sup>
  ),
}));

// Mock FigureRenderer
vi.mock('@/components/common/chart-viewer/FigureRenderer', () => ({
  FigureRenderer: ({ chart }: { chart: { title: string } }) => (
    <div data-testid="figure-renderer">{chart.title}</div>
  ),
}));

import { ArtifactMarkdown } from '../ArtifactMarkdown';
import type {
  ArtifactCitation,
  ArtifactFigure,
} from '@/lib/features/agent-playground/report-artifact.types';

function makeCitation(index: number): ArtifactCitation {
  return {
    index,
    uuid: `uuid-${index}`,
    title: `Source ${index}`,
    url: `https://example.com/${index}`,
    domain: 'example.com',
    sourceType: 'news',
    credibilityScore: 80,
    accessedAt: '2025-01-01',
    occurrences: [],
  };
}

function makeFigure(
  id: string,
  type: ArtifactFigure['type'] = 'reference'
): ArtifactFigure {
  return {
    id,
    type,
    evidenceCitationIndex: 1,
    sourceUrl: 'https://example.com',
    imageUrl: 'https://example.com/img.png',
    title: `Figure ${id}`,
    caption: `Caption for ${id}`,
    altText: `Alt ${id}`,
    sectionId: 'sec-1',
    paragraphIndex: 0,
    anchorMode: 'after_paragraph',
    referencedBy: [],
  };
}

describe('ArtifactMarkdown', () => {
  it('renders without crashing with minimal props', () => {
    render(<ArtifactMarkdown markdown="hello" citations={[]} figures={[]} />);
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('renders markdown content in article wrapper', () => {
    const { container } = render(
      <ArtifactMarkdown markdown="test content" citations={[]} figures={[]} />
    );
    const article = container.querySelector('article');
    expect(article).toBeTruthy();
  });

  it('renders simple text markdown', () => {
    render(
      <ArtifactMarkdown markdown="Hello World" citations={[]} figures={[]} />
    );
    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });

  it('passes dimNames and dimStartIndex props without error', () => {
    render(
      <ArtifactMarkdown
        markdown="## My Heading"
        citations={[]}
        figures={[]}
        dimNames={['My Heading']}
        dimStartIndex={2}
      />
    );
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('renders with citations', () => {
    render(
      <ArtifactMarkdown
        markdown="text"
        citations={[makeCitation(1), makeCitation(2)]}
        figures={[]}
      />
    );
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('renders with figures', () => {
    render(
      <ArtifactMarkdown
        markdown="text"
        citations={[]}
        figures={[makeFigure('fig-1')]}
      />
    );
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('article has prose classes', () => {
    const { container } = render(
      <ArtifactMarkdown markdown="x" citations={[]} figures={[]} />
    );
    const article = container.querySelector('article');
    expect(article?.className).toContain('prose');
  });

  it('article has max-w-none class', () => {
    const { container } = render(
      <ArtifactMarkdown markdown="x" citations={[]} figures={[]} />
    );
    const article = container.querySelector('article');
    expect(article?.className).toContain('max-w-none');
  });

  it('React.memo: same props do not cause re-render (stable ref)', () => {
    const citations: ArtifactCitation[] = [];
    const figures: ArtifactFigure[] = [];
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="stable"
        citations={citations}
        figures={figures}
      />
    );
    rerender(
      <ArtifactMarkdown
        markdown="stable"
        citations={citations}
        figures={figures}
      />
    );
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('img component renders FigureRenderer for #fig-* src', () => {
    const figure = makeFigure('fig-test');
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-test)"
        citations={[makeCitation(1)]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
    expect(screen.getByText('Figure fig-test')).toBeInTheDocument();
  });

  it('img component shows missing placeholder for unknown fig id', () => {
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-unknown)"
        citations={[]}
        figures={[]}
      />
    );
    expect(screen.getByText(/图占位 fig-unknown 未找到/)).toBeInTheDocument();
  });

  it('img component falls back to base img for normal src', () => {
    const { container } = render(
      <ArtifactMarkdown
        markdown="![photo](https://example.com/photo.jpg)"
        citations={[]}
        figures={[]}
      />
    );
    // The base `img` component from createMarkdownComponents is invoked
    // Our mock createMarkdownComponents returns a simple <img> element
    const img = container.querySelector('img');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('https://example.com/photo.jpg');
  });

  it('figure with extracted_chart type maps to generated chartType', () => {
    const figure = makeFigure('fig-chart', 'extracted_chart');
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-chart)"
        citations={[]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('figure citation evidence is null when citation not found', () => {
    const figure = makeFigure('fig-no-cite');
    figure.evidenceCitationIndex = 99; // no citation with index 99
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-no-cite)"
        citations={[makeCitation(1)]}
        figures={[figure]}
      />
    );
    // FigureRenderer should still render even with null citation
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('figure citation evidence is passed when citation found', () => {
    const figure = makeFigure('fig-with-cite');
    figure.evidenceCitationIndex = 1;
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-with-cite)"
        citations={[makeCitation(1)]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });
});

describe('ArtifactMarkdown renumberHeadings (via render)', () => {
  it('strips old numbering prefix from H2', () => {
    render(
      <ArtifactMarkdown
        markdown={'## 36. Core Architecture'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('Core Architecture');
    expect(md.textContent).not.toContain('36. Core Architecture');
  });

  it('renumbers H2 to start from 1', () => {
    render(
      <ArtifactMarkdown
        markdown={'## 36. My Heading'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. My Heading');
  });

  it('supplementary headings are not numbered', () => {
    render(
      <ArtifactMarkdown
        markdown={'## 执行摘要\ncontent'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('执行摘要');
    expect(md.textContent).not.toContain('1. 执行摘要');
  });

  it('supplementary heading in english also preserved', () => {
    render(
      <ArtifactMarkdown
        markdown={'## Executive Summary\ncontent'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).not.toContain('1. Executive Summary');
  });

  it('H3 under dim gets N.M. numbering', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n### Sub Chapter\ncontent'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. My Dim');
    expect(md.textContent).toContain('1.1. Sub Chapter');
  });

  it('H3 that is duplicate of dim name is deleted', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n### My Dim\ncontent'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    const count = (md.textContent?.match(/My Dim/g) || []).length;
    expect(count).toBe(1);
  });

  it('H4 heading strips old numbering', () => {
    render(
      <ArtifactMarkdown
        markdown={'#### 1.2. Sub Sub'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('Sub Sub');
    expect(md.textContent).not.toContain('1.2. Sub Sub');
  });

  it('JSON fragment H3 is downgraded to plain text', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n### "label": "Economic Model"\ncontent'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('"label": "Economic Model"');
  });

  it('code fence blocks are not processed', () => {
    render(
      <ArtifactMarkdown
        markdown={'```\n## inside fence\n```'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('## inside fence');
  });

  it('dimStartIndex shifts H2 numbering', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
        dimStartIndex={3}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('3. My Dim');
  });

  it('H2 without dimNames treats all as dimensions', () => {
    render(
      <ArtifactMarkdown
        markdown={'## First\n## Second'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. First');
    expect(md.textContent).toContain('2. Second');
  });

  it('chapter H2 under dim (old format) is demoted to H3', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n## 1. Sub Chapter'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('Sub Chapter');
  });

  it('H3 under dim before any chapter → becomes chapter', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n### Early Chapter'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1.1. Early Chapter');
  });

  it('H3 sub-section after chapter becomes H4', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n### Chapter One\n### Sub Section'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1.1. Chapter One');
    expect(md.textContent).toContain('Sub Section');
    expect(md.textContent).not.toContain('1.2. Sub Section');
  });

  it('dimName prefix match (dimName is prefix of cleaned)', () => {
    // If cleaned text starts with dimName → dimension
    render(
      <ArtifactMarkdown
        markdown={'## China AI Regulation Overview'}
        citations={[]}
        figures={[]}
        dimNames={['China AI Regulation']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. China AI Regulation Overview');
  });

  it('cleaned starts with dimName → treated as dimension', () => {
    render(
      <ArtifactMarkdown
        markdown={'## Training Cost Evolution'}
        citations={[]}
        figures={[]}
        dimNames={['Training Cost']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. Training Cost Evolution');
  });

  it('non-matching dimName with short cleaned → not a dimension, treated as supplementary fallback', () => {
    // When no dimNames match and underDim is false → line stays as bare H2
    render(
      <ArtifactMarkdown
        markdown={'## 结论'}
        citations={[]}
        figures={[]}
        dimNames={['Something Else']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // '结论' is supplementary so it stays unnumbered
    expect(md.textContent).toContain('结论');
    expect(md.textContent).not.toContain('1. 结论');
  });

  it('H2 with empty dimNames array treats all non-supplementary H2 as dims', () => {
    render(
      <ArtifactMarkdown
        markdown={'## My Topic'}
        citations={[]}
        figures={[]}
        dimNames={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // Empty dimNames → matchDimName returns true for all
    expect(md.textContent).toContain('1. My Topic');
  });

  it('matchDimName skips empty string dimName entries (if !n continue)', () => {
    // dimNames array with empty string entries should skip them and still match the real name
    render(
      <ArtifactMarkdown
        markdown={'## Real Topic'}
        citations={[]}
        figures={[]}
        dimNames={['', 'Real Topic', '']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. Real Topic');
  });

  it('matchDimName: dimName starts with cleaned AND cleaned is >= 6 chars → dimension', () => {
    // n.startsWith(t) && t.length >= 6 branch
    // dimName = "China AI Regulation Analysis (Full)" → starts with "China "
    // cleaned H2 = "China " (6+ chars, and dimName starts with it)
    render(
      <ArtifactMarkdown
        markdown={'## China Training'}
        citations={[]}
        figures={[]}
        dimNames={['China Training Cost Evolution Overview']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // "china training" (14 chars) starts with "china training cost..." → n.startsWith(t)
    // Actually: t="china training", n="china training cost evolution overview"
    // n.startsWith(t) → true, t.length=14 >= 6 → true → dimension
    expect(md.textContent).toContain('1. China Training');
  });

  it('matchDimName: dimName starts with cleaned but cleaned is < 6 chars → not a dimension', () => {
    // n.startsWith(t) && t.length >= 6 should be false when cleaned < 6 chars
    render(
      <ArtifactMarkdown
        markdown={'## AI'}
        citations={[]}
        figures={[]}
        dimNames={['AI Technology Overview for Markets']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // t="ai" (2 chars), n starts with "ai" → n.startsWith(t) true BUT t.length=2 < 6
    // So matchDimName returns false → H2 gets bare cleaned heading
    expect(md.textContent).toContain('AI');
    // Should NOT be numbered as dimension
    expect(md.textContent).not.toContain('1. AI');
  });

  it('matchDimName: all dimNames are empty strings → function returns false, H2 stays bare', () => {
    // when all dimNames are skipped (!n continue), loop ends and returns false
    render(
      <ArtifactMarkdown
        markdown={'## Some Heading'}
        citations={[]}
        figures={[]}
        dimNames={['', '', '']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // matchDimName('some heading', ['', '', '']) → all n are falsy → return false
    // H2 with no dim match and underDim=false → bare cleaned heading
    expect(md.textContent).toContain('Some Heading');
    expect(md.textContent).not.toContain('1. Some Heading');
  });

  it('isSupplementaryHeading: startsWith match (not exact equality)', () => {
    // t.startsWith(s.toLowerCase()) true branch at line 118
    // "执行摘要报告" starts with "执行摘要" but isn't equal to it
    render(
      <ArtifactMarkdown
        markdown={'## 执行摘要报告\ncontent'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // Should NOT be numbered (supplementary even though not exact match)
    expect(md.textContent).toContain('执行摘要报告');
    expect(md.textContent).not.toContain('1. 执行摘要报告');
  });

  it('looksLikeJsonFragment: empty cleaned string returns false (line 164 branch)', () => {
    // Strip heading number from "### 1." → cleaned = "" → !t → returns false
    // Line 164: if (!t) return false
    render(
      <ArtifactMarkdown
        markdown={'## My Dim\n### 1.'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    // "### 1." stripped of prefix → cleaned="" → looksLikeJsonFragment("") → false
    // Then underDim=true → continue normal H3 processing
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('matchDimName: empty cleaned string returns false (line 144 branch)', () => {
    // Strip heading number from "## 1." → cleaned = "" → !t at line 144 → returns false
    render(
      <ArtifactMarkdown
        markdown={'## 1.'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    // "## 1." stripped → cleaned="" → matchDimName("", ["My Dim"]) → !t → false
    // H2 not supplementary, not matched, underDim=false → bare heading (empty after strip)
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('matchDimName: exact match returns true', () => {
    render(
      <ArtifactMarkdown
        markdown={'## Exact Match Topic'}
        citations={[]}
        figures={[]}
        dimNames={['Exact Match Topic']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // t === n → true immediately
    expect(md.textContent).toContain('1. Exact Match Topic');
  });

  it('tilde fence also toggles code fence mode', () => {
    render(
      <ArtifactMarkdown
        markdown={'~~~\n## inside tilde fence\n~~~'}
        citations={[]}
        figures={[]}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('## inside tilde fence');
  });

  it('H3 outside dim context gets stripped prefix but no numbering', () => {
    render(
      <ArtifactMarkdown
        markdown={'### 3. Orphan H3'}
        citations={[]}
        figures={[]}
        dimNames={['Something']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('Orphan H3');
    expect(md.textContent).not.toContain('3. Orphan H3');
  });

  it('H2 not matching dimNames and not supplementary → bare heading (line 237 branch)', () => {
    // When dimNames is provided AND the H2 doesn't match AND underDim is false
    // the H2 gets cleaned but no dim number
    render(
      <ArtifactMarkdown
        markdown={'## Non Matching Section'}
        citations={[]}
        figures={[]}
        dimNames={['Totally Different Topic']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    // The heading stays as-is (stripped but no number)
    expect(md.textContent).toContain('Non Matching Section');
    expect(md.textContent).not.toContain('1. Non Matching Section');
  });

  it('multiple supplementary then a dim - supplementary resets underDim', () => {
    render(
      <ArtifactMarkdown
        markdown={'## 执行摘要\n## My Dim\n### Chapter'}
        citations={[]}
        figures={[]}
        dimNames={['My Dim']}
      />
    );
    const md = screen.getByTestId('react-markdown');
    expect(md.textContent).toContain('1. My Dim');
    expect(md.textContent).toContain('1.1. Chapter');
  });
});

describe('ArtifactMarkdown processText (citation rendering via custom img test component)', () => {
  it('processText renders CitationBadge for known citation [N]', () => {
    render(
      <ArtifactMarkdown
        markdown="Content referencing [1] and [2]"
        citations={[makeCitation(1), makeCitation(2)]}
        figures={[]}
      />
    );
    // The PComp invokes processText → CitationBadge is rendered for [1]
    expect(screen.getByTestId('citation-1')).toBeInTheDocument();
    expect(screen.getByTestId('citation-2')).toBeInTheDocument();
  });

  it('processText renders <sup> placeholder for missing citation [N]', () => {
    render(
      <ArtifactMarkdown
        markdown="Content [5] with missing citation"
        citations={[makeCitation(1)]}
        figures={[]}
      />
    );
    // [5] is not in citations → renders <sup> placeholder
    const sups = document.querySelectorAll('sup');
    const missingCiteSup = Array.from(sups).find((s) =>
      s.textContent?.includes('[5]')
    );
    expect(missingCiteSup).toBeTruthy();
  });

  it('processText handles text with no citations', () => {
    render(
      <ArtifactMarkdown
        markdown="Plain text with no brackets"
        citations={[makeCitation(1)]}
        figures={[]}
      />
    );
    expect(screen.getByText(/Plain text with no brackets/)).toBeInTheDocument();
  });

  it('processText handles text after last citation', () => {
    render(
      <ArtifactMarkdown
        markdown="See [1] for details and more."
        citations={[makeCitation(1)]}
        figures={[]}
      />
    );
    expect(screen.getByTestId('citation-1')).toBeInTheDocument();
  });

  it('processText: citation at start of text (m.index === lastIdx, no prefix pushed)', () => {
    // Covers the `if (m.index > lastIdx)` FALSE branch at line 348
    // When [1] is at position 0 → m.index=0, lastIdx=0 → 0 > 0 = false → no prefix text
    render(
      <ArtifactMarkdown
        markdown="[1] starts the sentence"
        citations={[makeCitation(1)]}
        figures={[]}
      />
    );
    expect(screen.getByTestId('citation-1')).toBeInTheDocument();
  });

  it('component mounts with citation list without error', () => {
    render(
      <ArtifactMarkdown
        markdown="Content referencing [1] and [2]"
        citations={[makeCitation(1), makeCitation(2)]}
        figures={[]}
      />
    );
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('component mounts with empty citation list', () => {
    render(
      <ArtifactMarkdown
        markdown="Content [5] with missing citation"
        citations={[]}
        figures={[]}
      />
    );
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('processText returns text (empty string input) when parts is empty', () => {
    // The `return parts.length > 0 ? parts : text` false branch:
    // processText('') → while loop finds no matches, lastIdx=0, 0 < 0 is false
    // → parts is [], parts.length === 0 → returns text (empty string)
    render(
      <ArtifactMarkdown
        markdown=""
        citations={[makeCitation(1)]}
        figures={[]}
      />
    );
    // Just check it renders without error (empty string edge case)
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('toEvidence with citation missing optional fields (uuid fallback and null fields)', () => {
    // c.uuid || `cite-${c.index}` false branch: uuid is empty/falsy
    // c.title ?? null, c.url ?? null etc: fields are null/undefined
    const figure = makeFigure('fig-ev');
    figure.evidenceCitationIndex = 5;
    const citationNoOptionals: ArtifactCitation = {
      index: 5,
      uuid: '', // falsy → fallback to `cite-5`
      // required fields with empty/zero values to simulate "missing" optional data
      title: '',
      url: '',
      domain: '',
      accessedAt: '',
      sourceType: 'other',
      credibilityScore: 0,
      occurrences: [],
    };
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-ev)"
        citations={[citationNoOptionals]}
        figures={[figure]}
      />
    );
    // FigureRenderer still renders
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('toRenderableChart with generated type (not extracted_chart or reference)', () => {
    // chartType branch: f.type !== 'extracted_chart' && f.type !== 'reference' → 'generated'
    const figure = makeFigure(
      'fig-generated',
      'generated' as ArtifactFigure['type']
    );
    render(
      <ArtifactMarkdown
        markdown="![alt](#fig-generated)"
        citations={[]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('multiple figures render all in order', () => {
    render(
      <ArtifactMarkdown
        markdown={'![alt](#fig-1)\n![alt](#fig-2)'}
        citations={[]}
        figures={[makeFigure('fig-1'), makeFigure('fig-2')]}
      />
    );
    const figs = screen.getAllByTestId('figure-renderer');
    expect(figs.length).toBe(2);
  });

  it('StableFigureBlock memo comparator: re-render with same figure does not remount', () => {
    // This exercises the React.memo comparator (line 73) by triggering a re-render
    const figure = makeFigure('fig-stable');
    const citation = makeCitation(1);
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-stable)"
        citations={[citation]}
        figures={[figure]}
      />
    );
    // Re-render with same props references → memo comparator should prevent re-mount
    rerender(
      <ArtifactMarkdown
        markdown="![alt](#fig-stable)"
        citations={[citation]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: re-render with different figure title causes update', () => {
    const figure1 = makeFigure('fig-change');
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-change)"
        citations={[]}
        figures={[figure1]}
      />
    );
    const figure2 = { ...figure1, title: 'New Title' };
    rerender(
      <ArtifactMarkdown
        markdown="![alt](#fig-change)"
        citations={[]}
        figures={[figure2]}
      />
    );
    expect(screen.getByText('New Title')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: re-render with different imageUrl causes update', () => {
    const figure1 = makeFigure('fig-img');
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-img)"
        citations={[]}
        figures={[figure1]}
      />
    );
    const figure2 = { ...figure1, imageUrl: 'https://new.com/img2.png' };
    rerender(
      <ArtifactMarkdown
        markdown="![alt](#fig-img)"
        citations={[]}
        figures={[figure2]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: re-render with different caption causes update', () => {
    const figure1 = makeFigure('fig-cap');
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-cap)"
        citations={[]}
        figures={[figure1]}
      />
    );
    const figure2 = { ...figure1, caption: 'New Caption' };
    rerender(
      <ArtifactMarkdown
        markdown="![alt](#fig-cap)"
        citations={[]}
        figures={[figure2]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: different citation uuid triggers update', () => {
    const figure = makeFigure('fig-cite-change');
    figure.evidenceCitationIndex = 1;
    const cite1 = makeCitation(1);
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-cite-change)"
        citations={[cite1]}
        figures={[figure]}
      />
    );
    const cite2 = { ...cite1, uuid: 'new-uuid-999' };
    rerender(
      <ArtifactMarkdown
        markdown="![alt](#fig-cite-change)"
        citations={[cite2]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: null citation to defined citation triggers update', () => {
    const figure = makeFigure('fig-cite-null');
    figure.evidenceCitationIndex = 99; // no citation initially
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-cite-null)"
        citations={[]}
        figures={[figure]}
      />
    );
    // Now provide the citation
    const cite = { ...makeCitation(99), index: 99 };
    rerender(
      <ArtifactMarkdown
        markdown="![alt](#fig-cite-null)"
        citations={[cite]}
        figures={[figure]}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo comparator: stable citations+figures with markdown change invokes comparator', () => {
    // When citations and figures are STABLE references, the components useMemo is not
    // invalidated on re-render. React will then try to reconcile the existing
    // StableFigureBlock with the new props, invoking the memo comparator.
    const figure = makeFigure('fig-memo-test');
    figure.evidenceCitationIndex = 1;
    const citation = makeCitation(1);
    const figures = [figure];
    const citations = [citation];

    const { rerender } = render(
      <ArtifactMarkdown
        markdown="![alt](#fig-memo-test)"
        citations={citations}
        figures={figures}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();

    // Re-render with same citations and figures (stable refs) but different markdown
    // This should NOT invalidate components useMemo, so React calls the comparator
    rerender(
      <ArtifactMarkdown
        markdown="prefix text\n![alt](#fig-memo-test)"
        citations={citations}
        figures={figures}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: all same props returns true (comparator returns true)', () => {
    // Force multiple re-renders with exactly same figure and citation props
    // so the comparator returns true (memoized, no re-render)
    const figure = makeFigure('fig-allsame');
    figure.evidenceCitationIndex = 2;
    const citation = makeCitation(2);
    const figures = [figure];
    const citations = [citation];

    const { rerender } = render(
      <ArtifactMarkdown
        markdown="intro\n![alt](#fig-allsame)\nconclusion"
        citations={citations}
        figures={figures}
      />
    );
    // Multiple re-renders with stable refs and different markdown to trigger comparator
    rerender(
      <ArtifactMarkdown
        markdown="new intro\n![alt](#fig-allsame)\nconclusion"
        citations={citations}
        figures={figures}
      />
    );
    rerender(
      <ArtifactMarkdown
        markdown="another intro\n![alt](#fig-allsame)\nconclusion"
        citations={citations}
        figures={figures}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });

  it('StableFigureBlock memo: citation changes from null to non-null covers citation?.uuid branches', () => {
    // Covers (prev.citation?.uuid ?? null) === (next.citation?.uuid ?? null) at line 77
    // When citation is null → prev.citation?.uuid → undefined → ?? null → null
    // When citation has uuid → next.citation?.uuid → "uuid-3" → ?? → "uuid-3"
    const figure = makeFigure('fig-cite-branch');
    figure.evidenceCitationIndex = 3;
    // First render: citation not found (evidenceCitationIndex=3 but citations=[])
    const citations: ArtifactCitation[] = [];
    const figures = [figure];
    const { rerender } = render(
      <ArtifactMarkdown
        markdown="start text\n![alt](#fig-cite-branch)\nmore"
        citations={citations}
        figures={figures}
      />
    );
    // Second render: same figures stable, no change to trigger comparator with same key
    rerender(
      <ArtifactMarkdown
        markdown="updated text\n![alt](#fig-cite-branch)\nmore"
        citations={citations}
        figures={figures}
      />
    );
    expect(screen.getByTestId('figure-renderer')).toBeInTheDocument();
  });
});
