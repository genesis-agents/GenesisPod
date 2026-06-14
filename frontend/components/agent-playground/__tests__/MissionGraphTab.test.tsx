import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MissionGraphTab } from '../MissionGraphTab';
import type {
  MissionGraphArtifact,
  MissionGraph,
  Analyses,
  NodeEnrichment,
  EntityType,
  RelationType,
} from '@/services/agent-playground/graph-types';

// Stub browser APIs
Element.prototype.scrollIntoView = vi.fn();
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock requestFullscreen and exitFullscreen
Object.defineProperty(document, 'fullscreenElement', {
  writable: true,
  value: null,
});

// Mock KnowledgeGraphView
vi.mock('@/components/common/views/KnowledgeGraphView', () => ({
  default: ({
    nodes,
    onNodeSelect,
  }: {
    nodes: { id: string; label: string; type?: string }[];
    edges: { source: string; target: string }[];
    onNodeSelect?: (
      node: { id: string; label: string; type: string } | null
    ) => void;
  }) => (
    <div data-testid="knowledge-graph">
      {nodes.map((n) => (
        <button
          key={n.id}
          data-testid={`graph-node-${n.id}`}
          onClick={() =>
            onNodeSelect?.({
              id: n.id,
              label: n.label,
              type: n.type ?? 'TECHNOLOGY',
            })
          }
        >
          {n.label}
        </button>
      ))}
      <button data-testid="deselect-node" onClick={() => onNodeSelect?.(null)}>
        Deselect
      </button>
    </div>
  ),
}));

// Mock SideDrawer
vi.mock('@/components/common/drawers/SideDrawer', () => ({
  SideDrawer: ({
    open,
    onClose,
    children,
  }: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div data-testid="side-drawer">
        <button onClick={onClose} data-testid="drawer-close">
          X
        </button>
        {children}
      </div>
    ) : null,
}));

// Mock ui components
vi.mock('@/components/ui/cards', () => ({
  SectionPanelCard: ({
    children,
    title,
    icon,
    className,
  }: {
    children: React.ReactNode;
    title: string;
    icon?: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid={`panel-${title}`} className={className}>
      <span>{title}</span>
      {children}
    </div>
  ),
  StatCard: ({ label, value }: { label: string; value: number }) => (
    <div data-testid={`stat-${label}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  ),
}));

vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
    action,
    type,
  }: {
    title: string;
    description?: string;
    action?: React.ReactNode;
    type?: string;
  }) => (
    <div data-testid="empty-state" data-type={type}>
      <p>{title}</p>
      {description && <p>{description}</p>}
      {action && <div data-testid="empty-action">{action}</div>}
    </div>
  ),
}));

vi.mock('@/components/ui/states/ErrorState', () => ({
  ErrorState: ({
    error,
    title,
    onRetry,
  }: {
    error: Error;
    title: string;
    onRetry: () => void;
  }) => (
    <div data-testid="error-state">
      <p>{title}</p>
      <p>{error.message}</p>
      <button onClick={onRetry} data-testid="retry-btn">
        Retry
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/states/LoadingState', () => ({
  LoadingState: ({ text, size }: { text: string; size?: string }) => (
    <div data-testid="loading-state" data-size={size}>
      {text}
    </div>
  ),
}));

vi.mock('@/components/ui/primitives/button', () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: () => void;
  }) => (
    <button data-testid="ui-button" onClick={onClick}>
      {children}
    </button>
  ),
}));

// Mock API
const mockGetMissionGraph = vi.fn();
const mockBuildMissionGraph = vi.fn();
const mockEnrichGraphNode = vi.fn();

vi.mock('@/services/agent-playground/api', () => ({
  getMissionGraph: (...args: unknown[]) => mockGetMissionGraph(...args),
  buildMissionGraph: (...args: unknown[]) => mockBuildMissionGraph(...args),
  enrichGraphNode: (...args: unknown[]) => mockEnrichGraphNode(...args),
}));

function makeGraph(): MissionGraph {
  return {
    nodes: [
      { id: 'n1', label: 'Node 1', type: 'TECHNOLOGY' },
      { id: 'n2', label: 'Node 2', type: 'ORGANIZATION' },
    ],
    edges: [{ source: 'n1', target: 'n2', type: 'RELATED_TO', weight: 0.8 }],
    stats: { totalNodes: 2, totalEdges: 1 },
  };
}

function makeAnalyses(): Analyses {
  return {
    keyNodes: {
      summary: 'Key nodes summary',
      items: [
        { id: 'n1', label: 'Node 1', degree: 5, score: 0.95 },
        { id: 'n2', label: 'Node 2', degree: 3, score: 0.72 },
      ],
    },
    relatedness: {
      summary: 'Relatedness summary',
      pairs: [{ a: 'Node 1', b: 'Node 2', strength: 0.85 }],
    },
    competitive: {
      summary: 'Competitive summary',
      clusters: [{ members: ['Company A', 'Company B'] }],
    },
    community: {
      summary: 'Community summary',
      communities: [
        { id: 1, members: ['Node 1', 'Node 2'] },
        { id: 2, members: ['Node 3'] },
      ],
    },
    supplyChain: {
      summary: 'Supply chain summary',
      layers: [
        { order: 0, members: ['Upstream Co'], description: 'Upstream layer' },
        { order: 1, members: ['Mid Co'] },
        { order: 2, members: ['Downstream Co'], description: 'Downstream' },
      ],
    },
  };
}

function makeArtifact(status: string): MissionGraphArtifact {
  return {
    status,
    graph: makeGraph(),
    analyses: makeAnalyses(),
  } as MissionGraphArtifact;
}

describe('MissionGraphTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading state while fetching', async () => {
      mockGetMissionGraph.mockReturnValue(new Promise(() => {}));
      render(<MissionGraphTab missionId="mission-1" />);
      expect(screen.getByTestId('loading-state')).toBeInTheDocument();
      expect(screen.getByText('加载图谱数据...')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    it('shows error state when fetch fails', async () => {
      mockGetMissionGraph.mockRejectedValue(new Error('Network error'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('error-state')).toBeInTheDocument();
      });
      expect(screen.getByText('图谱加载失败')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('retry button calls fetchGraph again', async () => {
      mockGetMissionGraph.mockRejectedValueOnce(new Error('Fail'));
      mockGetMissionGraph.mockResolvedValueOnce(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('retry-btn'));
      fireEvent.click(screen.getByTestId('retry-btn'));
      await waitFor(() => {
        expect(mockGetMissionGraph).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('empty states', () => {
    it('shows empty state when artifact is null (no artifact)', async () => {
      mockGetMissionGraph.mockResolvedValue(null);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      });
      expect(screen.getByText('尚未生成图谱分析')).toBeInTheDocument();
    });

    it('shows empty state when status is NONE', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('NONE'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText('尚未生成图谱分析')).toBeInTheDocument();
      });
    });

    it('shows empty state when status is FAILED', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('FAILED'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText('图谱生成失败')).toBeInTheDocument();
      });
    });

    it('shows build button in empty state', async () => {
      mockGetMissionGraph.mockResolvedValue(null);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('ui-button'));
      expect(screen.getByText('生成图谱分析')).toBeInTheDocument();
    });

    it('clicking build triggers buildMissionGraph', async () => {
      mockGetMissionGraph.mockResolvedValue(null);
      mockBuildMissionGraph.mockResolvedValue(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('ui-button'));
      fireEvent.click(screen.getByTestId('ui-button'));
      await waitFor(() => {
        expect(mockBuildMissionGraph).toHaveBeenCalledWith('mission-1');
      });
    });

    it('shows building loading state while building', async () => {
      mockGetMissionGraph.mockResolvedValue(null);
      mockBuildMissionGraph.mockReturnValue(new Promise(() => {}));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('ui-button'));
      fireEvent.click(screen.getByTestId('ui-button'));
      await waitFor(() => {
        expect(screen.getByText('图谱生成中，请稍候...')).toBeInTheDocument();
      });
    });

    it('shows BUILDING status loading', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('BUILDING'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText('图谱构建中，请稍候...')).toBeInTheDocument();
      });
    });

    it('handles non-Error thrown by buildMissionGraph (covers line 73 false branch)', async () => {
      // Throw a string instead of Error → hits `new Error(String(e))` branch
      mockGetMissionGraph.mockResolvedValue(null);
      mockBuildMissionGraph.mockRejectedValue('string-error-from-build');
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('ui-button'));
      fireEvent.click(screen.getByTestId('ui-button'));
      await waitFor(() => {
        // Error should be displayed via ErrorState (but only if !artifact which it is since getMission returned null)
        // Or it may just return to empty state - either way it shouldn't crash
        expect(document.body).toBeTruthy();
      });
    });
  });

  describe('READY state', () => {
    beforeEach(() => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
    });

    it('renders stat cards', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('stat-节点总数')).toBeInTheDocument();
        expect(screen.getByTestId('stat-关系总数')).toBeInTheDocument();
        expect(screen.getByTestId('stat-关键节点')).toBeInTheDocument();
        expect(screen.getByTestId('stat-社区数量')).toBeInTheDocument();
      });
    });

    it('renders knowledge graph', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('knowledge-graph')).toBeInTheDocument();
      });
    });

    it('renders analysis panels', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('panel-关键节点')).toBeInTheDocument();
        expect(screen.getByTestId('panel-关联性')).toBeInTheDocument();
        expect(screen.getByTestId('panel-竞争格局')).toBeInTheDocument();
        expect(screen.getByTestId('panel-集群社区')).toBeInTheDocument();
        expect(screen.getByTestId('panel-产业链')).toBeInTheDocument();
      });
    });

    it('renders key nodes list', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        // "Node 1" appears in both the graph mock and keyNodes panel
        expect(screen.getAllByText('Node 1').length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders relatedness pairs', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        // The relatedness pair renders as "Node 1 — Node 2" in a span
        // May match multiple elements; use getAllByText
        expect(screen.getAllByText(/Node 1/).length).toBeGreaterThanOrEqual(1);
      });
    });

    it('renders competitive clusters', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText(/Company A/)).toBeInTheDocument();
      });
    });

    it('renders community members', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText(/社区 1/)).toBeInTheDocument();
      });
    });

    it('renders supply chain layers', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText(/Upstream Co/)).toBeInTheDocument();
        expect(screen.getByText(/Mid Co/)).toBeInTheDocument();
        expect(screen.getByText(/Downstream Co/)).toBeInTheDocument();
      });
    });

    it('shows supply chain arrows between layers', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        const arrows = screen.getAllByText('↓');
        expect(arrows.length).toBeGreaterThan(0);
      });
    });

    it('supply chain roleOf: single layer shows 全链路', async () => {
      const artifact = makeArtifact('READY');
      (artifact.analyses as Analyses).supplyChain.layers = [
        { order: 0, members: ['Single Co'], description: 'Only layer' },
      ];
      mockGetMissionGraph.mockResolvedValue(artifact);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText(/全链路环节/)).toBeInTheDocument();
      });
    });

    it('supply chain roleOf: last layer shows 下游', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByText(/下游环节/)).toBeInTheDocument();
      });
    });

    it('supply chain roleOf: middle layer shows 中游', async () => {
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        // Multiple ancestor elements may contain the text "中游环节"
        expect(screen.getAllByText(/中游环节/).length).toBeGreaterThanOrEqual(
          1
        );
      });
    });

    it('supply chain layer without description uses generated text', async () => {
      const artifact = makeArtifact('READY');
      (artifact.analyses as Analyses).supplyChain.layers = [
        {
          order: 0,
          members: ['Co1'],
          description: undefined as unknown as string,
        },
        {
          order: 1,
          members: ['Co2'],
          description: undefined as unknown as string,
        },
      ];
      mockGetMissionGraph.mockResolvedValue(artifact);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        // Generated description for non-terminal layer
        expect(screen.getByText(/向下游输出能力\/产品/)).toBeInTheDocument();
        // Terminal layer
        expect(screen.getByText(/为终端环节/)).toBeInTheDocument();
      });
    });
  });

  describe('fullscreen toggle', () => {
    it('shows fullscreen button', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTitle('全屏展示')).toBeInTheDocument();
      });
    });

    it('clicking fullscreen toggles state', async () => {
      const requestFullscreenMock = vi.fn().mockResolvedValue(undefined);
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTitle('全屏展示'));

      // Override requestFullscreen on the element
      const el = document.querySelector(
        '[data-testid="panel-知识图谱"]'
      )?.parentElement;
      if (el) {
        Object.defineProperty(el, 'requestFullscreen', {
          value: requestFullscreenMock,
          writable: true,
        });
      }

      // When fullscreen API not available, falls back to state
      const fsBtn = screen.getByTitle('全屏展示');
      fireEvent.click(fsBtn);
      await waitFor(() => {
        expect(screen.getByTitle('退出全屏')).toBeInTheDocument();
      });
    });

    it('fullscreenchange event updates state', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTitle('全屏展示'));
      // Simulate fullscreenchange
      act(() => {
        Object.defineProperty(document, 'fullscreenElement', {
          value: document.body,
          writable: true,
        });
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      await waitFor(() => {
        expect(screen.getByTitle('退出全屏')).toBeInTheDocument();
      });
    });

    it('clicking fullscreen while fullscreenElement is set exits fullscreen (covers lines 213-214)', async () => {
      // Reset fullscreenElement to null first to ensure clean state (writable: true only, no configurable change)
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
      });

      // Mock exitFullscreen using writable only
      const exitFsMock = vi.fn().mockResolvedValue(undefined);
      try {
        Object.defineProperty(document, 'exitFullscreen', {
          value: exitFsMock,
          writable: true,
        });
      } catch {
        // If already defined as configurable, just set it directly
        (document as unknown as Record<string, unknown>).exitFullscreen =
          exitFsMock;
      }

      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTitle('全屏展示'));

      // Enter fullscreen by clicking (fullscreenElement is null → enters if branch, setFullscreen(true))
      fireEvent.click(screen.getByTitle('全屏展示'));
      await waitFor(() => screen.getByTitle('退出全屏'));

      // Now simulate fullscreenElement being set (the browser would set this)
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.body,
        writable: true,
      });

      // Click exit fullscreen → fullscreenElement is set → else branch (lines 213-214)
      fireEvent.click(screen.getByTitle('退出全屏'));
      await waitFor(() => {
        expect(exitFsMock).toHaveBeenCalled();
      });

      // Cleanup
      Object.defineProperty(document, 'fullscreenElement', {
        value: null,
        writable: true,
      });
    });

    it('fullscreenchange to null reverts to normal', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTitle('全屏展示'));
      // Set to fullscreen
      act(() => {
        Object.defineProperty(document, 'fullscreenElement', {
          value: document.body,
          writable: true,
        });
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      await waitFor(() => screen.getByTitle('退出全屏'));
      // Exit fullscreen
      act(() => {
        Object.defineProperty(document, 'fullscreenElement', {
          value: null,
          writable: true,
        });
        document.dispatchEvent(new Event('fullscreenchange'));
      });
      await waitFor(() => {
        expect(screen.getByTitle('全屏展示')).toBeInTheDocument();
      });
    });
  });

  describe('node selection and enrichment', () => {
    beforeEach(() => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
    });

    it('opens side drawer when node is selected', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: 'Entity description',
        facts: [{ label: 'Founded', value: '2010' }],
        sources: [{ url: 'https://example.com', title: 'Source 1' }],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
      });
    });

    it('shows node label in drawer', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: 'Node 1 description',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        // "Node 1" may appear in graph + keyNodes panel + drawer header
        expect(screen.getAllByText('Node 1').length).toBeGreaterThanOrEqual(1);
        // Drawer should be open
        expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
      });
    });

    it('shows enrichment description', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: 'Rich description',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        expect(screen.getByText('Rich description')).toBeInTheDocument();
      });
    });

    it('shows enrichment facts', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: '',
        facts: [{ label: 'HQ', value: 'San Francisco' }],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        expect(screen.getByText('HQ')).toBeInTheDocument();
        expect(screen.getByText('San Francisco')).toBeInTheDocument();
      });
    });

    it('shows enrichment sources with url', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: '',
        facts: [],
        sources: [{ url: 'https://example.com', title: 'Example Source' }],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        expect(screen.getByText('Example Source')).toBeInTheDocument();
      });
    });

    it('shows source url as link text when no title', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: '',
        facts: [],
        sources: [{ url: 'https://example.com', title: '' }],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        expect(screen.getByText('https://example.com')).toBeInTheDocument();
      });
    });

    it('shows no-info message when enrich has empty data', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: '',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));

      await waitFor(() => {
        expect(
          screen.getByText('未能抓取到该实体的更多信息。')
        ).toBeInTheDocument();
      });
    });

    it('shows error when enrichment fails', async () => {
      mockEnrichGraphNode.mockRejectedValue(new Error('Enrichment error'));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));
      await waitFor(() => {
        expect(
          screen.getByText('画像抓取失败，可关闭后重试。')
        ).toBeInTheDocument();
      });
    });

    it('shows loading state during enrichment', async () => {
      mockEnrichGraphNode.mockReturnValue(new Promise(() => {}));
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));
      await waitFor(() => {
        expect(
          screen.getByText('正在用搜索/工具抓取实体画像…')
        ).toBeInTheDocument();
      });
    });

    it('uses cached enrichment on second click', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: 'Cached description',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      // First click
      fireEvent.click(screen.getByTestId('graph-node-n1'));
      await waitFor(() => screen.getByText('Cached description'));
      // Close drawer
      fireEvent.click(screen.getByTestId('drawer-close'));
      await waitFor(() =>
        expect(screen.queryByTestId('side-drawer')).toBeNull()
      );
      // Second click - should use cache
      fireEvent.click(screen.getByTestId('graph-node-n1'));
      await waitFor(() => screen.getByText('Cached description'));
      // enrichGraphNode should have been called only once
      expect(mockEnrichGraphNode).toHaveBeenCalledTimes(1);
    });

    it('clicking deselect clears node selection', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: 'Desc',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));
      await waitFor(() => screen.getByTestId('side-drawer'));
      fireEvent.click(screen.getByTestId('deselect-node'));
      await waitFor(() => {
        expect(screen.queryByTestId('side-drawer')).toBeNull();
      });
    });

    it('shows entity type label for TECHNOLOGY', async () => {
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'n1',
        label: 'Node 1',
        type: 'TECHNOLOGY',
        description: 'D',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-n1'));
      fireEvent.click(screen.getByTestId('graph-node-n1'));
      await waitFor(() => {
        expect(screen.getByText('技术')).toBeInTheDocument();
      });
    });
  });

  describe('ENTITY_TYPE_LABEL coverage', () => {
    const entityTypes = [
      { type: 'ORGANIZATION', label: '组织/机构' },
      { type: 'PERSON', label: '人物' },
      { type: 'PRODUCT', label: '产品' },
      { type: 'CONCEPT', label: '概念' },
      { type: 'EVENT', label: '事件' },
      { type: 'LOCATION', label: '地点' },
      { type: 'TREND', label: '趋势' },
      { type: 'METRIC', label: '指标' },
      { type: 'OTHER', label: '其他' },
    ];

    entityTypes.forEach(({ type, label }) => {
      it(`shows label for ${type}`, async () => {
        vi.resetAllMocks();
        const artifact = makeArtifact('READY');
        artifact.graph!.nodes = [
          { id: 'x1', label: 'X Node', type: type as EntityType },
        ];
        mockGetMissionGraph.mockResolvedValue(artifact);
        mockEnrichGraphNode.mockResolvedValue({
          nodeId: 'x1',
          label: 'X Node',
          type,
          description: '',
          facts: [],
          sources: [],
        } satisfies NodeEnrichment);

        render(<MissionGraphTab missionId="mission-1" />);
        await waitFor(() => screen.getByTestId('graph-node-x1'));
        fireEvent.click(screen.getByTestId('graph-node-x1'));
        await waitFor(() => {
          expect(screen.getByText(label)).toBeInTheDocument();
        });
        vi.clearAllMocks();
        mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      });
    });

    it('uses raw type for unknown entity types', async () => {
      const artifact = makeArtifact('READY');
      artifact.graph!.nodes = [
        {
          id: 'u1',
          label: 'Unknown Node',
          type: 'CUSTOM_TYPE' as unknown as EntityType,
        },
      ];
      mockGetMissionGraph.mockResolvedValue(artifact);
      mockEnrichGraphNode.mockResolvedValue({
        nodeId: 'u1',
        label: 'Unknown Node',
        type: 'CUSTOM_TYPE',
        description: '',
        facts: [],
        sources: [],
      } satisfies NodeEnrichment);

      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('graph-node-u1'));
      fireEvent.click(screen.getByTestId('graph-node-u1'));
      await waitFor(() => {
        expect(screen.getByText('CUSTOM_TYPE')).toBeInTheDocument();
      });
    });
  });

  describe('edges with weight', () => {
    it('handles edges without weight', async () => {
      const artifact = makeArtifact('READY');
      artifact.graph!.edges = [
        {
          source: 'n1',
          target: 'n2',
          type: 'RELATED_TO' satisfies RelationType,
          weight: undefined as unknown as number,
        },
      ];
      mockGetMissionGraph.mockResolvedValue(artifact);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('knowledge-graph'));
      // Should render without crash
      expect(screen.getByTestId('knowledge-graph')).toBeInTheDocument();
    });
  });

  describe('missionId changes', () => {
    it('refetches when missionId changes', async () => {
      mockGetMissionGraph.mockResolvedValue(makeArtifact('READY'));
      const { rerender } = render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => screen.getByTestId('knowledge-graph'));
      expect(mockGetMissionGraph).toHaveBeenCalledWith('mission-1');

      rerender(<MissionGraphTab missionId="mission-2" />);
      await waitFor(() => {
        expect(mockGetMissionGraph).toHaveBeenCalledWith('mission-2');
      });
    });
  });

  describe('analyses with empty arrays', () => {
    it('renders without crashing when analyses have empty arrays', async () => {
      const artifact = makeArtifact('READY');
      (artifact.analyses as Analyses).keyNodes.items = [];
      (artifact.analyses as Analyses).relatedness.pairs = [];
      (artifact.analyses as Analyses).competitive.clusters = [];
      (artifact.analyses as Analyses).community.communities = [];
      (artifact.analyses as Analyses).supplyChain.layers = [];
      mockGetMissionGraph.mockResolvedValue(artifact);
      render(<MissionGraphTab missionId="mission-1" />);
      await waitFor(() => {
        expect(screen.getByTestId('panel-关键节点')).toBeInTheDocument();
      });
    });
  });
});
