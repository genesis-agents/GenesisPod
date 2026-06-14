/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  Layers: (props: Record<string, unknown>) => (
    <svg data-testid="layers-icon" {...props} />
  ),
  ChevronDown: (props: Record<string, unknown>) => (
    <svg data-testid="chevron-down" {...props} />
  ),
  ChevronRight: (props: Record<string, unknown>) => (
    <svg data-testid="chevron-right" {...props} />
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
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  ExpandableText: ({
    text,
    maxChars,
  }: {
    text: string;
    maxChars: number;
    className?: string;
  }) => (
    <span data-testid="expandable-text" data-max-chars={maxChars}>
      {text}
    </span>
  ),
}));

import { DimensionsPanel } from '../DimensionsPanel';
import type { MissionState } from '@/lib/features/agent-playground/mission-presentation.types';

function buildMission(overrides: Partial<MissionState> = {}): MissionState {
  return {
    dimensions: [],
    themeSummary: undefined,
    ...overrides,
  };
}

describe('DimensionsPanel', () => {
  describe('empty state', () => {
    it('shows waiting message when no themeSummary and no dimensions', () => {
      render(<DimensionsPanel mission={buildMission()} />);
      expect(
        screen.getByText(/等 Leader 产出 theme summary 和维度规划/)
      ).toBeInTheDocument();
    });

    it('still shows panel header in empty state', () => {
      render(<DimensionsPanel mission={buildMission()} />);
      expect(
        screen.getByText('研究维度（Research Dimensions）')
      ).toBeInTheDocument();
    });
  });

  describe('with themeSummary only', () => {
    it('renders themeSummary in violet block', () => {
      render(
        <DimensionsPanel
          mission={buildMission({
            themeSummary: 'This is the main theme summary.',
          })}
        />
      );
      expect(screen.getByText('主题摘要')).toBeInTheDocument();
      expect(
        screen.getByText('This is the main theme summary.')
      ).toBeInTheDocument();
    });

    it('does not show dimension count badge when no dims', () => {
      render(
        <DimensionsPanel
          mission={buildMission({ themeSummary: 'Summary here' })}
        />
      );
      // The "· N" span is only shown when dims.length > 0
      expect(screen.queryByText('· 0')).not.toBeInTheDocument();
    });
  });

  describe('with dimensions', () => {
    const dims = [
      { id: 'dim-1', name: 'Dimension A', rationale: 'Rationale for A' },
      { id: 'dim-2', name: 'Dimension B', rationale: 'Rationale for B' },
    ];

    it('renders dimension count badge', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      expect(screen.getByText('· 2')).toBeInTheDocument();
    });

    it('renders dimension names', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      expect(screen.getByText('Dimension A')).toBeInTheDocument();
      expect(screen.getByText('Dimension B')).toBeInTheDocument();
    });

    it('shows numbered badges 1 and 2', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows toggle button (全部展开)', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      expect(
        screen.getByRole('button', { name: '全部展开' })
      ).toBeInTheDocument();
    });

    it('shows "展开" text on each dimension row initially', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      const expandTexts = screen.getAllByText('展开');
      expect(expandTexts).toHaveLength(2);
    });

    it('shows rationale preview in collapsed state', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      // rationale is shown as clamp-1 when collapsed
      expect(screen.getByText('Rationale for A')).toBeInTheDocument();
    });
  });

  describe('expand/collapse single dimension', () => {
    const dims = [
      { id: 'dim-1', name: 'Dimension A', rationale: 'Rationale for A' },
    ];

    it('opens dimension detail when clicked', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      // Find the dimension row button
      const dimButton = screen.getByText('Dimension A').closest('button');
      expect(dimButton).not.toBeNull();
      fireEvent.click(dimButton!);
      expect(screen.getByText('维度立项理由')).toBeInTheDocument();
      expect(screen.getByText('收起')).toBeInTheDocument();
    });

    it('closes dimension detail when clicked again', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      const dimButton = screen.getByText('Dimension A').closest('button');
      fireEvent.click(dimButton!);
      expect(screen.getByText('维度立项理由')).toBeInTheDocument();
      fireEvent.click(dimButton!);
      expect(screen.queryByText('维度立项理由')).not.toBeInTheDocument();
    });

    it('shows ChevronDown icon when expanded', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      const dimButton = screen.getByText('Dimension A').closest('button');
      fireEvent.click(dimButton!);
      expect(screen.getByTestId('chevron-down')).toBeInTheDocument();
    });
  });

  describe('toggleAll', () => {
    const dims = [
      { id: 'd1', name: 'Dim 1', rationale: 'Rationale 1' },
      { id: 'd2', name: 'Dim 2', rationale: 'Rationale 2' },
    ];

    it('expands all dimensions when 全部展开 clicked', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      fireEvent.click(screen.getByRole('button', { name: '全部展开' }));
      const rationaleHeaders = screen.getAllByText('维度立项理由');
      expect(rationaleHeaders).toHaveLength(2);
    });

    it('shows 全部收起 after expanding all', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      fireEvent.click(screen.getByRole('button', { name: '全部展开' }));
      expect(
        screen.getByRole('button', { name: '全部收起' })
      ).toBeInTheDocument();
    });

    it('collapses all dimensions when 全部收起 clicked', () => {
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      fireEvent.click(screen.getByRole('button', { name: '全部展开' }));
      fireEvent.click(screen.getByRole('button', { name: '全部收起' }));
      expect(screen.queryByText('维度立项理由')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: '全部展开' })
      ).toBeInTheDocument();
    });
  });

  describe('dimension without rationale', () => {
    it('does not show rationale detail panel when rationale is empty', () => {
      const dims = [{ id: 'dim-1', name: 'No Rationale Dim', rationale: '' }];
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      const dimButton = screen.getByText('No Rationale Dim').closest('button');
      fireEvent.click(dimButton!);
      expect(screen.queryByText('维度立项理由')).not.toBeInTheDocument();
    });
  });

  describe('dimension with id vs name as key', () => {
    it('uses name as key when id is not present', () => {
      const dims = [
        { id: '', name: 'NameKey Dim', rationale: 'Some rationale' },
      ];
      render(<DimensionsPanel mission={buildMission({ dimensions: dims })} />);
      expect(screen.getByText('NameKey Dim')).toBeInTheDocument();
    });
  });

  describe('themeSummary + dimensions', () => {
    it('renders both themeSummary and dimension list', () => {
      render(
        <DimensionsPanel
          mission={buildMission({
            themeSummary: 'Global theme',
            dimensions: [{ id: 'dim-1', name: 'Dim 1', rationale: 'R1' }],
          })}
        />
      );
      expect(screen.getByText('主题摘要')).toBeInTheDocument();
      expect(screen.getByText('Global theme')).toBeInTheDocument();
      expect(screen.getByText('Dim 1')).toBeInTheDocument();
    });
  });
});
