/**
 * MissionDagView — unit tests
 *
 * Strategy: mock d3, API calls, and UI primitives.
 * Test: loading/error/empty states, node rendering, cascade bar, react ring modal.
 */

import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MissionDagView } from '../MissionDagView';
import type {
  MissionDagGraph,
  MissionDagCascadePreview,
  MissionDagReactSnapshot,
} from '@/services/agent-playground/api';

// ──────── Module mocks ────────────────────────────────────────────────────────

const mockFetchDag = vi.fn();
const mockFetchCascade = vi.fn();
const mockFetchReact = vi.fn();
const mockLocalRerunTodo = vi.fn();

vi.mock('@/services/agent-playground/api', () => ({
  fetchMissionDag: (...args: unknown[]) => mockFetchDag(...args),
  fetchMissionDagCascade: (...args: unknown[]) => mockFetchCascade(...args),
  fetchMissionDagReact: (...args: unknown[]) => mockFetchReact(...args),
  localRerunTodo: (...args: unknown[]) => mockLocalRerunTodo(...args),
}));

// d3 mock — just stub the zoom behavior
vi.mock('d3', () => {
  const zoomBehavior = {
    scaleExtent: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    scaleBy: vi.fn().mockReturnThis(),
    transform: vi.fn().mockReturnThis(),
  };
  const selection = {
    call: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    transition: vi.fn().mockReturnThis(),
    duration: vi.fn().mockReturnThis(),
  };
  return {
    zoom: vi.fn(() => zoomBehavior),
    select: vi.fn(() => selection),
    zoomIdentity: {
      translate: vi.fn().mockReturnThis(),
      scale: vi.fn().mockReturnThis(),
    },
  };
});

vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({ title }: { title: string }) => (
    <div data-testid="empty-state">{title}</div>
  ),
}));

vi.mock('@/components/ui/dialogs/Modal', () => ({
  Modal: ({
    open,
    children,
    title,
    onClose,
  }: {
    open: boolean;
    children: React.ReactNode;
    title?: string;
    onClose: () => void;
  }) =>
    open ? (
      <div data-testid="modal">
        {title && <div data-testid="modal-title">{title}</div>}
        <button data-testid="modal-close" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));

// ──────── ResizeObserver stub ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    value: () => ({
      width: 800,
      height: 600,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
    }),
    configurable: true,
  });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ──────── Sample graph data ────────────────────────────────────────────────────

function makeSampleGraph(): MissionDagGraph {
  return {
    missionId: 'mission-1',
    mission: { status: 'running', topic: 'Test Mission', finalScore: null },
    nodes: [
      {
        id: 's2-leader-plan',
        kind: 'macro',
        label: 'Leader Plan',
        status: 'done',
        rerunable: false,
        layout: 'spine',
      },
      {
        id: 's3-researcher-collect',
        kind: 'macro',
        label: 'Researcher',
        status: 'done',
        rerunable: false,
        layout: 'spine',
      },
      {
        id: 'dim-market',
        kind: 'research-dim',
        label: '市场分析',
        status: 'done',
        rerunable: true,
        dimensionRef: 'market',
        parentStepId: 's3-researcher-collect',
        layout: 'fan',
      },
      {
        id: 'dim-tech',
        kind: 'research-dim',
        label: '技术分析',
        status: 'running',
        rerunable: true,
        dimensionRef: 'tech',
        parentStepId: 's3-researcher-collect',
        layout: 'fan',
      },
      {
        id: 's5-reconciler',
        kind: 'macro',
        label: 'Reconciler',
        status: 'idle',
        rerunable: false,
        layout: 'spine',
      },
    ],
    edges: [
      { from: 's2-leader-plan', to: 's3-researcher-collect', kind: 'flow' },
      { from: 's3-researcher-collect', to: 's5-reconciler', kind: 'flow' },
    ],
  };
}

// ──────── Tests ───────────────────────────────────────────────────────────────

describe('MissionDagView - loading state', () => {
  it('shows loading indicator while fetching', async () => {
    mockFetchDag.mockReturnValue(new Promise(() => {})); // never resolves
    render(<MissionDagView missionId="mission-1" />);
    expect(screen.getByText('加载 Mission DAG…')).toBeInTheDocument();
  });
});

describe('MissionDagView - error state', () => {
  it('shows error message when initial load fails', async () => {
    mockFetchDag.mockRejectedValue(new Error('network error'));
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('加载失败')).toBeInTheDocument();
      expect(screen.getByText('network error')).toBeInTheDocument();
    });
  });

  it('does not replace canvas with error when graph already loaded', async () => {
    const graph = makeSampleGraph();
    mockFetchDag.mockResolvedValueOnce(graph);
    mockFetchCascade.mockRejectedValue(new Error('cascade fail'));

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });

    // Now trigger cascade error — the canvas should still be visible
    const rerunBtns = screen.getAllByTitle('预览重跑影响链路');
    fireEvent.click(rerunBtns[0]);

    await waitFor(() => {
      expect(screen.queryByText('加载失败')).not.toBeInTheDocument();
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });
  });
});

describe('MissionDagView - empty state', () => {
  it('shows empty state when graph has no nodes', async () => {
    mockFetchDag.mockResolvedValue({ nodes: [], edges: [] });
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('尚无 DAG 数据')).toBeInTheDocument();
    });
  });

  it('shows empty state when graph is null', async () => {
    mockFetchDag.mockResolvedValue(null);
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    });
  });
});

describe('MissionDagView - graph rendering', () => {
  it('renders macro nodes', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('Leader Plan')).toBeInTheDocument();
      expect(screen.getByText('Reconciler')).toBeInTheDocument();
    });
  });

  it('renders research-dim nodes', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
      expect(screen.getByText('技术分析')).toBeInTheDocument();
    });
  });

  it('renders node status classes', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    const { container } = render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      // done node gets emerald border
      const doneNodes = container.querySelectorAll('.border-emerald-500');
      expect(doneNodes.length).toBeGreaterThan(0);
    });
  });

  it('renders running node with blue border', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    const { container } = render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      const runningNodes = container.querySelectorAll('.border-blue-500');
      expect(runningNodes.length).toBeGreaterThan(0);
    });
  });

  it('renders control buttons (+/-/fit/reset)', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('放大')).toBeInTheDocument();
      expect(screen.getByTitle('缩小')).toBeInTheDocument();
      expect(screen.getByTitle('适配画布')).toBeInTheDocument();
      expect(screen.getByTitle('还原 100%')).toBeInTheDocument();
    });
  });

  it('calls onAgentClick when non-button area of node clicked', async () => {
    const onAgentClick = vi.fn();
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(
      <MissionDagView missionId="mission-1" onAgentClick={onAgentClick} />
    );
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });
    // The node uses onPointerUp (not onClick) to detect clicks vs drags.
    // Fire pointerUp on the label text element — it bubbles up to the node div.
    fireEvent.pointerUp(screen.getByText('市场分析'));
    expect(onAgentClick).toHaveBeenCalledWith('dim-market');
  });
});

describe('MissionDagView - zoom controls', () => {
  it('zoom in button is present and clickable', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('放大')).toBeInTheDocument();
    });
    // Just verify click doesn't throw (d3 is mocked)
    fireEvent.click(screen.getByTitle('放大'));
  });

  it('zoom out button works', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('缩小')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('缩小'));
  });

  it('fit button works', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('适配画布')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('适配画布'));
  });

  it('reset button works', async () => {
    mockFetchDag.mockResolvedValue(makeSampleGraph());
    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByTitle('还原 100%')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTitle('还原 100%'));
  });
});

describe('MissionDagView - cascade bar', () => {
  it('shows cascade bar when rerun button clicked and cascade fetched', async () => {
    const graph = makeSampleGraph();
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: true,
      willRerun: ['dim-market', 's5-reconciler'],
      kept: ['s2-leader-plan'],
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchCascade.mockResolvedValue(preview);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });

    const rerunBtns = screen.getAllByTitle('预览重跑影响链路');
    fireEvent.click(rerunBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('确认重跑')).toBeInTheDocument();
      expect(screen.getByText(/级联 2 个下游/)).toBeInTheDocument();
    });
  });

  it('shows not-rerunable reason in cascade bar', async () => {
    const graph = makeSampleGraph();
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: false,
      willRerun: [],
      kept: [],
      reason: '此阶段不支持重跑',
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchCascade.mockResolvedValue(preview);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });

    const rerunBtns = screen.getAllByTitle('预览重跑影响链路');
    fireEvent.click(rerunBtns[0]);

    await waitFor(() => {
      expect(screen.getByText('此阶段不支持重跑')).toBeInTheDocument();
    });
  });

  it('shows not-rerunable default message when reason is null', async () => {
    const graph = makeSampleGraph();
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: false,
      willRerun: [],
      kept: [],
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchCascade.mockResolvedValue(preview);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getAllByTitle('预览重跑影响链路').length).toBeGreaterThan(
        0
      );
    });
    fireEvent.click(screen.getAllByTitle('预览重跑影响链路')[0]);
    await waitFor(() => {
      expect(screen.getByText('不允许重跑')).toBeInTheDocument();
    });
  });

  it('cancels cascade bar when 取消 clicked', async () => {
    const graph = makeSampleGraph();
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: true,
      willRerun: ['dim-market'],
      kept: [],
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchCascade.mockResolvedValue(preview);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getAllByTitle('预览重跑影响链路').length).toBeGreaterThan(
        0
      );
    });
    fireEvent.click(screen.getAllByTitle('预览重跑影响链路')[0]);
    await waitFor(() => {
      expect(screen.getByText('取消')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('取消'));
    expect(screen.queryByText(/级联/)).not.toBeInTheDocument();
  });

  it('calls localRerunTodo when 确认重跑 clicked', async () => {
    const graph = makeSampleGraph();
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: true,
      willRerun: ['dim-market'],
      kept: ['s2-leader-plan'],
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchCascade.mockResolvedValue(preview);
    mockLocalRerunTodo.mockResolvedValue({});
    // After rerun, DAG is reloaded
    mockFetchDag.mockResolvedValueOnce(graph).mockResolvedValue(graph);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getAllByTitle('预览重跑影响链路').length).toBeGreaterThan(
        0
      );
    });
    fireEvent.click(screen.getAllByTitle('预览重跑影响链路')[0]);
    await waitFor(() => {
      expect(screen.getByText('确认重跑')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('确认重跑'));
    await waitFor(() => {
      expect(mockLocalRerunTodo).toHaveBeenCalledWith(
        'mission-1',
        '__mission-dag__',
        expect.objectContaining({
          origin: 'mission-dag',
          scope: 'dimension',
          dimensionRef: 'market',
        })
      );
    });
  });

  it('shows node sub label in cascade bar when present', async () => {
    const graph: MissionDagGraph = {
      ...makeSampleGraph(),
      nodes: [...makeSampleGraph().nodes],
    };
    // Add sub label to a node
    const graphWithSub: MissionDagGraph = {
      missionId: 'mission-1',
      mission: { status: 'running', topic: 'Test Mission', finalScore: null },
      nodes: makeSampleGraph().nodes.map((n) =>
        n.id === 'dim-market' ? { ...n, sub: '市场研究子任务' } : n
      ),
      edges: makeSampleGraph().edges,
    };
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: true,
      willRerun: ['dim-market'],
      kept: [],
    };
    mockFetchDag.mockResolvedValue(graphWithSub);
    mockFetchCascade.mockResolvedValue(preview);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });
    fireEvent.click(screen.getAllByTitle('预览重跑影响链路')[0]);
    await waitFor(() => {
      expect(screen.getByText(/市场研究子任务/)).toBeInTheDocument();
    });
  });
});

describe('MissionDagView - ReAct ring modal', () => {
  it('shows ring modal when ○ loop button clicked', async () => {
    const graph = makeSampleGraph();
    const snap: MissionDagReactSnapshot = {
      nodeId: 'dim-market',
      role: 'researcher',
      currentStep: 'thinking',
      iter: 2,
      finalizeAttempts: 0,
      phase: 'running',
      lastThought: 'Analyzing market data',
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchReact.mockResolvedValue(snap);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });

    const loopBtns = screen.getAllByTitle('展开 ReAct 内部循环');
    fireEvent.click(loopBtns[0]);

    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  it('closes ring modal when close button clicked', async () => {
    const graph = makeSampleGraph();
    const snap: MissionDagReactSnapshot = {
      nodeId: 'dim-market',
      role: 'researcher',
      currentStep: 'idle',
      finalizeAttempts: 0,
      phase: 'completed',
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchReact.mockResolvedValue(snap);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(
        screen.getAllByTitle('展开 ReAct 内部循环').length
      ).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByTitle('展开 ReAct 内部循环')[0]);
    await waitFor(() => {
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
  });

  it('shows loading spinner while fetching react snapshot', async () => {
    const graph = makeSampleGraph();
    // react fetch never resolves
    mockFetchDag.mockResolvedValue(graph);
    mockFetchReact.mockReturnValue(new Promise(() => {}));

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(
        screen.getAllByTitle('展开 ReAct 内部循环').length
      ).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByTitle('展开 ReAct 内部循环')[0]);
    await waitFor(() => {
      // Modal is open showing loading state (snap is null while fetching)
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('拉取 ReAct 状态…')).toBeInTheDocument();
    });
  });
});

describe('MissionDagView - liveSignal refetch', () => {
  it('refetches dag when liveSignal changes', async () => {
    // Use real timers for this test to avoid fake-timer interference with waitFor
    vi.useRealTimers();
    const graph = makeSampleGraph();
    mockFetchDag.mockResolvedValue(graph);

    const { rerender } = render(
      <MissionDagView missionId="mission-1" liveSignal={0} />
    );
    await waitFor(() => {
      expect(mockFetchDag).toHaveBeenCalledTimes(1);
    });

    rerender(<MissionDagView missionId="mission-1" liveSignal={1} />);

    // After liveSignal changes and the 1s throttle fires, a second call should happen
    await waitFor(
      () => {
        expect(mockFetchDag).toHaveBeenCalledTimes(2);
      },
      { timeout: 2000 }
    );
  });

  it('does not refetch when liveSignal is undefined', async () => {
    vi.useRealTimers();
    const graph = makeSampleGraph();
    mockFetchDag.mockResolvedValue(graph);

    const { rerender } = render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(mockFetchDag).toHaveBeenCalledTimes(1);
    });

    rerender(<MissionDagView missionId="mission-1" />);

    // Wait a bit to ensure no extra calls happen when liveSignal is undefined
    await new Promise((r) => setTimeout(r, 200));
    // Still only the initial call (liveSignal effect guard: if liveSignal===undefined, return early)
    expect(mockFetchDag).toHaveBeenCalledTimes(1);
  });
});

describe('MissionDagView - ReactRingPanel content', () => {
  it('renders lastThought content inside ring modal', async () => {
    const graph = makeSampleGraph();
    const snap: MissionDagReactSnapshot = {
      nodeId: 'dim-market',
      role: 'researcher',
      currentStep: 'thinking',
      iter: 3,
      finalizeAttempts: 0,
      phase: 'running',
      lastThought: 'Thinking about market share trends and data',
      lastAction: { kind: 'tool_call', toolName: 'web-search' },
      lastObservation: { kind: 'observation' },
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchReact.mockResolvedValue(snap);

    render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(
        screen.getAllByTitle('展开 ReAct 内部循环').length
      ).toBeGreaterThan(0);
    });
    fireEvent.click(screen.getAllByTitle('展开 ReAct 内部循环')[0]);

    await waitFor(() => {
      expect(
        screen.getByText('Thinking about market share trends and data')
      ).toBeInTheDocument();
    });
  });
});

describe('MissionDagView - edge rendering', () => {
  it('renders SVG paths for edges', async () => {
    const graph = makeSampleGraph();
    mockFetchDag.mockResolvedValue(graph);
    const { container } = render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getByText('市场分析')).toBeInTheDocument();
    });
    // SVG paths should be rendered for the 2 edges
    const paths = container.querySelectorAll('svg path');
    // marker + edge paths
    expect(paths.length).toBeGreaterThan(0);
  });
});

describe('MissionDagView - node interaction', () => {
  it('dims other nodes when cascade preview is active', async () => {
    const graph = makeSampleGraph();
    const preview: MissionDagCascadePreview = {
      origin: 'dim-market',
      rerunable: true,
      willRerun: ['dim-market'],
      kept: [
        's2-leader-plan',
        's3-researcher-collect',
        's5-reconciler',
        'dim-tech',
      ],
    };
    mockFetchDag.mockResolvedValue(graph);
    mockFetchCascade.mockResolvedValue(preview);
    const { container } = render(<MissionDagView missionId="mission-1" />);
    await waitFor(() => {
      expect(screen.getAllByTitle('预览重跑影响链路').length).toBeGreaterThan(
        0
      );
    });
    fireEvent.click(screen.getAllByTitle('预览重跑影响链路')[0]);

    await waitFor(() => {
      // Kept nodes should have opacity-40 and grayscale
      const dimmedNodes = container.querySelectorAll('.opacity-40');
      expect(dimmedNodes.length).toBeGreaterThan(0);
    });
  });
});
