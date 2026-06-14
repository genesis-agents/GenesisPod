import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TeamMissionModal } from '../TeamMissionModal';

// Stub browser APIs
Element.prototype.scrollIntoView = vi.fn();
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock Modal
vi.mock('@/components/ui/dialogs/Modal', () => ({
  Modal: ({
    open,
    onClose,
    title,
    subtitle,
    size,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    size?: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="modal" data-size={size}>
        <span data-testid="modal-title">{title}</span>
        {subtitle && <span data-testid="modal-subtitle">{subtitle}</span>}
        <button data-testid="modal-close" onClick={onClose}>
          close
        </button>
        {children}
      </div>
    ) : null,
}));

// Mock MissionDagView
vi.mock('@/components/agent-playground/dag/MissionDagView', () => ({
  MissionDagView: ({
    missionId,
    onAgentClick,
    liveSignal,
  }: {
    missionId: string;
    onAgentClick?: (key: string) => void;
    liveSignal?: number;
  }) => (
    <div
      data-testid="mission-dag-view"
      data-missionid={missionId}
      data-signal={liveSignal}
    >
      <button
        data-testid="agent-click-btn"
        onClick={() => onAgentClick?.('task-key-1')}
      >
        Click Agent
      </button>
    </div>
  ),
}));

describe('TeamMissionModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render when open=false', () => {
    render(<TeamMissionModal open={false} onClose={vi.fn()} missionId="m1" />);
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('renders when open=true', () => {
    render(<TeamMissionModal open onClose={vi.fn()} missionId="m1" />);
    expect(screen.getByTestId('modal')).toBeInTheDocument();
  });

  it('renders with correct title', () => {
    render(<TeamMissionModal open onClose={vi.fn()} missionId="m1" />);
    expect(screen.getByTestId('modal-title')).toHaveTextContent('Mission DAG');
  });

  it('renders with correct subtitle', () => {
    render(<TeamMissionModal open onClose={vi.fn()} missionId="m1" />);
    expect(screen.getByTestId('modal-subtitle')).toHaveTextContent(
      /完整执行图/
    );
  });

  it('renders with full size', () => {
    render(<TeamMissionModal open onClose={vi.fn()} missionId="m1" />);
    expect(screen.getByTestId('modal')).toHaveAttribute('data-size', 'full');
  });

  it('calls onClose when modal close clicked', () => {
    const onClose = vi.fn();
    render(<TeamMissionModal open onClose={onClose} missionId="m1" />);
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders MissionDagView with correct missionId', () => {
    render(<TeamMissionModal open onClose={vi.fn()} missionId="mission-123" />);
    expect(screen.getByTestId('mission-dag-view')).toHaveAttribute(
      'data-missionid',
      'mission-123'
    );
  });

  it('passes liveSignal to MissionDagView', () => {
    render(
      <TeamMissionModal open onClose={vi.fn()} missionId="m1" liveSignal={42} />
    );
    expect(screen.getByTestId('mission-dag-view')).toHaveAttribute(
      'data-signal',
      '42'
    );
  });

  it('passes onAgentClick to MissionDagView', () => {
    const onAgentClick = vi.fn();
    render(
      <TeamMissionModal
        open
        onClose={vi.fn()}
        missionId="m1"
        onAgentClick={onAgentClick}
      />
    );
    fireEvent.click(screen.getByTestId('agent-click-btn'));
    expect(onAgentClick).toHaveBeenCalledWith('task-key-1');
  });

  it('works without optional props', () => {
    render(<TeamMissionModal open onClose={vi.fn()} missionId="m1" />);
    expect(screen.getByTestId('mission-dag-view')).toBeInTheDocument();
  });

  it('accepts legacy dimensions prop without error', () => {
    render(
      <TeamMissionModal
        open
        onClose={vi.fn()}
        missionId="m1"
        dimensions={[{ id: 'd1', name: 'Tech', rationale: 'Research' }]}
      />
    );
    expect(screen.getByTestId('mission-dag-view')).toBeInTheDocument();
  });

  it('accepts legacy agents prop without error', () => {
    render(
      <TeamMissionModal open onClose={vi.fn()} missionId="m1" agents={[]} />
    );
    expect(screen.getByTestId('mission-dag-view')).toBeInTheDocument();
  });

  it('renders correctly when liveSignal is 0', () => {
    render(
      <TeamMissionModal open onClose={vi.fn()} missionId="m1" liveSignal={0} />
    );
    expect(screen.getByTestId('mission-dag-view')).toHaveAttribute(
      'data-signal',
      '0'
    );
  });
});
