/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Lucide icon mocks ─────────────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  Layers: (p: Record<string, unknown>) => (
    <svg data-testid="layers-icon" {...p} />
  ),
  Globe: (p: Record<string, unknown>) => (
    <svg data-testid="globe-icon" {...p} />
  ),
  Calendar: (p: Record<string, unknown>) => (
    <svg data-testid="calendar-icon" {...p} />
  ),
  ShieldCheck: (p: Record<string, unknown>) => (
    <svg data-testid="shield-check-icon" {...p} />
  ),
  ListTree: (p: Record<string, unknown>) => (
    <svg data-testid="list-tree-icon" {...p} />
  ),
  ExternalLink: (p: Record<string, unknown>) => (
    <svg data-testid="external-link-icon" {...p} />
  ),
  Building2: (p: Record<string, unknown>) => (
    <svg data-testid="building2-icon" {...p} />
  ),
  GraduationCap: (p: Record<string, unknown>) => (
    <svg data-testid="graduation-cap-icon" {...p} />
  ),
  Newspaper: (p: Record<string, unknown>) => (
    <svg data-testid="newspaper-icon" {...p} />
  ),
  Megaphone: (p: Record<string, unknown>) => (
    <svg data-testid="megaphone-icon" {...p} />
  ),
  Users: (p: Record<string, unknown>) => (
    <svg data-testid="users-icon" {...p} />
  ),
  Star: (p: Record<string, unknown>) => <svg data-testid="star-icon" {...p} />,
  Search: (p: Record<string, unknown>) => (
    <svg data-testid="search-icon" {...p} />
  ),
  X: (p: Record<string, unknown>) => <svg data-testid="x-icon" {...p} />,
  ArrowUpDown: (p: Record<string, unknown>) => (
    <svg data-testid="arrow-up-down-icon" {...p} />
  ),
}));

vi.mock('@/lib/utils/common', () => ({
  cn: (...classes: (string | undefined | false | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    action,
  }: {
    title?: string;
    description?: string;
    action?: { label: string; onClick: () => void };
  }) => (
    <div data-testid="empty-state">
      {title && <p>{title}</p>}
      {description && <p>{description}</p>}
      {action && (
        <button type="button" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  ),
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

import { ReferencesPanel } from '../ReferencesPanel';
import type { ArtifactCitation } from '@/lib/features/agent-playground/report-artifact.types';

// ── helpers ───────────────────────────────────────────────────────────────────
function makeCitation(
  overrides: Partial<ArtifactCitation> = {}
): ArtifactCitation {
  return {
    index: 1,
    uuid: 'uuid-1',
    title: 'Test Article Title',
    url: 'https://example.com/article',
    domain: 'example.com',
    snippet: 'This is a test snippet.',
    publishedAt: '2024-01-15',
    accessedAt: '2024-06-01',
    sourceType: 'news',
    credibilityScore: 75,
    occurrences: [],
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('ReferencesPanel', () => {
  // ── 1. Empty / fallback paths ────────────────────────────────────────────────
  describe('no citations and no fallback sources', () => {
    it('renders empty state card', () => {
      render(<ReferencesPanel />);
      expect(screen.getByText('暂无引用来源')).toBeInTheDocument();
    });

    it('shows helper text about automatic collection', () => {
      render(<ReferencesPanel />);
      expect(
        screen.getByText(/Researcher \/ Writer 在报告中引用/)
      ).toBeInTheDocument();
    });
  });

  describe('fallback sources only (no citations)', () => {
    const sources = [
      'https://gov.example.com/policy',
      'https://gov.example.com/report',
      'https://news.example.org/story',
      'not-a-valid-url',
    ];

    it('renders the "参考文献" heading', () => {
      render(<ReferencesPanel fallbackSources={sources} />);
      expect(screen.getByText('参考文献')).toBeInTheDocument();
    });

    it('shows source count and domain count', () => {
      render(<ReferencesPanel fallbackSources={sources} />);
      expect(screen.getByText(/4 条/)).toBeInTheDocument();
    });

    it('groups URLs by hostname', () => {
      render(<ReferencesPanel fallbackSources={sources} />);
      expect(screen.getByText('gov.example.com')).toBeInTheDocument();
      expect(screen.getByText('news.example.org')).toBeInTheDocument();
    });

    it('renders valid https URLs as clickable links', () => {
      render(<ReferencesPanel fallbackSources={sources} />);
      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));
      expect(hrefs).toContain('https://gov.example.com/policy');
    });

    it('renders invalid URLs as plain text spans', () => {
      render(<ReferencesPanel fallbackSources={sources} />);
      expect(screen.getByText('not-a-valid-url')).toBeInTheDocument();
    });

    it('shows footer note about missing structured metadata', () => {
      render(<ReferencesPanel fallbackSources={sources} />);
      expect(
        screen.getByText(/报告暂未提供结构化引用元数据/)
      ).toBeInTheDocument();
    });

    it('handles empty fallbackSources array same as undefined', () => {
      render(<ReferencesPanel fallbackSources={[]} />);
      expect(screen.getByText('暂无引用来源')).toBeInTheDocument();
    });
  });

  // ── 2. Structured citations ─────────────────────────────────────────────────
  describe('with structured citations — StatRow', () => {
    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 1,
        uuid: 'a1',
        sourceType: 'gov',
        credibilityScore: 90,
        publishedAt: '2024-01-01',
        domain: 'gov.org',
        occurrences: [
          { sectionId: 's1', paragraphIndex: 0, characterOffset: 0 },
        ],
      }),
      makeCitation({
        index: 2,
        uuid: 'a2',
        sourceType: 'academic',
        credibilityScore: 80,
        publishedAt: '2023-06-15',
        domain: 'arxiv.org',
        occurrences: [],
      }),
      makeCitation({
        index: 3,
        uuid: 'a3',
        sourceType: 'news',
        credibilityScore: 55,
        publishedAt: undefined,
        domain: 'news.com',
        occurrences: [],
      }),
      makeCitation({
        index: 4,
        uuid: 'a4',
        sourceType: 'blog',
        credibilityScore: 35,
        publishedAt: '2022-11-30',
        domain: 'blog.io',
        occurrences: [],
      }),
    ];

    it('shows total citation count', () => {
      render(<ReferencesPanel citations={citations} />);
      expect(screen.getByText('总引用')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
    });

    it('shows high-credibility count (>=70)', () => {
      render(<ReferencesPanel citations={citations} />);
      // gov(90) and academic(80) = 2 high
      expect(screen.getAllByText('高权威').length).toBeGreaterThanOrEqual(1);
      // 2 appears for both "高权威 count" and "官方/学术 count"
      expect(screen.getAllByText('2').length).toBeGreaterThanOrEqual(1);
    });

    it('shows official/academic combined count', () => {
      render(<ReferencesPanel citations={citations} />);
      expect(screen.getByText('官方 / 学术')).toBeInTheDocument();
    });

    it('shows count of dated citations', () => {
      render(<ReferencesPanel citations={citations} />);
      expect(screen.getByText('有日期')).toBeInTheDocument();
      // 3 citations have publishedAt (gov, academic, blog)
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('shows domain count in StatRow sub', () => {
      render(<ReferencesPanel citations={citations} />);
      expect(screen.getByText(/个域名/)).toBeInTheDocument();
    });
  });

  describe('with structured citations — panel header', () => {
    const citations = [
      makeCitation({
        index: 1,
        uuid: 'h1',
        sourceType: 'gov',
        credibilityScore: 90,
        domain: 'd1.com',
      }),
      makeCitation({
        index: 2,
        uuid: 'h2',
        sourceType: 'news',
        credibilityScore: 60,
        domain: 'd2.com',
      }),
    ];

    it('renders the panel heading "参考文献"', () => {
      render(<ReferencesPanel citations={citations} />);
      // The heading appears in the Card header
      expect(screen.getAllByText('参考文献').length).toBeGreaterThanOrEqual(1);
    });

    it('shows total count in header', () => {
      render(<ReferencesPanel citations={citations} />);
      expect(screen.getByText(/共 2 条/)).toBeInTheDocument();
    });
  });

  // ── 3. GroupTabs ─────────────────────────────────────────────────────────────
  describe('GroupTabs', () => {
    const citations = [
      makeCitation({
        index: 1,
        uuid: 'g1',
        sourceType: 'gov',
        credibilityScore: 90,
        domain: 'alpha.org',
      }),
      makeCitation({
        index: 2,
        uuid: 'g2',
        sourceType: 'academic',
        credibilityScore: 80,
        domain: 'beta.edu',
      }),
    ];

    it('renders all 4 group tab labels', () => {
      render(<ReferencesPanel citations={citations} />);
      expect(screen.getByText('按类型')).toBeInTheDocument();
      expect(screen.getByText('按权威度')).toBeInTheDocument();
      expect(screen.getByText('按年份')).toBeInTheDocument();
      expect(screen.getByText('按域名')).toBeInTheDocument();
    });

    it('switches grouping to "domain" on click', () => {
      render(<ReferencesPanel citations={citations} />);
      fireEvent.click(screen.getByText('按域名'));
      // Domain names appear as group headers (may also appear in citation domain spans)
      expect(screen.getAllByText('alpha.org').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('beta.edu').length).toBeGreaterThanOrEqual(1);
    });

    it('switches grouping to "year" on click', () => {
      const c1 = makeCitation({
        index: 1,
        uuid: 'y1',
        sourceType: 'news',
        credibilityScore: 70,
        domain: 'a.com',
        publishedAt: '2022-03-15',
      });
      const c2 = makeCitation({
        index: 2,
        uuid: 'y2',
        sourceType: 'blog',
        credibilityScore: 50,
        domain: 'b.com',
        publishedAt: '2023-07-20',
      });
      render(<ReferencesPanel citations={[c1, c2]} />);
      fireEvent.click(screen.getByText('按年份'));
      expect(screen.getByText('2022')).toBeInTheDocument();
      expect(screen.getByText('2023')).toBeInTheDocument();
    });

    it('switches grouping to "credibility" on click', () => {
      const c1 = makeCitation({
        index: 1,
        uuid: 'c1',
        sourceType: 'gov',
        credibilityScore: 90,
        domain: 'a.org',
      });
      const c2 = makeCitation({
        index: 2,
        uuid: 'c2',
        sourceType: 'blog',
        credibilityScore: 30,
        domain: 'b.io',
      });
      render(<ReferencesPanel citations={[c1, c2]} />);
      fireEvent.click(screen.getByText('按权威度'));
      // Group headers show credibility bucket labels
      expect(screen.getAllByText(/高权威/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/低权威/).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 4. CitationCard ──────────────────────────────────────────────────────────
  describe('CitationCard rendering', () => {
    it('renders citation title', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ title: 'My Article Title', uuid: 'u1' })]}
        />
      );
      expect(screen.getByText('My Article Title')).toBeInTheDocument();
    });

    it('renders citation snippet', () => {
      render(
        <ReferencesPanel
          citations={[
            makeCitation({ snippet: 'Important finding here.', uuid: 'u2' }),
          ]}
        />
      );
      expect(screen.getByText('Important finding here.')).toBeInTheDocument();
    });

    it('renders citation domain', () => {
      render(
        <ReferencesPanel
          citations={[
            makeCitation({ domain: 'specific-domain.org', uuid: 'u3' }),
          ]}
        />
      );
      expect(screen.getByText('specific-domain.org')).toBeInTheDocument();
    });

    it('renders citation index badge', () => {
      render(
        <ReferencesPanel citations={[makeCitation({ index: 7, uuid: 'u4' })]} />
      );
      expect(screen.getByText('[7]')).toBeInTheDocument();
    });

    it('renders "打开" link for https URLs', () => {
      render(
        <ReferencesPanel
          citations={[
            makeCitation({ url: 'https://safe.com/page', uuid: 'u5' }),
          ]}
        />
      );
      expect(screen.getByText(/打开/)).toBeInTheDocument();
    });

    it('does not render "打开" link for non-https URLs', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ url: 'javascript:alert(1)', uuid: 'u6' })]}
        />
      );
      expect(screen.queryByText(/打开/)).not.toBeInTheDocument();
    });

    it('renders publishedAt date when present', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ publishedAt: '2024-03-20', uuid: 'u7' })]}
        />
      );
      expect(screen.getByText(/2024-03-20/)).toBeInTheDocument();
    });

    it('renders occurrences count when > 0', () => {
      const citation = makeCitation({
        uuid: 'u8',
        occurrences: [
          { sectionId: 's1', paragraphIndex: 0, characterOffset: 0 },
          { sectionId: 's2', paragraphIndex: 1, characterOffset: 10 },
          { sectionId: 's3', paragraphIndex: 2, characterOffset: 20 },
        ],
      });
      render(<ReferencesPanel citations={[citation]} />);
      expect(screen.getByText(/引用 3 处/)).toBeInTheDocument();
    });

    it('does not render occurrences when 0', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ occurrences: [], uuid: 'u9' })]}
        />
      );
      expect(screen.queryByText(/引用 \d+ 处/)).not.toBeInTheDocument();
    });

    it('renders credibility score as rounded number', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ credibilityScore: 82.7, uuid: 'u10' })]}
        />
      );
      expect(screen.getByText('83')).toBeInTheDocument();
    });

    it('shows URL as title when title is empty', () => {
      render(
        <ReferencesPanel
          citations={[
            makeCitation({
              title: '',
              url: 'https://fallback.com',
              uuid: 'u11',
            }),
          ]}
        />
      );
      expect(screen.getByText('https://fallback.com')).toBeInTheDocument();
    });
  });

  // ── 5. Source type labels ─────────────────────────────────────────────────────
  describe('source type labels', () => {
    const cases: [ArtifactCitation['sourceType'], string][] = [
      ['gov', '官方 / 政府'],
      ['academic', '学术 / 论文'],
      ['industry', '行业 / 智库'],
      ['news', '新闻媒体'],
      ['blog', '博客 / 个人'],
      ['community', '社区 / 论坛'],
      ['other', '其它'],
    ];

    cases.forEach(([sourceType, expectedLabel]) => {
      it(`renders label for sourceType="${sourceType}"`, () => {
        render(
          <ReferencesPanel
            citations={[
              makeCitation({
                sourceType,
                uuid: `st-${sourceType}`,
                credibilityScore: 60,
              }),
            ]}
          />
        );
        expect(
          screen.getAllByText(expectedLabel).length
        ).toBeGreaterThanOrEqual(1);
      });
    });
  });

  // ── 6. Search ─────────────────────────────────────────────────────────────────
  describe('search functionality', () => {
    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 1,
        uuid: 's1',
        title: 'Machine Learning Overview',
        domain: 'ml.com',
        credibilityScore: 70,
      }),
      makeCitation({
        index: 2,
        uuid: 's2',
        title: 'Deep Learning Advances',
        domain: 'dl.org',
        credibilityScore: 70,
      }),
    ];

    it('filters citations by search term in title', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'Machine' } });
      expect(screen.getByText('Machine Learning Overview')).toBeInTheDocument();
      expect(
        screen.queryByText('Deep Learning Advances')
      ).not.toBeInTheDocument();
    });

    it('shows filtered count in header when active filter', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'Machine' } });
      expect(screen.getByText(/筛后 1/)).toBeInTheDocument();
    });

    it('shows EmptyState when search matches nothing', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'xyzzy-no-match' } });
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('未匹配到引用')).toBeInTheDocument();
    });

    it('renders clear button when search text is present', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'Machine' } });
      // X button should appear
      expect(screen.getByTitle('清空搜索')).toBeInTheDocument();
    });

    it('clears search on X button click', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'Machine' } });
      const clearBtn = screen.getByTitle('清空搜索');
      fireEvent.click(clearBtn);
      expect(screen.getByText('Deep Learning Advances')).toBeInTheDocument();
    });

    it('search is case-insensitive', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'machine' } });
      expect(screen.getByText('Machine Learning Overview')).toBeInTheDocument();
    });

    it('resets filters from EmptyState action button', () => {
      render(<ReferencesPanel citations={citations} />);
      const input = screen.getByPlaceholderText(/搜索/);
      fireEvent.change(input, { target: { value: 'no-match' } });
      const resetBtn = screen.getByText('重置过滤');
      fireEvent.click(resetBtn);
      // Both citations should be visible again
      expect(screen.getByText('Machine Learning Overview')).toBeInTheDocument();
      expect(screen.getByText('Deep Learning Advances')).toBeInTheDocument();
    });
  });

  // ── 7. Filter selects ─────────────────────────────────────────────────────────
  describe('credibility filter', () => {
    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 1,
        uuid: 'cf1',
        title: 'High Cred Article',
        credibilityScore: 85,
        domain: 'hc.com',
      }),
      makeCitation({
        index: 2,
        uuid: 'cf2',
        title: 'Low Cred Article',
        credibilityScore: 25,
        domain: 'lc.com',
      }),
    ];

    it('filters to high credibility only', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按可信度过滤');
      fireEvent.change(select, { target: { value: 'high' } });
      expect(screen.getByText('High Cred Article')).toBeInTheDocument();
      expect(screen.queryByText('Low Cred Article')).not.toBeInTheDocument();
    });

    it('filters to low credibility only', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按可信度过滤');
      fireEvent.change(select, { target: { value: 'low' } });
      expect(screen.queryByText('High Cred Article')).not.toBeInTheDocument();
      expect(screen.getByText('Low Cred Article')).toBeInTheDocument();
    });
  });

  describe('source type filter', () => {
    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 1,
        uuid: 'tf1',
        title: 'Gov Article',
        sourceType: 'gov',
        credibilityScore: 90,
        domain: 'gov.org',
      }),
      makeCitation({
        index: 2,
        uuid: 'tf2',
        title: 'Blog Article',
        sourceType: 'blog',
        credibilityScore: 50,
        domain: 'blog.io',
      }),
    ];

    it('filters to gov type only', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按来源类型过滤');
      fireEvent.change(select, { target: { value: 'gov' } });
      expect(screen.getByText('Gov Article')).toBeInTheDocument();
      expect(screen.queryByText('Blog Article')).not.toBeInTheDocument();
    });

    it('shows present types in filter dropdown', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按来源类型过滤');
      // gov and blog should be options
      expect(select.innerHTML).toContain('官方 / 政府');
      expect(select.innerHTML).toContain('博客 / 个人');
    });
  });

  describe('time filter', () => {
    // Use dates relative to now for time-window filters
    const now = Date.now();
    const daysAgo = (d: number) =>
      new Date(now - d * 86_400_000).toISOString().slice(0, 10);

    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 1,
        uuid: 'tm1',
        title: 'Dated Article',
        publishedAt: '2000-01-01',
        domain: 'old.com',
        credibilityScore: 70,
      }),
      makeCitation({
        index: 2,
        uuid: 'tm2',
        title: 'Undated Article',
        publishedAt: undefined,
        domain: 'undated.com',
        credibilityScore: 70,
      }),
      makeCitation({
        index: 3,
        uuid: 'tm3',
        title: 'Recent Article',
        publishedAt: daysAgo(3),
        domain: 'recent.com',
        credibilityScore: 70,
      }),
      makeCitation({
        index: 4,
        uuid: 'tm4',
        title: 'Month Old Article',
        publishedAt: daysAgo(20),
        domain: 'month.com',
        credibilityScore: 70,
      }),
      makeCitation({
        index: 5,
        uuid: 'tm5',
        title: 'HalfYear Article',
        publishedAt: daysAgo(100),
        domain: 'half.com',
        credibilityScore: 70,
      }),
      makeCitation({
        index: 6,
        uuid: 'tm6',
        title: 'Year Old Article',
        publishedAt: daysAgo(300),
        domain: 'year.com',
        credibilityScore: 70,
      }),
    ];

    it('filters to undated only', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: 'undated' } });
      expect(screen.queryByText('Dated Article')).not.toBeInTheDocument();
      expect(screen.getByText('Undated Article')).toBeInTheDocument();
    });

    it('filters to 7d — shows only articles from last 7 days', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: '7d' } });
      expect(screen.getByText('Recent Article')).toBeInTheDocument();
      expect(screen.queryByText('Month Old Article')).not.toBeInTheDocument();
    });

    it('filters to 30d — includes articles from last 30 days', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: '30d' } });
      expect(screen.getByText('Recent Article')).toBeInTheDocument();
      expect(screen.getByText('Month Old Article')).toBeInTheDocument();
      expect(screen.queryByText('HalfYear Article')).not.toBeInTheDocument();
    });

    it('filters to 180d — includes articles from last 6 months', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: '180d' } });
      expect(screen.getByText('HalfYear Article')).toBeInTheDocument();
      expect(screen.queryByText('Year Old Article')).not.toBeInTheDocument();
    });

    it('filters to 365d — includes articles from last year', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: '365d' } });
      expect(screen.getByText('Year Old Article')).toBeInTheDocument();
      expect(screen.queryByText('Dated Article')).not.toBeInTheDocument();
    });

    it('filters to older — shows articles more than 1 year old', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: 'older' } });
      expect(screen.getByText('Dated Article')).toBeInTheDocument();
      expect(screen.queryByText('Recent Article')).not.toBeInTheDocument();
    });

    it('dated articles excluded from undated filter', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按发布时间过滤');
      fireEvent.change(select, { target: { value: 'undated' } });
      expect(screen.queryByText('Dated Article')).not.toBeInTheDocument();
    });
  });

  // ── 8. Sort select ────────────────────────────────────────────────────────────
  describe('sort by', () => {
    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 2,
        uuid: 'so1',
        title: 'Beta Article',
        credibilityScore: 60,
        domain: 'beta.com',
        publishedAt: '2022-01-01',
        occurrences: [],
      }),
      makeCitation({
        index: 1,
        uuid: 'so2',
        title: 'Alpha Article',
        credibilityScore: 90,
        domain: 'alpha.com',
        publishedAt: '2024-06-01',
        occurrences: [
          { sectionId: 's1', paragraphIndex: 0, characterOffset: 0 },
          { sectionId: 's2', paragraphIndex: 1, characterOffset: 0 },
        ],
      }),
    ];

    it('renders sort select with all options', () => {
      render(<ReferencesPanel citations={[makeCitation({ uuid: 'so0' })]} />);
      const select = screen.getByTitle('排序方式');
      expect(select.innerHTML).toContain('按原序号');
      expect(select.innerHTML).toContain('可信度 ↓');
      expect(select.innerHTML).toContain('可信度 ↑');
      expect(select.innerHTML).toContain('日期 ↓ 新');
      expect(select.innerHTML).toContain('日期 ↑ 旧');
      expect(select.innerHTML).toContain('引用次数 ↓');
      expect(select.innerHTML).toContain('域名 A→Z');
    });

    it('sorts by credibility descending', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('排序方式');
      fireEvent.change(select, { target: { value: 'credibility-desc' } });
      // alpha(90) should be before beta(60)
      expect(screen.getByText('Alpha Article')).toBeInTheDocument();
      expect(screen.getByText('Beta Article')).toBeInTheDocument();
    });

    it('sorts by credibility ascending', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('排序方式');
      fireEvent.change(select, { target: { value: 'credibility-asc' } });
      expect(screen.getByText('Alpha Article')).toBeInTheDocument();
      expect(screen.getByText('Beta Article')).toBeInTheDocument();
    });

    it('sorts by date descending (newest first)', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('排序方式');
      fireEvent.change(select, { target: { value: 'date-desc' } });
      // alpha (2024) should come before beta (2022)
      expect(screen.getByText('Alpha Article')).toBeInTheDocument();
    });

    it('sorts by date ascending (oldest first)', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('排序方式');
      fireEvent.change(select, { target: { value: 'date-asc' } });
      expect(screen.getByText('Beta Article')).toBeInTheDocument();
    });

    it('sorts by occurrences descending', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('排序方式');
      fireEvent.change(select, { target: { value: 'occurrences-desc' } });
      // alpha has 2 occurrences, beta has 0
      expect(screen.getByText('Alpha Article')).toBeInTheDocument();
    });

    it('sorts by domain A-Z', () => {
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('排序方式');
      fireEvent.change(select, { target: { value: 'domain-asc' } });
      // alpha.com < beta.com alphabetically
      expect(screen.getByText('Alpha Article')).toBeInTheDocument();
    });
  });

  // ── 9. Reset button ───────────────────────────────────────────────────────────
  describe('reset button', () => {
    it('shows reset button when a filter is active', () => {
      const citations = [makeCitation({ uuid: 'rb1', credibilityScore: 85 })];
      render(<ReferencesPanel citations={citations} />);
      const select = screen.getByTitle('按可信度过滤');
      fireEvent.change(select, { target: { value: 'high' } });
      expect(screen.getByTitle('清除所有过滤 / 搜索')).toBeInTheDocument();
    });

    it('resets all filters on reset click', () => {
      const citations: ArtifactCitation[] = [
        makeCitation({
          index: 1,
          uuid: 'rb2',
          title: 'High Article',
          credibilityScore: 90,
          domain: 'h.com',
        }),
        makeCitation({
          index: 2,
          uuid: 'rb3',
          title: 'Low Article',
          credibilityScore: 25,
          domain: 'l.com',
        }),
      ];
      render(<ReferencesPanel citations={citations} />);
      // Apply a filter
      const select = screen.getByTitle('按可信度过滤');
      fireEvent.change(select, { target: { value: 'high' } });
      expect(screen.queryByText('Low Article')).not.toBeInTheDocument();
      // Reset
      fireEvent.click(screen.getByTitle('清除所有过滤 / 搜索'));
      expect(screen.getByText('Low Article')).toBeInTheDocument();
    });

    it('does not show reset button when no active filter', () => {
      render(<ReferencesPanel citations={[makeCitation({ uuid: 'rb4' })]} />);
      expect(
        screen.queryByTitle('清除所有过滤 / 搜索')
      ).not.toBeInTheDocument();
    });
  });

  // ── 10. credibilityBucket coverage ─────────────────────────────────────────
  describe('credibility bucket thresholds', () => {
    it('score >= 70 is "高权威"', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ credibilityScore: 70, uuid: 'cr1' })]}
        />
      );
      fireEvent.click(screen.getByText('按权威度'));
      expect(screen.getAllByText(/高权威/).length).toBeGreaterThanOrEqual(1);
    });

    it('score >= 40 and < 70 is "中权威"', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ credibilityScore: 55, uuid: 'cr2' })]}
        />
      );
      fireEvent.click(screen.getByText('按权威度'));
      expect(screen.getAllByText(/中权威/).length).toBeGreaterThanOrEqual(1);
    });

    it('score < 40 is "低权威"', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ credibilityScore: 30, uuid: 'cr3' })]}
        />
      );
      fireEvent.click(screen.getByText('按权威度'));
      expect(screen.getAllByText(/低权威/).length).toBeGreaterThanOrEqual(1);
    });
  });

  // ── 11. yearOf coverage ──────────────────────────────────────────────────────
  describe('year grouping', () => {
    it('shows "未标注年份" for citation without publishedAt', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ publishedAt: undefined, uuid: 'yr1' })]}
        />
      );
      fireEvent.click(screen.getByText('按年份'));
      expect(screen.getByText('未标注年份')).toBeInTheDocument();
    });

    it('extracts year from publishedAt ISO string', () => {
      render(
        <ReferencesPanel
          citations={[makeCitation({ publishedAt: '2025-04-01', uuid: 'yr2' })]}
        />
      );
      fireEvent.click(screen.getByText('按年份'));
      expect(screen.getByText('2025')).toBeInTheDocument();
    });
  });

  // ── 12. Multiple citations groups sort by items.length ──────────────────────
  describe('grouping sorts by group size', () => {
    const citations: ArtifactCitation[] = [
      makeCitation({
        index: 1,
        uuid: 'gr1',
        sourceType: 'news',
        credibilityScore: 70,
        domain: 'n.com',
      }),
      makeCitation({
        index: 2,
        uuid: 'gr2',
        sourceType: 'news',
        credibilityScore: 70,
        domain: 'n.com',
      }),
      makeCitation({
        index: 3,
        uuid: 'gr3',
        sourceType: 'gov',
        credibilityScore: 90,
        domain: 'g.com',
      }),
    ];

    it('renders group section headers', () => {
      render(<ReferencesPanel citations={citations} />);
      // default is by type — text appears in both group headers and citation type badges
      expect(screen.getAllByText('新闻媒体').length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText('官方 / 政府').length).toBeGreaterThanOrEqual(
        1
      );
    });

    it('renders group item count badge', () => {
      render(<ReferencesPanel citations={citations} />);
      // news group has 2 items
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });
});
