import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FactTablePanel } from '../FactTablePanel';
import type {
  ArtifactFactTriple,
  ArtifactCitation,
} from '@/lib/features/agent-playground/report-artifact.types';

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

function makeFact(
  id: string,
  overrides: Partial<ArtifactFactTriple> = {}
): ArtifactFactTriple {
  return {
    id,
    entity: `Entity ${id}`,
    attribute: `attr-${id}`,
    value: `Value ${id}`,
    sources: [1],
    ...overrides,
  };
}

function makeCitation(index: number, cred = 80): ArtifactCitation {
  return {
    index,
    uuid: `uuid-${index}`,
    title: `Source ${index}`,
    url: `https://example.com/${index}`,
    domain: 'example.com',
    sourceType: 'news',
    credibilityScore: cred,
    accessedAt: '2025-01-01',
    occurrences: [],
  };
}

describe('FactTablePanel', () => {
  it('renders null when factTable is empty', () => {
    const { container } = render(
      <FactTablePanel factTable={[]} citations={[]} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders panel header when factTable has items', () => {
    render(<FactTablePanel factTable={[makeFact('1')]} citations={[]} />);
    expect(screen.getByText(/事实表（1）/)).toBeInTheDocument();
  });

  it('shows conflict badge when conflicts exist', () => {
    const fact = makeFact('1', {
      conflict: {
        factIds: ['1'],
        resolutionType: 'preferred-one',
        rationale: 'r',
      },
    });
    render(<FactTablePanel factTable={[fact]} citations={[]} />);
    expect(screen.getByText(/1 项冲突/)).toBeInTheDocument();
  });

  it('table is collapsed by default', () => {
    render(<FactTablePanel factTable={[makeFact('1')]} citations={[]} />);
    expect(screen.queryByText('实体')).not.toBeInTheDocument();
  });

  it('clicking header toggles open', () => {
    render(<FactTablePanel factTable={[makeFact('1')]} citations={[]} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('实体')).toBeInTheDocument();
  });

  it('clicking header again closes panel and clears filter', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1'), makeFact('2')]}
        citations={[]}
      />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    // Type something in filter
    const searchInput = screen.getByPlaceholderText('搜实体 / 属性 / 值');
    fireEvent.change(searchInput, { target: { value: 'test' } });
    // Close by clicking the header button again
    fireEvent.click(headerBtn);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('shows data rows in table', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            entity: 'Apple',
            attribute: 'CEO',
            value: 'Tim Cook',
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Tim Cook')).toBeInTheDocument();
  });

  it('search filter narrows results', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            entity: 'Apple',
            attribute: 'CEO',
            value: 'Tim Cook',
          }),
          makeFact('2', {
            entity: 'Google',
            attribute: 'CEO',
            value: 'Sundar Pichai',
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('搜实体 / 属性 / 值');
    fireEvent.change(searchInput, { target: { value: 'Apple' } });
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
  });

  it('shows EmptyState when filter yields no results', () => {
    render(
      <FactTablePanel
        factTable={[makeFact('1', { entity: 'Apple' })]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('搜实体 / 属性 / 值');
    fireEvent.change(searchInput, { target: { value: 'ZZZNOMATCH' } });
    expect(screen.getByText('无匹配事实')).toBeInTheDocument();
  });

  it('showOnlyConflicts checkbox filters to conflicts only', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[
          makeFact('1', { entity: 'A' }),
          makeFact('2', {
            entity: 'B',
            conflict: {
              factIds: ['2'],
              resolutionType: 'preferred-one',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    // Only B (conflict) should be visible in the table body
    expect(screen.queryByText('A')).not.toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
  });

  it('sort by sources toggles sort', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[
          makeFact('1', { sources: [1] }),
          makeFact('2', { sources: [1, 2, 3] }),
        ]}
        citations={[]}
      />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'sources' } });
    // The sources Th should show a sort indicator
    const sourceTh = screen.getByTitle('点击按来源数排序');
    expect(sourceTh.textContent).toContain('▼');
  });

  it('sort by conflict', () => {
    const { container } = render(
      <FactTablePanel factTable={[makeFact('1')]} citations={[]} />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'conflict' } });
    const conflictTh = screen.getByTitle('点击优先显示冲突');
    expect(conflictTh.textContent).toContain('▼');
  });

  it('clicking 来源 table header sorts by sources', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1'), makeFact('2')]}
        citations={[]}
      />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const sourceTh = screen.getByTitle('点击按来源数排序');
    fireEvent.click(sourceTh);
    expect(sourceTh.textContent).toContain('▼');
    // Click again to toggle back
    fireEvent.click(sourceTh);
    expect(sourceTh.textContent).not.toContain('▼');
  });

  it('clicking 冲突 table header sorts by conflict', () => {
    const { container } = render(
      <FactTablePanel factTable={[makeFact('1')]} citations={[]} />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const conflictTh = screen.getByTitle('点击优先显示冲突');
    fireEvent.click(conflictTh);
    expect(conflictTh.textContent).toContain('▼');
    // Click again to toggle back
    fireEvent.click(conflictTh);
    expect(conflictTh.textContent).not.toContain('▼');
  });

  it('copy button exists and calls clipboard', () => {
    const { container } = render(
      <FactTablePanel factTable={[makeFact('1')]} citations={[]} />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const copyBtn = screen.getByTitle('复制为 TSV');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });

  it('shows multi-source fact stats', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', { sources: [1, 2] }),
          makeFact('2', { sources: [1] }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/1 条多源印证/)).toBeInTheDocument();
  });

  it('shows conflict count in stats', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'preferred-one',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/1 条冲突/)).toBeInTheDocument();
  });

  it('shows average credibility when citations match sources', () => {
    render(
      <FactTablePanel
        factTable={[makeFact('1', { sources: [1] })]}
        citations={[makeCitation(1, 90)]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText(/平均来源可信度 90\/100/)).toBeInTheDocument();
  });

  it('credibility >= 80 is emerald', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1', { sources: [1] })]}
        citations={[makeCitation(1, 80)]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(container.querySelector('.text-emerald-600')).toBeTruthy();
  });

  it('credibility 60-79 is amber', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1', { sources: [1] })]}
        citations={[makeCitation(1, 70)]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(container.querySelector('.text-amber-600')).toBeTruthy();
  });

  it('credibility < 60 is red', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1', { sources: [1] })]}
        citations={[makeCitation(1, 50)]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(container.querySelector('.text-red-600')).toBeTruthy();
  });

  it('numeric/percent value is bolded', () => {
    render(
      <FactTablePanel
        factTable={[makeFact('1', { value: '42.5%' })]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const bold = screen.getByText('42.5%');
    expect(bold.tagName).toBe('SPAN');
    expect(bold.className).toContain('font-semibold');
  });

  it('non-numeric value is plain text', () => {
    render(
      <FactTablePanel
        factTable={[makeFact('1', { value: 'regular text' })]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('regular text')).toBeInTheDocument();
  });

  it('conflict row with flagged-unresolved has red background', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'flagged-unresolved',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const tr = container.querySelector('tr.bg-red-50\\/60');
    expect(tr).toBeTruthy();
  });

  it('conflict row with kept-both has amber background', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'kept-both',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const tr = container.querySelector('tr.bg-amber-50\\/50');
    expect(tr).toBeTruthy();
  });

  it('conflict row with preferred-one has emerald background', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'preferred-one',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const tr = container.querySelector('tr.bg-emerald-50\\/40');
    expect(tr).toBeTruthy();
  });

  it('conflict cell shows "择一" for preferred-one', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'preferred-one',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('择一')).toBeInTheDocument();
  });

  it('conflict cell shows "两存" for kept-both', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'kept-both',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('两存')).toBeInTheDocument();
  });

  it('conflict cell shows "未决" for flagged-unresolved', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            conflict: {
              factIds: ['1'],
              resolutionType: 'flagged-unresolved',
              rationale: 'r',
            },
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('未决')).toBeInTheDocument();
  });

  it('shows filtered count in stats', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', { entity: 'Apple' }),
          makeFact('2', { entity: 'Google' }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('搜实体 / 属性 / 值');
    fireEvent.change(searchInput, { target: { value: 'Apple' } });
    expect(screen.getByText(/已过滤至 1 条/)).toBeInTheDocument();
  });

  it('source citation link uses url when found', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1', { sources: [1] })]}
        citations={[makeCitation(1)]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const link = container.querySelector('a[href="https://example.com/1"]');
    expect(link).toBeTruthy();
  });

  it('source citation link uses # when citation not found', () => {
    const { container } = render(
      <FactTablePanel
        factTable={[makeFact('1', { sources: [99] })]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const link = container.querySelector('a[href="#"]');
    expect(link).toBeTruthy();
  });

  it('sort by conflict with mixed conflict/non-conflict facts covers both ternary branches', () => {
    // a.conflict ? -1 : 1 — need facts with and without conflict for full branch coverage
    // Use 3+ items to ensure the comparator is called with all possible pairings
    const { container } = render(
      <FactTablePanel
        factTable={[
          makeFact('no-conflict-1', { entity: 'Alpha' }),
          makeFact('with-conflict', {
            entity: 'Beta',
            conflict: {
              factIds: ['with-conflict'],
              resolutionType: 'preferred-one',
              rationale: 'reason',
            },
          }),
          makeFact('no-conflict-2', { entity: 'Gamma' }),
        ]}
        citations={[]}
      />
    );
    const headerBtn =
      container.querySelector<HTMLButtonElement>('button.flex.w-full')!;
    fireEvent.click(headerBtn);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'conflict' } });
    // All three should be visible (comparator called with all pairings)
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('filter matches by attribute field', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', { entity: 'Apple', attribute: 'CEO', value: 'Tim' }),
          makeFact('2', { entity: 'Google', attribute: 'CTO', value: 'Sam' }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('搜实体 / 属性 / 值');
    fireEvent.change(searchInput, { target: { value: 'CEO' } });
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
  });

  it('filter matches by value field', () => {
    render(
      <FactTablePanel
        factTable={[
          makeFact('1', {
            entity: 'Apple',
            attribute: 'CEO',
            value: 'Tim Cook',
          }),
          makeFact('2', {
            entity: 'Google',
            attribute: 'CEO',
            value: 'Sundar',
          }),
        ]}
        citations={[]}
      />
    );
    fireEvent.click(screen.getByRole('button'));
    const searchInput = screen.getByPlaceholderText('搜实体 / 属性 / 值');
    fireEvent.change(searchInput, { target: { value: 'Tim Cook' } });
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.queryByText('Google')).not.toBeInTheDocument();
  });
});
