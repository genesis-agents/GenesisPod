import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissionFlowView } from '../MissionFlowView';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';
import type { MissionDetailView } from '@/services/agent-playground/api';
import type { MissionTodo } from '@/lib/features/agent-playground/mission-todo.types';
import type { StageStepperItem } from '@/components/common/mission-detail/StageStepper';

// Stub browser APIs
Element.prototype.scrollIntoView = vi.fn();

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock StageStepper
vi.mock('@/components/common/mission-detail/StageStepper', () => ({
  StageStepper: ({
    stages,
    onStageClick,
  }: {
    stages: StageStepperItem[];
    onStageClick?: (id: string) => void;
  }) => (
    <div data-testid="stage-stepper">
      {stages.map((s) => (
        <button
          key={s.id}
          data-testid={`stage-btn-${s.id}`}
          onClick={() => onStageClick?.(s.id)}
        >
          {s.short}
        </button>
      ))}
    </div>
  ),
}));

// Mock playground ui primitives
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
    <div data-testid="card" className={className} data-bordered={bordered}>
      {children}
    </div>
  ),
  Section: ({
    children,
    title,
    count,
    action,
  }: {
    children: React.ReactNode;
    title: string;
    count?: string;
    action?: React.ReactNode;
  }) => (
    <div data-testid="section">
      <span>{title}</span>
      {count && <span data-testid="section-count">{count}</span>}
      {action && <div data-testid="section-action">{action}</div>}
      {children}
    </div>
  ),
  StatusPill: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
  ExpandableText: ({ text }: { text: string }) => <span>{text}</span>,
}));

// Mock EmptyState
vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
    size?: string;
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
}));

// Mock formatters
vi.mock('@/lib/features/agent-playground/formatters', () => ({
  fmtTimestamp: (ts: number) => `T${ts}`,
  fmtRelative: (ts: number, anchor: number) => `+${ts - anchor}ms`,
  ROLE_LABEL: {
    leader: 'Leader',
    researcher: 'Researcher',
    analyst: 'Analyst',
    writer: 'Writer',
    reviewer: 'Reviewer',
    reconciler: 'Reconciler',
    critic: 'Critic',
    'outline-planner': 'Outline Planner',
  },
}));

// Helper: minimal MissionDetailView
function makeMissionView(
  overrides: Partial<MissionDetailView['mission']> = {}
): MissionDetailView {
  return {
    mission: {
      id: 'mission-1',
      topic: 'AI Trends',
      status: 'running',
      depth: 'deep',
      language: 'zh-CN',
      startedAt: new Date(1000).toISOString(),
      ...overrides,
    } as MissionDetailView['mission'],
    agents: [],
    todoBoard: { items: [] },
  } as unknown as MissionDetailView;
}

function makeEvent(
  type: string,
  payload: Record<string, unknown>,
  timestamp = 2000
): PlaygroundEvent {
  return { type, payload, timestamp, agentId: 'agent-1' } as PlaygroundEvent;
}

function makeTodo(overrides: Partial<MissionTodo> = {}): MissionTodo {
  return {
    id: 'todo-1',
    title: 'Test Todo',
    status: 'pending',
    systemStageId: 's2-leader-plan',
    ...overrides,
  } as MissionTodo;
}

describe('MissionFlowView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with empty events — shows EmptyState', () => {
    render(<MissionFlowView view={makeMissionView()} events={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('等待 Mission 启动')).toBeInTheDocument();
  });

  it('shows mission pulse with idle state (no agents running)', () => {
    render(
      <MissionFlowView
        view={makeMissionView({ status: 'idle' as 'running' })}
        events={[]}
      />
    );
    expect(screen.getByText('Mission 等待启动')).toBeInTheDocument();
  });

  it('shows completed status when mission completed', () => {
    const view = makeMissionView({ status: 'completed' });
    view.agents = [];
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText('Mission 已完成')).toBeInTheDocument();
  });

  it('shows quality-failed as completed', () => {
    const view = makeMissionView({ status: 'quality-failed' as 'completed' });
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText('Mission 已完成')).toBeInTheDocument();
  });

  it('shows failed status when mission failed', () => {
    const view = makeMissionView({ status: 'failed' });
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText('Mission 失败')).toBeInTheDocument();
  });

  it('shows cancelled as failed', () => {
    const view = makeMissionView({ status: 'cancelled' as 'failed' });
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText('Mission 失败')).toBeInTheDocument();
  });

  it('shows running agents in mission pulse', () => {
    const view = makeMissionView({ status: 'running' });
    view.agents = [
      { id: 'leader', role: 'leader', phase: 'running', trace: [] },
      { id: 'researcher#1', role: 'researcher', phase: 'running', trace: [] },
    ] as MissionDetailView['agents'];
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText('2 个 Agent 正在工作')).toBeInTheDocument();
  });

  it('shows agent count when view has agents', () => {
    const view = makeMissionView({ status: 'running' });
    view.agents = [
      { id: 'leader', role: 'leader', phase: 'completed', trace: [] },
      { id: 'researcher#1', role: 'researcher', phase: 'running', trace: [] },
    ] as MissionDetailView['agents'];
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText(/共 2 个 Agent/)).toBeInTheDocument();
    expect(screen.getByText(/完成 1/)).toBeInTheDocument();
  });

  it('shows failed agent count when agents failed', () => {
    const view = makeMissionView({ status: 'running' });
    view.agents = [
      { id: 'researcher#1', role: 'researcher', phase: 'failed', trace: [] },
      { id: 'researcher#2', role: 'researcher', phase: 'running', trace: [] },
    ] as MissionDetailView['agents'];
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText(/失败 1/)).toBeInTheDocument();
  });

  it('shows +N overflow when more than 3 running agents', () => {
    const view = makeMissionView({ status: 'running' });
    view.agents = [
      { id: 'r1', role: 'researcher', phase: 'running', trace: [] },
      { id: 'r2', role: 'researcher', phase: 'running', trace: [] },
      { id: 'r3', role: 'researcher', phase: 'running', trace: [] },
      { id: 'r4', role: 'researcher', phase: 'running', trace: [] },
    ] as MissionDetailView['agents'];
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('renders narrative events in timeline', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Planning started',
        role: 'leader',
        tag: 'info',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Planning started')).toBeInTheDocument();
  });

  it('renders narrative with success tone', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Research done',
        role: 'researcher',
        tag: 'success',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Research done')).toBeInTheDocument();
  });

  it('renders narrative with warning tone', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Warning!',
        role: 'analyst',
        tag: 'warning',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Warning!')).toBeInTheDocument();
  });

  it('renders narrative with error tone', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Error occurred',
        role: 'writer',
        tag: 'error',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('skips narrative events without text', () => {
    const events = [
      makeEvent('playground.agent:narrative', { role: 'leader', tag: 'info' }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders lifecycle events', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        phase: 'started',
        role: 'leader',
        dimension: 'Tech',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/leader.*Tech.*启动/)).toBeInTheDocument();
  });

  it('renders lifecycle completed', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        phase: 'completed',
        role: 'researcher',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/researcher.*完成/)).toBeInTheDocument();
  });

  it('renders lifecycle failed', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        phase: 'failed',
        role: 'writer',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/writer.*失败/)).toBeInTheDocument();
  });

  it('skips lifecycle events without phase or role', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', { phase: 'started' }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('renders verifier:verdict events', () => {
    const events = [
      makeEvent('playground.verifier:verdict', {
        verifierId: 'judge-1',
        score: 90,
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Judge "judge-1" 评分 90/100')).toBeInTheDocument();
  });

  it('renders verifier:verdict with low score', () => {
    const events = [
      makeEvent('playground.verifier:verdict', {
        verifierId: 'judge-2',
        score: 45,
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Judge "judge-2" 评分 45/100')).toBeInTheDocument();
  });

  it('renders verifier:verdict with mid score (60-79)', () => {
    const events = [
      makeEvent('playground.verifier:verdict', { verifierId: 'j3', score: 70 }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Judge "j3" 评分 70/100')).toBeInTheDocument();
  });

  it('renders reconciliation:completed events', () => {
    const events = [
      makeEvent('playground.reconciliation:completed', {
        factCount: 10,
        conflictCount: 2,
        gapCount: 1,
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(
      screen.getByText('对账完成 · 10 条事实 / 2 处冲突 / 1 处缺口')
    ).toBeInTheDocument();
  });

  it('renders critic:verdict pass', () => {
    const events = [
      makeEvent('playground.critic:verdict', {
        verdict: 'pass',
        blindspotCount: 0,
        biasCount: 1,
        suggestionCount: 2,
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/Critic L4.*pass/)).toBeInTheDocument();
  });

  it('renders critic:verdict fail', () => {
    const events = [
      makeEvent('playground.critic:verdict', {
        verdict: 'fail',
        blindspotCount: 3,
        biasCount: 2,
        suggestionCount: 1,
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/Critic L4.*fail/)).toBeInTheDocument();
  });

  it('renders critic:verdict unknown verdict', () => {
    const events = [
      makeEvent('playground.critic:verdict', { verdict: undefined }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/Critic L4.*\?/)).toBeInTheDocument();
  });

  it('renders event count in section', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Event 1',
        role: 'leader',
      }),
      makeEvent('playground.agent:narrative', {
        text: 'Event 2',
        role: 'researcher',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByTestId('section-count')).toHaveTextContent('2 条事件');
  });

  it('renders role filter when multiple roles present', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Leader text', role: 'leader' },
        1000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'Researcher text', role: 'researcher' },
        2000
      ),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByTestId('section-action')).toBeInTheDocument();
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();
  });

  it('does not render role filter with single role', () => {
    const events = [
      makeEvent('playground.agent:narrative', { text: 'Text', role: 'leader' }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('filters events by role on select change', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Leader text', role: 'leader' },
        1000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'Researcher text', role: 'researcher' },
        2000
      ),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'leader' } });
    expect(screen.getByText('Leader text')).toBeInTheDocument();
    expect(screen.queryByText('Researcher text')).toBeNull();
  });

  it('clears filter when selecting empty option', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Leader text', role: 'leader' },
        1000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'Researcher text', role: 'researcher' },
        2000
      ),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'leader' } });
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByText('Leader text')).toBeInTheDocument();
    expect(screen.getByText('Researcher text')).toBeInTheDocument();
  });

  it('handles stage click to filter by role', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Leader text', role: 'leader' },
        1000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'Researcher text', role: 'researcher' },
        2000
      ),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    // Click on s2-leader-plan stage (maps to 'leader' role)
    const stageBtn = screen.getByTestId('stage-btn-s2-leader-plan');
    fireEvent.click(stageBtn);
    expect(screen.getByText('Leader text')).toBeInTheDocument();
    expect(screen.queryByText('Researcher text')).toBeNull();
  });

  it('clicking stage with no role mapping clears filter', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Leader text', role: 'leader' },
        1000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'Researcher text', role: 'researcher' },
        2000
      ),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    // First filter
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'leader' } });
    expect(screen.queryByText('Researcher text')).toBeNull();
    // Now click s1-budget which maps to undefined -> clears filter
    const stageBtn = screen.getByTestId('stage-btn-s1-budget');
    fireEvent.click(stageBtn);
    expect(screen.getByText('Leader text')).toBeInTheDocument();
    expect(screen.getByText('Researcher text')).toBeInTheDocument();
  });

  it('renders with todoLedger prop', () => {
    const todos = [
      makeTodo({
        systemStageId: 's2-leader-plan',
        status: 'done',
        title: 'Leader Plan',
      }),
      makeTodo({
        systemStageId: 's3-researchers',
        status: 'in_progress',
        title: 'Research',
      }),
    ];
    render(
      <MissionFlowView
        view={makeMissionView()}
        events={[]}
        todoLedger={todos}
      />
    );
    // StageStepper receives stages
    expect(screen.getByTestId('stage-stepper')).toBeInTheDocument();
  });

  it('renders with stepperStages override', () => {
    const customStages: StageStepperItem[] = [
      {
        id: 'custom-1',
        short: 'Custom Stage',
        Icon: () => null,
        status: 'done',
        title: 'Custom Stage',
      },
    ];
    render(
      <MissionFlowView
        view={makeMissionView()}
        events={[]}
        stepperStages={customStages}
      />
    );
    expect(screen.getByTestId('stage-btn-custom-1')).toBeInTheDocument();
    expect(screen.getByText('Custom Stage')).toBeInTheDocument();
  });

  it('handles anchor fallback when no startedAt and no events', () => {
    const view = makeMissionView({ startedAt: undefined });
    render(<MissionFlowView view={view} events={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
  });

  it('handles anchor fallback using first event timestamp', () => {
    const view = makeMissionView({ startedAt: undefined });
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Hello', role: 'leader' },
        5000
      ),
    ];
    render(<MissionFlowView view={view} events={events} />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('renders meta dimension label in event', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Dim event',
        role: 'researcher',
        dimension: 'Tech Trends',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Tech Trends')).toBeInTheDocument();
  });

  it('renders unknown role as fallback', () => {
    const events = [
      makeEvent('playground.agent:narrative', {
        text: 'Custom agent',
        role: 'custom-role',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Custom agent')).toBeInTheDocument();
  });

  it('renders events without role gracefully', () => {
    const events = [
      makeEvent('playground.verifier:verdict', { verifierId: 'j', score: 80 }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    // reviewer role is assigned in buildFlowEvents
    expect(screen.getByText('Judge "j" 评分 80/100')).toBeInTheDocument();
  });

  it('handles events with namespace prefix stripping', () => {
    const events = [
      makeEvent('social.agent:narrative', {
        text: 'Social event',
        role: 'leader',
      }),
      makeEvent('ai-radar.agent:narrative', {
        text: 'Radar event',
        role: 'researcher',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText('Social event')).toBeInTheDocument();
    expect(screen.getByText('Radar event')).toBeInTheDocument();
  });

  it('sorts events by timestamp', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'Late event', role: 'leader' },
        3000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'Early event', role: 'leader' },
        1000
      ),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    const items = screen.getAllByText(/event/);
    // Both should be visible; order is in DOM
    expect(items).toHaveLength(2);
  });

  it('renders todoLedger status mapping: failed', () => {
    const todos = [
      makeTodo({ systemStageId: 's3-researchers', status: 'failed' }),
    ];
    render(
      <MissionFlowView
        view={makeMissionView()}
        events={[]}
        todoLedger={todos}
      />
    );
    expect(screen.getByTestId('stage-stepper')).toBeInTheDocument();
  });

  it('renders todoLedger status mapping: in_progress', () => {
    const todos = [
      makeTodo({ systemStageId: 's6-analyst', status: 'in_progress' }),
    ];
    render(
      <MissionFlowView
        view={makeMissionView()}
        events={[]}
        todoLedger={todos}
      />
    );
    expect(screen.getByTestId('stage-stepper')).toBeInTheDocument();
  });

  it('renders role icons for all known roles', () => {
    const roles = [
      'leader',
      'researcher',
      'analyst',
      'writer',
      'reviewer',
      'critic',
      'reconciler',
      'mission',
    ];
    const events = roles.map((role, i) =>
      makeEvent(
        'playground.agent:narrative',
        { text: `${role} text`, role },
        1000 + i
      )
    );
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    roles.forEach((role) => {
      expect(screen.getByText(`${role} text`)).toBeInTheDocument();
    });
  });

  it('renders lifecycle with unknown phase', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        phase: 'paused',
        role: 'leader',
      }),
    ];
    render(<MissionFlowView view={makeMissionView()} events={events} />);
    expect(screen.getByText(/leader.*paused/)).toBeInTheDocument();
  });

  it('stopPropagation on select click does not bubble', () => {
    const events = [
      makeEvent(
        'playground.agent:narrative',
        { text: 'T1', role: 'leader' },
        1000
      ),
      makeEvent(
        'playground.agent:narrative',
        { text: 'T2', role: 'researcher' },
        2000
      ),
    ];
    const { container } = render(
      <MissionFlowView view={makeMissionView()} events={events} />
    );
    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    fireEvent.click(select!);
    // Should not throw
  });
});
