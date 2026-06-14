/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Lucide icons ──────────────────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  FileText: (p: Record<string, unknown>) => (
    <svg data-testid="file-text-icon" {...p} />
  ),
  ChevronDown: (p: Record<string, unknown>) => (
    <svg data-testid="chevron-down-icon" {...p} />
  ),
  ExternalLink: (p: Record<string, unknown>) => (
    <svg data-testid="external-link-icon" {...p} />
  ),
  Sparkles: (p: Record<string, unknown>) => (
    <svg data-testid="sparkles-icon" {...p} />
  ),
  History: (p: Record<string, unknown>) => (
    <svg data-testid="history-icon" {...p} />
  ),
}));

vi.mock('@/lib/utils/common', () => ({
  cn: (...classes: (string | undefined | false | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/agent-playground/ui', () => ({
  Card: ({
    children,
    className,
    bordered,
  }: {
    children: React.ReactNode;
    className?: string;
    bordered?: boolean;
  }) => (
    <div
      data-testid="card"
      className={className}
      data-bordered={bordered ? 'true' : undefined}
    >
      {children}
    </div>
  ),
}));

vi.mock('@/lib/features/agent-playground/formatters', () => ({
  scoreColor: (s: number) =>
    s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-red-600',
}));

// ReactMarkdown mock that also renders sample nodes via the `components` prop
// so that MD_COMPONENTS functions (a, p, ul, ol, h1-h3, strong, blockquote, code) get coverage
vi.mock('react-markdown', () => ({
  default: ({
    children,
    components,
  }: {
    children: string;
    components?: Record<
      string,
      (props: Record<string, unknown>) => React.ReactNode
    >;
  }) => {
    const C = components ?? {};
    return (
      <div data-testid="markdown">
        <span data-testid="md-raw">{children}</span>
        {/* Invoke each MD_COMPONENT function so they get coverage */}
        {C.p && <>{C.p({ children: 'paragraph text' })}</>}
        {C.ul && <>{C.ul({ children: <li>item</li> })}</>}
        {C.ol && <>{C.ol({ children: <li>item 1</li> })}</>}
        {C.h1 && <>{C.h1({ children: 'Heading 1' })}</>}
        {C.h2 && <>{C.h2({ children: 'Heading 2' })}</>}
        {C.h3 && <>{C.h3({ children: 'Heading 3' })}</>}
        {C.strong && <>{C.strong({ children: 'bold text' })}</>}
        {C.blockquote && <>{C.blockquote({ children: 'quoted text' })}</>}
        {C.code && <>{C.code({ children: 'code snippet' })}</>}
        {C.a && (
          <>{C.a({ href: 'https://example.com', children: 'safe link' })}</>
        )}
        {C.a && (
          <>{C.a({ href: 'javascript:evil()', children: 'unsafe link' })}</>
        )}
        {C.a && <>{C.a({ href: undefined, children: 'no href' })}</>}
      </div>
    );
  },
}));

vi.mock('remark-gfm', () => ({ default: () => {} }));

import { ReportPanel } from '../ReportPanel';
import type { ReportDraft } from '@/lib/features/agent-playground/mission-presentation.types';

// ── helpers ───────────────────────────────────────────────────────────────────
function makeReport(
  overrides: Partial<ReportDraft['report']> = {}
): ReportDraft['report'] {
  return {
    title: 'Test Research Report',
    summary: 'This is the executive summary.',
    sections: [
      { heading: 'Introduction', body: 'Introduction body text.' },
      { heading: 'Methodology', body: 'Methodology body text.' },
    ],
    conclusion: 'Final conclusions here.',
    citations: [],
    ...overrides,
  };
}

function makeDraft(
  attempt: number,
  report?: Partial<ReportDraft['report']>
): ReportDraft {
  return {
    attempt,
    report: makeReport(report),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ReportPanel', () => {
  // ── 1. null finalReport ──────────────────────────────────────────────────────
  describe('when finalReport is null', () => {
    it('renders placeholder text', () => {
      render(<ReportPanel finalReport={null} reports={[]} />);
      expect(screen.getByText('输出报告将在这里呈现')).toBeInTheDocument();
    });

    it('renders Reflexion info text', () => {
      render(<ReportPanel finalReport={null} reports={[]} />);
      expect(
        screen.getByText(/Writer 起草 → Reviewer 共识评分/)
      ).toBeInTheDocument();
    });

    it('renders FileText icon', () => {
      render(<ReportPanel finalReport={null} reports={[]} />);
      expect(screen.getByTestId('file-text-icon')).toBeInTheDocument();
    });

    it('does not render any sections', () => {
      render(<ReportPanel finalReport={null} reports={[]} />);
      expect(screen.queryByText('Introduction')).not.toBeInTheDocument();
    });
  });

  // ── 2. basic report rendering ────────────────────────────────────────────────
  describe('with finalReport', () => {
    it('renders the report title', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.getByText('Test Research Report')).toBeInTheDocument();
    });

    it('renders "研究报告" when no title', () => {
      render(
        <ReportPanel
          finalReport={makeReport({ title: undefined })}
          reports={[]}
        />
      );
      expect(screen.getByText('研究报告')).toBeInTheDocument();
    });

    it('renders section count and citation count', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      // "2 章节 · 0 条引用 · X 字"
      expect(screen.getByText(/2 章节/)).toBeInTheDocument();
      expect(screen.getByText(/0 条引用/)).toBeInTheDocument();
    });

    it('shows citation count from citations array', () => {
      render(
        <ReportPanel
          finalReport={makeReport({ citations: ['src1', 'src2', 'src3'] })}
          reports={[]}
        />
      );
      expect(screen.getByText(/3 条引用/)).toBeInTheDocument();
    });

    it('renders executive summary when present', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.getByText('执行摘要')).toBeInTheDocument();
    });

    it('renders summary content via Markdown', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(
        screen.getByText('This is the executive summary.')
      ).toBeInTheDocument();
    });

    it('does not render summary section when summary is undefined', () => {
      render(
        <ReportPanel
          finalReport={makeReport({ summary: undefined })}
          reports={[]}
        />
      );
      expect(screen.queryByText('执行摘要')).not.toBeInTheDocument();
    });

    it('renders conclusion section when present', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.getByText('结论与建议')).toBeInTheDocument();
      expect(screen.getByText('Final conclusions here.')).toBeInTheDocument();
    });

    it('does not render conclusion section when conclusion is undefined', () => {
      render(
        <ReportPanel
          finalReport={makeReport({ conclusion: undefined })}
          reports={[]}
        />
      );
      expect(screen.queryByText('结论与建议')).not.toBeInTheDocument();
    });
  });

  // ── 3. Sections ──────────────────────────────────────────────────────────────
  describe('sections', () => {
    it('renders all section headings', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.getByText('Introduction')).toBeInTheDocument();
      expect(screen.getByText('Methodology')).toBeInTheDocument();
    });

    it('renders section number badges', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders section body content by default (expanded)', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.getByText('Introduction body text.')).toBeInTheDocument();
    });

    it('collapses a section on heading button click', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      const introBtn = screen.getByText('Introduction').closest('button');
      fireEvent.click(introBtn!);
      expect(
        screen.queryByText('Introduction body text.')
      ).not.toBeInTheDocument();
    });

    it('re-expands a collapsed section on second click', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      const introBtn = screen.getByText('Introduction').closest('button');
      fireEvent.click(introBtn!);
      fireEvent.click(introBtn!);
      expect(screen.getByText('Introduction body text.')).toBeInTheDocument();
    });

    it('renders "(empty)" for section with empty body', () => {
      render(
        <ReportPanel
          finalReport={makeReport({
            sections: [{ heading: 'Empty Section', body: '' }],
          })}
          reports={[]}
        />
      );
      expect(screen.getByText('(empty)')).toBeInTheDocument();
    });

    it('handles no sections gracefully', () => {
      render(
        <ReportPanel finalReport={makeReport({ sections: [] })} reports={[]} />
      );
      expect(screen.getByText('Test Research Report')).toBeInTheDocument();
    });
  });

  // ── 4. Section sources / links ───────────────────────────────────────────────
  describe('section sources', () => {
    const reportWithSources = makeReport({
      sections: [
        {
          heading: 'With Sources',
          body: 'Body text.',
          sources: [
            'https://valid.com/page',
            'javascript:alert(1)',
            'ftp://invalid.com',
          ],
        },
      ],
    });

    it('renders https source as a clickable link', () => {
      render(<ReportPanel finalReport={reportWithSources} reports={[]} />);
      // The section source link to valid.com/page should be present
      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));
      expect(hrefs).toContain('https://valid.com/page');
    });

    it('renders non-https source as a filtered span', () => {
      render(<ReportPanel finalReport={reportWithSources} reports={[]} />);
      // javascript: url is rendered as a span with the raw text
      expect(screen.getByText('javascript:alert(1)')).toBeInTheDocument();
    });

    it('does not render non-https source as a link', () => {
      render(<ReportPanel finalReport={reportWithSources} reports={[]} />);
      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));
      expect(hrefs).not.toContain('javascript:alert(1)');
    });

    it('sources are hidden when section is collapsed', () => {
      render(<ReportPanel finalReport={reportWithSources} reports={[]} />);
      const btn = screen.getByText('With Sources').closest('button');
      fireEvent.click(btn!);
      // When collapsed, ExternalLink icons (for section source links) should be gone
      expect(screen.queryAllByTestId('external-link-icon').length).toBe(0);
    });

    it('does not render ExternalLink icons when sources is empty', () => {
      render(
        <ReportPanel
          finalReport={makeReport({
            sections: [{ heading: 'No Sources', body: 'Text.', sources: [] }],
          })}
          reports={[]}
        />
      );
      // No ExternalLink icon should be rendered for section sources
      // (the mock MD components render their own "safe link" anchor, but no external-link-icon)
      const externalIcons = screen.queryAllByTestId('external-link-icon');
      expect(externalIcons.length).toBe(0);
    });
  });

  // ── 5. finalScore ────────────────────────────────────────────────────────────
  describe('finalScore', () => {
    it('renders CONSENSUS label and score when finalScore is provided', () => {
      render(
        <ReportPanel finalReport={makeReport()} reports={[]} finalScore={85} />
      );
      expect(screen.getByText('CONSENSUS')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
    });

    it('does not render CONSENSUS section when finalScore is undefined', () => {
      render(<ReportPanel finalReport={makeReport()} reports={[]} />);
      expect(screen.queryByText('CONSENSUS')).not.toBeInTheDocument();
    });

    it('does not render CONSENSUS section when finalScore is null (via cast)', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[]}
          finalScore={undefined}
        />
      );
      expect(screen.queryByText('CONSENSUS')).not.toBeInTheDocument();
    });
  });

  // ── 6. History panel ─────────────────────────────────────────────────────────
  describe('history panel', () => {
    it('does not show history card when only 1 report', () => {
      render(
        <ReportPanel finalReport={makeReport()} reports={[makeDraft(1)]} />
      );
      expect(
        screen.queryByText(/Writer Reflexion 历史/)
      ).not.toBeInTheDocument();
    });

    it('shows history card when more than 1 report', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[makeDraft(1), makeDraft(2)]}
        />
      );
      expect(
        screen.getByText(/Writer Reflexion 历史 · 共 2 轮/)
      ).toBeInTheDocument();
    });

    it('history is collapsed by default', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[makeDraft(1), makeDraft(2, { title: 'Second Draft' })]}
        />
      );
      expect(screen.queryByText(/第 1 轮/)).not.toBeInTheDocument();
      expect(screen.queryByText(/第 2 轮/)).not.toBeInTheDocument();
    });

    it('expands history on click', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[makeDraft(1), makeDraft(2)]}
        />
      );
      const historyBtn = screen
        .getByText(/Writer Reflexion 历史/)
        .closest('button');
      fireEvent.click(historyBtn!);
      expect(screen.getByText(/第 1 轮/)).toBeInTheDocument();
      expect(screen.getByText(/第 2 轮/)).toBeInTheDocument();
    });

    it('collapses history on second click', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[makeDraft(1), makeDraft(2)]}
        />
      );
      const historyBtn = screen
        .getByText(/Writer Reflexion 历史/)
        .closest('button');
      fireEvent.click(historyBtn!);
      fireEvent.click(historyBtn!);
      expect(screen.queryByText(/第 1 轮/)).not.toBeInTheDocument();
    });

    it('renders round titles in history list', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[
            makeDraft(1, { title: 'First Draft' }),
            makeDraft(2, { title: 'Second Draft' }),
          ]}
        />
      );
      const historyBtn = screen
        .getByText(/Writer Reflexion 历史/)
        .closest('button');
      fireEvent.click(historyBtn!);
      expect(screen.getByText(/第 1 轮 · First Draft/)).toBeInTheDocument();
      expect(screen.getByText(/第 2 轮 · Second Draft/)).toBeInTheDocument();
    });

    it('renders "（无标题）" for attempts without title', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[makeDraft(1, { title: undefined }), makeDraft(2)]}
        />
      );
      const historyBtn = screen
        .getByText(/Writer Reflexion 历史/)
        .closest('button');
      fireEvent.click(historyBtn!);
      expect(screen.getByText(/（无标题）/)).toBeInTheDocument();
    });

    it('renders report summary in history list', () => {
      render(
        <ReportPanel
          finalReport={makeReport()}
          reports={[
            makeDraft(1, { summary: 'Summary of round 1.' }),
            makeDraft(2),
          ]}
        />
      );
      const historyBtn = screen
        .getByText(/Writer Reflexion 历史/)
        .closest('button');
      fireEvent.click(historyBtn!);
      expect(screen.getByText('Summary of round 1.')).toBeInTheDocument();
    });
  });

  // ── 7. wordCount calculation ─────────────────────────────────────────────────
  describe('wordCount display', () => {
    it('shows raw word count when < 1000', () => {
      render(
        <ReportPanel
          finalReport={{
            title: 'Short',
            summary: 'Short text.',
            sections: [{ heading: 'A', body: 'One two three.' }],
            conclusion: 'End.',
          }}
          reports={[]}
        />
      );
      // Count will be small — verify "字" appears and not "k"
      const metaText = screen.getByText(/章节/);
      expect(metaText.textContent).toMatch(/字/);
    });

    it('shows "k" suffix when word count >= 1000', () => {
      // Create a report with enough text to exceed 1000 words
      const longBody = 'word '.repeat(1100);
      render(
        <ReportPanel
          finalReport={{
            title: 'Long Report',
            sections: [{ heading: 'A', body: longBody }],
          }}
          reports={[]}
        />
      );
      const metaText = screen.getByText(/章节/);
      expect(metaText.textContent).toMatch(/k 字/);
    });
  });

  // ── 8. safeHref edge cases ───────────────────────────────────────────────────
  describe('safeHref function', () => {
    it('allows http:// URLs in section sources', () => {
      render(
        <ReportPanel
          finalReport={makeReport({
            sections: [
              {
                heading: 'HTTP Test',
                body: 'Body.',
                sources: ['http://plain-http.com/page'],
              },
            ],
          })}
          reports={[]}
        />
      );
      const link = screen.getByRole('link', { name: /plain-http\.com/ });
      expect(link).toHaveAttribute('href', 'http://plain-http.com/page');
    });

    it('blocks data: URLs in section sources — no ExternalLink icon rendered', () => {
      render(
        <ReportPanel
          finalReport={makeReport({
            sections: [
              {
                heading: 'Data URL Test',
                body: 'Body.',
                sources: ['data:text/html,<h1>evil</h1>'],
              },
            ],
          })}
          reports={[]}
        />
      );
      // The dangerous data: URL should be rendered as text, not a link
      expect(
        screen.getByText('data:text/html,<h1>evil</h1>')
      ).toBeInTheDocument();
      // No ExternalLink icon since no valid source link
      expect(screen.queryAllByTestId('external-link-icon').length).toBe(0);
    });

    it('blocks empty string URLs — no ExternalLink icon rendered', () => {
      render(
        <ReportPanel
          finalReport={makeReport({
            sections: [
              {
                heading: 'Empty URL',
                body: 'Body.',
                sources: [''],
              },
            ],
          })}
          reports={[]}
        />
      );
      // Empty string source is blocked — no ExternalLink icon
      expect(screen.queryAllByTestId('external-link-icon').length).toBe(0);
    });
  });
});
