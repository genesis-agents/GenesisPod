import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { RoleChip } from '../RoleChip';

describe('RoleChip', () => {
  it('renders known role label by default', () => {
    render(<RoleChip role="leader" />);
    expect(screen.getByText('Leader')).toBeInTheDocument();
  });

  it('renders researcher role', () => {
    render(<RoleChip role="researcher" />);
    expect(screen.getByText('Researcher')).toBeInTheDocument();
  });

  it('renders analyst role', () => {
    render(<RoleChip role="analyst" />);
    expect(screen.getByText('Analyst')).toBeInTheDocument();
  });

  it('renders writer role', () => {
    render(<RoleChip role="writer" />);
    expect(screen.getByText('Writer')).toBeInTheDocument();
  });

  it('renders reviewer role', () => {
    render(<RoleChip role="reviewer" />);
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('renders critic role', () => {
    render(<RoleChip role="critic" />);
    expect(screen.getByText('Critic')).toBeInTheDocument();
  });

  it('renders reconciler role', () => {
    render(<RoleChip role="reconciler" />);
    expect(screen.getByText('Reconciler')).toBeInTheDocument();
  });

  it('renders mission role', () => {
    render(<RoleChip role="mission" />);
    expect(screen.getByText('Mission')).toBeInTheDocument();
  });

  it('falls back to mission for unknown role', () => {
    render(<RoleChip role="unknown-role" />);
    // Falls back to mission which has label "Mission"
    expect(screen.getByText('Mission')).toBeInTheDocument();
  });

  it('shows agentId when provided instead of label', () => {
    render(<RoleChip role="researcher" agentId="researcher#3" />);
    expect(screen.getByText('researcher#3')).toBeInTheDocument();
    expect(screen.queryByText('Researcher')).not.toBeInTheDocument();
  });

  it('title shows label when no agentId', () => {
    const { container } = render(<RoleChip role="leader" />);
    const span = container.querySelector('span');
    expect(span?.getAttribute('title')).toBe('Leader');
  });

  it('title shows "role · agentId" when agentId provided', () => {
    const { container } = render(
      <RoleChip role="researcher" agentId="agent-42" />
    );
    const span = container.querySelector('span');
    expect(span?.getAttribute('title')).toBe('Researcher · agent-42');
  });

  it('iconOnly=true hides display text', () => {
    render(<RoleChip role="leader" iconOnly={true} />);
    expect(screen.queryByText('Leader')).not.toBeInTheDocument();
  });

  it('iconOnly=false (default) shows display text', () => {
    render(<RoleChip role="leader" iconOnly={false} />);
    expect(screen.getByText('Leader')).toBeInTheDocument();
  });

  it('size=xs applies smaller text class', () => {
    const { container } = render(<RoleChip role="leader" size="xs" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-[10px]');
  });

  it('size=sm (default) applies sm text class', () => {
    const { container } = render(<RoleChip role="leader" size="sm" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-[11px]');
  });
});
