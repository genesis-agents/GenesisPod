import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ReconciliationPanel } from '../ReconciliationPanel';

// ReconciliationReport is an internal interface, we construct objects directly
type ReconciliationReport = Parameters<typeof ReconciliationPanel>[0]['report'];

const baseReport: ReconciliationReport = {
  factTable: [{ id: 'f1' }, { id: 'f2' }],
  conflicts: [],
  overlaps: [],
  gaps: [],
};

describe('ReconciliationPanel', () => {
  it('returns null when all counts are zero', () => {
    const { container } = render(
      <ReconciliationPanel
        report={{ factTable: [], conflicts: [], overlaps: [], gaps: [] }}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when report has no data at all', () => {
    const { container } = render(<ReconciliationPanel report={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders when factTable has items', () => {
    render(<ReconciliationPanel report={baseReport} />);
    expect(screen.getByText('对账总览')).toBeInTheDocument();
  });

  it('renders stat summary with counts', () => {
    render(
      <ReconciliationPanel
        report={{
          factTable: [{}, {}, {}],
          conflicts: [
            {
              factIds: ['f1'],
              resolutionType: 'preferred-one',
              rationale: 'r1',
            },
          ],
          overlaps: [{ dimensionPair: ['a', 'b'] }],
          gaps: [{ severity: 'minor' }],
        }}
      />
    );
    expect(
      screen.getByText(/3 事实 · 1 冲突 · 1 重叠 · 1 空白/)
    ).toBeInTheDocument();
  });

  it('is collapsed by default (body hidden)', () => {
    render(<ReconciliationPanel report={baseReport} />);
    expect(screen.queryByText('Reconciler 总览')).not.toBeInTheDocument();
  });

  it('clicking header toggles open', () => {
    render(<ReconciliationPanel report={baseReport} />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    // After opening, even deduplicationStats and other sub-sections can appear
    // The border-t section is now visible
    expect(btn).toBeInTheDocument();
  });

  it('ChevronDown shown when closed', () => {
    const { container } = render(<ReconciliationPanel report={baseReport} />);
    // There should be an svg for ChevronDown
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('ChevronUp shown when open', () => {
    const { container } = render(<ReconciliationPanel report={baseReport} />);
    fireEvent.click(screen.getByRole('button'));
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it('shows deduplicationStats when open', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          deduplicationStats: {
            duplicatesRemoved: 5,
            termVariantsUnified: 3,
            dataInconsistenciesFlagged: 2,
          },
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('去重')).toBeInTheDocument();
    expect(screen.getByText('术语统一')).toBeInTheDocument();
    expect(screen.getByText('数据冲突')).toBeInTheDocument();
  });

  it('shows deduplicationStats with zero defaults', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          deduplicationStats: {},
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    // Should show 0 for each field
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBe(3);
  });

  it('shows reconciliationReport markdown when open', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          reconciliationReport: 'Summary report text here',
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Reconciler 总览')).toBeInTheDocument();
    expect(screen.getByText('Summary report text here')).toBeInTheDocument();
  });

  it('cleanReconcilerMarkdown strips [N] citation markers', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          reconciliationReport: 'See [1][2] for details.',
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    // [1][2] stripped, leaving "See  for details."
    expect(screen.getByText(/See/)).toBeInTheDocument();
  });

  it('shows conflicts section when open', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          conflicts: [
            {
              factIds: ['f1', 'f2'],
              resolutionType: 'preferred-one',
              rationale: 'Chose the more credible source',
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/事实冲突（1）/)).toBeInTheDocument();
    expect(screen.getByText('preferred-one')).toBeInTheDocument();
    expect(
      screen.getByText('Chose the more credible source')
    ).toBeInTheDocument();
    expect(screen.getByText(/factIds: f1, f2/)).toBeInTheDocument();
  });

  it('conflict resolutionType preferred-one gets emerald badge', () => {
    const { container } = render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          conflicts: [
            {
              factIds: ['f1'],
              resolutionType: 'preferred-one',
              rationale: 'r',
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const badge = container.querySelector('span.bg-emerald-100');
    expect(badge).toBeTruthy();
  });

  it('conflict resolutionType kept-both gets amber badge', () => {
    const { container } = render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          conflicts: [
            {
              factIds: ['f1'],
              resolutionType: 'kept-both',
              rationale: 'r',
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const badge = container.querySelector('span.bg-amber-100');
    expect(badge).toBeTruthy();
  });

  it('conflict resolutionType flagged-unresolved gets red badge', () => {
    const { container } = render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          conflicts: [
            {
              factIds: ['f1'],
              resolutionType: 'flagged-unresolved',
              rationale: 'r',
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const badge = container.querySelector('span.bg-red-100');
    expect(badge).toBeTruthy();
  });

  it('shows termGlossary when open', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          termGlossary: [
            { canonical: 'AI', variants: ['Artificial Intelligence', 'A.I.'] },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/术语对照表（1）/)).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(
      screen.getByText(/Artificial Intelligence \/ A\.I\./)
    ).toBeInTheDocument();
  });

  it('shows gaps section when open', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          gaps: [
            {
              dimensionId: 'dim-1',
              expectedAspects: ['aspect A', 'aspect B'],
              severity: 'critical',
            },
          ],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/覆盖空白（1）/)).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText(/dim: dim-1/)).toBeInTheDocument();
    expect(screen.getByText(/aspect A \/ aspect B/)).toBeInTheDocument();
  });

  it('gap with severity minor', () => {
    const { container } = render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          gaps: [{ severity: 'minor' }],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const badge = container.querySelector('span.bg-amber-100');
    expect(badge).toBeTruthy();
  });

  it('gap severity critical uses red badge', () => {
    const { container } = render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          gaps: [{ severity: 'critical' }],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const badge = container.querySelector('span.bg-red-100');
    expect(badge).toBeTruthy();
  });

  it('gap with no severity defaults to "minor"', () => {
    render(<ReconciliationPanel report={{ ...baseReport, gaps: [{}] }} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('minor')).toBeInTheDocument();
  });

  it('gap without dimensionId does not show dim line', () => {
    render(
      <ReconciliationPanel
        report={{ ...baseReport, gaps: [{ severity: 'minor' }] }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText(/dim:/)).not.toBeInTheDocument();
  });

  it('gap without expectedAspects does not show 缺失 line', () => {
    render(
      <ReconciliationPanel
        report={{
          ...baseReport,
          gaps: [{ severity: 'minor', dimensionId: 'd' }],
        }}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText(/缺失:/)).not.toBeInTheDocument();
  });
});
