import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToolRecallTrace } from '../ToolRecallTrace';

const makeEntry = (
  agentId: string,
  overrides: Partial<{
    role: string;
    recalledIds: string[];
    categories: string[];
    source: string;
    preferIds: string[];
  }> = {}
) => ({
  agentId,
  role: overrides.role ?? 'researcher',
  recalledIds: overrides.recalledIds ?? ['web-search', 'arxiv-search'],
  categories: overrides.categories ?? ['web'],
  source: overrides.source ?? 'tool-recall',
  preferIds: overrides.preferIds,
});

describe('ToolRecallTrace', () => {
  it('renders null when entries is empty', () => {
    const { container } = render(<ToolRecallTrace entries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders section heading when entries present', () => {
    render(<ToolRecallTrace entries={[makeEntry('agent-1')]} />);
    expect(screen.getByText(/工具召回轨迹/)).toBeInTheDocument();
  });

  it('shows stage count in heading', () => {
    render(
      <ToolRecallTrace entries={[makeEntry('agent-1'), makeEntry('agent-2')]} />
    );
    expect(screen.getByText(/2 stage/)).toBeInTheDocument();
  });

  it('deduplicates by agentId (keeps last)', () => {
    const entries = [
      makeEntry('agent-1', { source: 'first' }),
      makeEntry('agent-1', { source: 'last' }),
    ];
    render(<ToolRecallTrace entries={entries} />);
    // Should show 1 stage (deduped)
    expect(screen.getByText(/1 stage/)).toBeInTheDocument();
    expect(screen.getByText('last')).toBeInTheDocument();
    expect(screen.queryByText('first')).not.toBeInTheDocument();
  });

  it('shows agentId and role', () => {
    render(
      <ToolRecallTrace
        entries={[makeEntry('researcher-42', { role: 'researcher' })]}
      />
    );
    expect(screen.getByText('researcher-42')).toBeInTheDocument();
    expect(screen.getByText('researcher')).toBeInTheDocument();
  });

  it('shows source chip', () => {
    render(
      <ToolRecallTrace
        entries={[makeEntry('agent-1', { source: 'heuristic' })]}
      />
    );
    expect(screen.getByText('heuristic')).toBeInTheDocument();
  });

  it('shows categories when present', () => {
    render(
      <ToolRecallTrace
        entries={[makeEntry('agent-1', { categories: ['academic', 'web'] })]}
      />
    );
    expect(screen.getByText(/academic, web/)).toBeInTheDocument();
  });

  it('does not show category line when categories is empty', () => {
    render(
      <ToolRecallTrace entries={[makeEntry('agent-1', { categories: [] })]} />
    );
    expect(screen.queryByText(/category:/)).not.toBeInTheDocument();
  });

  it('renders recalledIds as chips', () => {
    render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', { recalledIds: ['web-search', 'arxiv'] }),
        ]}
      />
    );
    expect(screen.getByText('web-search')).toBeInTheDocument();
    expect(screen.getByText('arxiv')).toBeInTheDocument();
  });

  it('preferred ids show star prefix', () => {
    render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', {
            recalledIds: ['web-search', 'arxiv'],
            preferIds: ['web-search'],
          }),
        ]}
      />
    );
    expect(screen.getByText(/★ web-search/)).toBeInTheDocument();
  });

  it('non-preferred ids do not have star prefix', () => {
    render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', {
            recalledIds: ['arxiv'],
            preferIds: ['web-search'],
          }),
        ]}
      />
    );
    expect(screen.queryByText(/★ arxiv/)).not.toBeInTheDocument();
    expect(screen.getByText('arxiv')).toBeInTheDocument();
  });

  it('preferred ids have amber styling', () => {
    const { container } = render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', {
            recalledIds: ['web-search'],
            preferIds: ['web-search'],
          }),
        ]}
      />
    );
    const preferredSpan = container.querySelector('span.bg-amber-100');
    expect(preferredSpan).toBeTruthy();
  });

  it('non-preferred ids have blue styling', () => {
    const { container } = render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', {
            recalledIds: ['arxiv'],
            preferIds: [],
          }),
        ]}
      />
    );
    const normalSpan = container.querySelector('span.bg-blue-100');
    expect(normalSpan).toBeTruthy();
  });

  it('entry without preferIds defaults to blue styling', () => {
    const { container } = render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', {
            recalledIds: ['web-search'],
            preferIds: undefined,
          }),
        ]}
      />
    );
    const blueSpan = container.querySelector('span.bg-blue-100');
    expect(blueSpan).toBeTruthy();
  });

  it('preferred id title attribute shows "recommended"', () => {
    const { container } = render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-1', {
            recalledIds: ['web-search'],
            preferIds: ['web-search'],
          }),
        ]}
      />
    );
    const span = container.querySelector('span[title="recommended"]');
    expect(span).toBeTruthy();
  });

  it('renders multiple agents', () => {
    render(
      <ToolRecallTrace
        entries={[
          makeEntry('agent-A', { role: 'leader' }),
          makeEntry('agent-B', { role: 'analyst' }),
        ]}
      />
    );
    expect(screen.getByText('agent-A')).toBeInTheDocument();
    expect(screen.getByText('agent-B')).toBeInTheDocument();
  });
});
