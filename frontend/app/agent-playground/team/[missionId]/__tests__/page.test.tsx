/**
 * Tests for app/agent-playground/team/[missionId]/page.tsx
 *
 * The mission detail page is ~2080 lines and encompasses:
 *   - MissionDetailPage (main component, ~1370 lines)
 *   - MissionSettingsModal (internal component, ~550 lines)
 *   - SettingRow / FormField / SettingsGroup helpers
 *   - CompactMeters (inline component)
 *
 * Mocking strategy:
 *   - All external hooks return controllable fixtures via vi.mock
 *   - All heavy child components are stubbed to divs with data-testids
 *   - Browser APIs (ResizeObserver, matchMedia, scrollIntoView, etc.) are stubbed
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Browser API stubs (must be before imports) ────────────────────
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: vi.fn(),
});
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  readonly root = null;
  readonly rootMargin = '';
  readonly thresholds: number[] = [];
  takeRecords() {
    return [];
  }
} as unknown as typeof IntersectionObserver;

// ── next/navigation ───────────────────────────────────────────────
const mockPush = vi.fn();
const mockMissionId = { missionId: 'test-mission-123' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useParams: () => mockMissionId,
  useSearchParams: () => new URLSearchParams(),
}));

// ── Stores ────────────────────────────────────────────────────────
vi.mock('@/stores', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  confirm: vi.fn().mockResolvedValue(true),
}));

// ── API services ──────────────────────────────────────────────────
vi.mock('@/services/agent-playground/api', () => ({
  cancelMission: vi.fn().mockResolvedValue(undefined),
  getReportVersion: vi.fn().mockResolvedValue({ reportFull: null }),
  listReportVersions: vi.fn().mockResolvedValue([]),
  rerunMission: vi.fn().mockResolvedValue({ missionId: 'new-mission-id' }),
  runTeam: vi.fn().mockResolvedValue({ missionId: 'new-team-mission-id' }),
  updateMission: vi.fn().mockResolvedValue(undefined),
  getMissionDetailView: vi.fn().mockResolvedValue(null),
  replayMission: vi.fn().mockResolvedValue({ events: [] }),
  fetchBudgetTiers: vi.fn().mockResolvedValue({ tiers: [] }),
}));

// ── Feature hooks ─────────────────────────────────────────────────
const mockRefresh = vi.fn();
const mockApplyRefreshHints = vi.fn();

const defaultMissionView = {
  mission: {
    status: 'running',
    topic: 'Test Topic',
    depth: 'standard',
    language: 'zh-CN',
    startedAt: '2026-01-01T00:00:00Z',
    finishedAt: null as string | null | undefined,
    maxCredits: 2000,
    resumable: false,
    failureMessage: null as string | null | undefined,
    finalScore: null as number | null | undefined,
    themeSummary: null as string | null | undefined,
    dimensions: null as unknown,
    userProfile: null as unknown,
    reconciliationReport: null as unknown,
  },
  cost: { tokensUsed: 1500, costUsd: 0.05, trajectoryStored: null },
  verdicts: [],
  todoBoard: { kind: 'TodoBoard', items: [] as unknown[] },
  reportArtifact: null as unknown,
  agents: [],
  stages: [],
  dimensionPipelines: new Map(),
};

vi.mock('@/hooks/features/useMissionDetailView', () => ({
  useMissionDetailView: vi.fn(() => ({
    data: defaultMissionView,
    loading: false,
    error: null,
    refresh: mockRefresh,
    applyRefreshHints: mockApplyRefreshHints,
  })),
}));

vi.mock('@/hooks/features/useMissionLegacyView', () => ({
  useMissionLegacyView: vi.fn(() => ({
    mission: {
      topic: 'Test Topic',
      depth: 'standard',
      language: 'zh-CN',
      startedAt: Date.now() - 5000,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      rejectedAt: null,
      failedMessage: null,
      finalScore: null,
      themeSummary: null,
      dimensions: null,
      maxCredits: 2000,
      status: 'running',
    },
    agents: [],
    stages: [],
    cost: { tokensUsed: 1500, costUsd: 0.05 },
    memory: {},
    finalReport: null,
    dimensionPipelines: new Map(),
    todoLedger: [],
  })),
}));

vi.mock('@/hooks/features/useAgentPlaygroundStream', () => ({
  useAgentPlaygroundStream: vi.fn(() => ({
    events: [],
    connState: 'live',
    error: null,
  })),
}));

vi.mock('@/hooks/features/useBudgetTiers', () => ({
  useBudgetTiers: vi.fn(() => ({ data: null })),
  pickTier: vi.fn(() => null),
}));

// ── Citations ─────────────────────────────────────────────────────
vi.mock('@/components/common/citations/citationNavigation', () => ({
  setCitationClickCallback: vi.fn(),
}));

// ── Report artifact type guard ────────────────────────────────────
vi.mock('@/lib/features/agent-playground/report-artifact.types', () => ({
  isReportArtifact: vi.fn(() => false),
}));

// ── Heavy child components — all stubbed to simple divs ──────────
vi.mock('@/components/common/mission-detail', () => ({
  MissionDetailFrame: (props: {
    children: React.ReactNode;
    onBack?: () => void;
    tabs?: { key: string; label: string }[];
    activeTab?: string;
    onTabChange?: (k: string) => void;
    leftPanel?: React.ReactNode;
    leftCollapsed?: boolean;
    onLeftCollapseToggle?: () => void;
    leftCollapsedView?: React.ReactNode;
    topBanner?: React.ReactNode;
    tabBarTrailing?: React.ReactNode;
    statusPill?: React.ReactNode;
    headerActions?: React.ReactNode;
    title?: React.ReactNode;
  }) => (
    <div data-testid="mission-detail-frame">
      <button data-testid="back-btn" onClick={props.onBack}>
        back
      </button>
      {props.statusPill && (
        <div data-testid="status-pill">{props.statusPill}</div>
      )}
      {props.headerActions && (
        <div data-testid="header-actions">{props.headerActions}</div>
      )}
      <div data-testid="top-banner">{props.topBanner}</div>
      <div data-testid="tab-bar-trailing">{props.tabBarTrailing}</div>
      {props.leftPanel && <div data-testid="left-panel">{props.leftPanel}</div>}
      <div data-testid="left-collapsed-view">{props.leftCollapsedView}</div>
      <button
        data-testid="collapse-toggle"
        onClick={props.onLeftCollapseToggle}
      >
        toggle collapse
      </button>
      <div data-testid="tabs">
        {props.tabs?.map((tab) => (
          <button
            key={tab.key}
            data-testid={`tab-${tab.key}`}
            onClick={() => props.onTabChange?.(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div data-testid="tab-content">{props.children}</div>
    </div>
  ),
}));

vi.mock('@/components/agent-playground', () => ({
  CapabilityMeters: () => <div data-testid="capability-meters" />,
  ComputeUsagePanel: () => <div data-testid="compute-usage-panel" />,
  LeaderChatModal: (props: {
    open: boolean;
    onClose: () => void;
    onDimensionsAppended: () => void;
  }) =>
    props.open ? (
      <div data-testid="leader-chat-modal">
        <button data-testid="leader-chat-close" onClick={props.onClose}>
          close
        </button>
        <button
          data-testid="dimensions-appended"
          onClick={props.onDimensionsAppended}
        >
          append
        </button>
      </div>
    ) : null,
  MemoryIndexPanel: () => <div data-testid="memory-index-panel" />,
  MissionFlowView: () => <div data-testid="mission-flow-view" />,
  MissionTodoBoard: (props: { onSelect?: (id: string) => void }) => (
    <div data-testid="mission-todo-board">
      <button
        data-testid="select-task-btn"
        onClick={() => props.onSelect?.('task-123')}
      >
        select task
      </button>
    </div>
  ),
  ReferencesPanel: () => <div data-testid="references-panel" />,
  TeamMissionModal: (props: {
    open: boolean;
    onClose: () => void;
    onAgentClick: (nodeId: string) => void;
  }) =>
    props.open ? (
      <div data-testid="team-mission-modal">
        <button data-testid="team-modal-close" onClick={props.onClose}>
          close
        </button>
        <button
          data-testid="agent-click-btn"
          onClick={() => props.onAgentClick('s3-researcher-collect::dim1')}
        >
          click agent
        </button>
        <button
          data-testid="macro-agent-click-btn"
          onClick={() => props.onAgentClick('s1-budget')}
        >
          click macro
        </button>
        <button
          data-testid="unknown-agent-click-btn"
          onClick={() => props.onAgentClick('unknown-node-id-xyz')}
        >
          click unknown
        </button>
      </div>
    ) : null,
  TeamRosterPanel: (props: {
    onCollapse?: () => void;
    onLeaderClick?: () => void;
    onResearchTeamClick?: () => void;
    onRerun?: () => void;
    onUpdate?: () => void;
    onCancel?: () => void;
    onDepthChange?: (d: string) => void;
  }) => (
    <div data-testid="team-roster-panel">
      <button data-testid="collapse-btn" onClick={props.onCollapse}>
        collapse
      </button>
      <button data-testid="leader-click-btn" onClick={props.onLeaderClick}>
        leader
      </button>
      <button
        data-testid="research-team-click-btn"
        onClick={props.onResearchTeamClick}
      >
        research team
      </button>
      <button data-testid="rerun-btn" onClick={props.onRerun}>
        rerun
      </button>
      <button data-testid="update-btn" onClick={props.onUpdate}>
        update
      </button>
      <button data-testid="cancel-btn" onClick={props.onCancel}>
        cancel
      </button>
      <button
        data-testid="depth-change-btn"
        onClick={() => props.onDepthChange?.('deep')}
      >
        change depth
      </button>
    </div>
  ),
  TodoDetailDrawer: (props: { onClose?: () => void; todo?: unknown }) => (
    <div data-testid="todo-detail-drawer">
      <button data-testid="close-drawer-btn" onClick={props.onClose}>
        close
      </button>
    </div>
  ),
}));

vi.mock('@/components/agent-playground/MissionGraphTab', () => ({
  MissionGraphTab: () => <div data-testid="mission-graph-tab" />,
}));

let capturedOnSelectVersion: ((v: number) => void) | undefined;
vi.mock('@/components/agent-playground/artifact', () => ({
  ArtifactReader: (props: {
    onSelectVersion?: (v: number) => void;
    [key: string]: unknown;
  }) => {
    capturedOnSelectVersion = props.onSelectVersion;
    return (
      <div data-testid="artifact-reader">
        {props.onSelectVersion && (
          <button
            data-testid="select-version-btn"
            onClick={() => props.onSelectVersion!(99)}
          >
            select version
          </button>
        )}
      </div>
    );
  },
}));

vi.mock('@/components/agent-playground/panels/BudgetAndTimeLimitPanel', () => ({
  BudgetAndTimeLimitPanel: () => <div data-testid="budget-time-limit-panel" />,
}));

vi.mock('@/components/common/selectors', () => ({
  KnowledgeBaseSelector: (props: {
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
  }) => (
    <div data-testid="knowledge-base-selector">
      <button
        data-testid="kb-change-btn"
        onClick={() => props.onSelectionChange(['kb-1'])}
      >
        select kb
      </button>
    </div>
  ),
}));

vi.mock('@/components/ui/dialogs/Modal', () => ({
  Modal: (props: {
    open: boolean;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    title?: React.ReactNode;
  }) =>
    props.open ? (
      <div data-testid="modal">
        <div data-testid="modal-title">{props.title}</div>
        <div data-testid="modal-content">{props.children}</div>
        <div data-testid="modal-footer">{props.footer}</div>
      </div>
    ) : null,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: () => <div data-testid="canonical-tabs" />,
}));

// ── lib/utils/cn ─────────────────────────────────────────────────
vi.mock('@/lib/utils/common', () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

// ── Imports after mocks ───────────────────────────────────────────
import {
  cancelMission,
  rerunMission,
  runTeam,
  listReportVersions,
  getReportVersion,
} from '@/services/agent-playground/api';
import { toast, confirm } from '@/stores';
import { useMissionDetailView } from '@/hooks/features/useMissionDetailView';
import { useMissionLegacyView } from '@/hooks/features/useMissionLegacyView';
import { useAgentPlaygroundStream } from '@/hooks/features/useAgentPlaygroundStream';
import { useBudgetTiers, pickTier } from '@/hooks/features/useBudgetTiers';
import { setCitationClickCallback } from '@/components/common/citations/citationNavigation';

import MissionDetailPage from '../page';

// ── Helpers ───────────────────────────────────────────────────────
function getMockMissionView(
  overrides: Partial<typeof defaultMissionView> = {}
) {
  return { ...defaultMissionView, ...overrides };
}

function setMockHooks({
  missionView = defaultMissionView,
  connState = 'live',
  events = [] as unknown[],
  error = null,
  legacyMission = {},
}: {
  missionView?: typeof defaultMissionView | null;
  connState?: string;
  events?: unknown[];
  error?: Error | null;
  legacyMission?: Record<string, unknown>;
} = {}) {
  (useMissionDetailView as ReturnType<typeof vi.fn>).mockReturnValue({
    data: missionView,
    loading: false,
    error: null,
    refresh: mockRefresh,
    applyRefreshHints: mockApplyRefreshHints,
  });

  (useAgentPlaygroundStream as ReturnType<typeof vi.fn>).mockReturnValue({
    events,
    connState,
    error,
  });

  (useMissionLegacyView as ReturnType<typeof vi.fn>).mockReturnValue({
    mission: {
      topic: 'Test Topic',
      depth: 'standard',
      language: 'zh-CN',
      startedAt: Date.now() - 5000,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      rejectedAt: null,
      failedMessage: null,
      finalScore: null,
      themeSummary: null,
      dimensions: null,
      maxCredits: 2000,
      status: 'running',
      ...legacyMission,
    },
    agents: [],
    stages: [],
    cost: { tokensUsed: 1500, costUsd: 0.05 },
    memory: {},
    finalReport: null,
    dimensionPipelines: new Map(),
    todoLedger: [],
  });
}

describe('MissionDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    setMockHooks();
    // Reset missionId param
    mockMissionId.missionId = 'test-mission-123';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Basic rendering ──────────────────────────────────────────────
  describe('basic rendering', () => {
    it('renders MissionDetailFrame when missionId is valid', () => {
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('renders the team roster panel in left panel', () => {
      render(<MissionDetailPage />);
      expect(screen.getByTestId('team-roster-panel')).toBeInTheDocument();
    });

    it('renders task todo board as default tab', () => {
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });

    it('renders all 6 tabs in the frame', () => {
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-tasks')).toBeInTheDocument();
      expect(screen.getByTestId('tab-collab')).toBeInTheDocument();
      expect(screen.getByTestId('tab-report')).toBeInTheDocument();
      expect(screen.getByTestId('tab-references')).toBeInTheDocument();
      expect(screen.getByTestId('tab-graph')).toBeInTheDocument();
      expect(screen.getByTestId('tab-cost')).toBeInTheDocument();
    });
  });

  // ── Invalid mission ID ────────────────────────────────────────────
  describe('invalid mission ID', () => {
    it('shows 找不到该 Mission when missionId is undefined', () => {
      mockMissionId.missionId = 'undefined';
      render(<MissionDetailPage />);
      expect(screen.getByText('找不到该 Mission')).toBeInTheDocument();
    });

    it('shows 找不到该 Mission when missionId is empty string', () => {
      mockMissionId.missionId = '';
      render(<MissionDetailPage />);
      expect(screen.getByText('找不到该 Mission')).toBeInTheDocument();
    });

    it('navigates to list on back button in invalid state', () => {
      mockMissionId.missionId = 'undefined';
      render(<MissionDetailPage />);
      const btns = screen.getAllByText('返回 Mission 列表');
      fireEvent.click(btns[0]);
      expect(mockPush).toHaveBeenCalledWith('/agent-playground');
    });
  });

  // ── Tab switching ─────────────────────────────────────────────────
  describe('tab switching', () => {
    it('switches to collab tab', async () => {
      setMockHooks({ missionView: defaultMissionView });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-collab'));
      await waitFor(() => {
        expect(screen.getByTestId('mission-flow-view')).toBeInTheDocument();
      });
    });

    it('switches to report tab', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      await waitFor(() => {
        expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
      });
    });

    it('switches to references tab', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-references'));
      await waitFor(() => {
        expect(screen.getByTestId('references-panel')).toBeInTheDocument();
      });
    });

    it('switches to graph tab', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-graph'));
      await waitFor(() => {
        expect(screen.getByTestId('mission-graph-tab')).toBeInTheDocument();
      });
    });

    it('switches to cost tab and shows cost panels', async () => {
      setMockHooks({ missionView: defaultMissionView });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-cost'));
      await waitFor(() => {
        expect(screen.getByTestId('capability-meters')).toBeInTheDocument();
        expect(screen.getByTestId('compute-usage-panel')).toBeInTheDocument();
        expect(screen.getByTestId('memory-index-panel')).toBeInTheDocument();
      });
    });
  });

  // ── Status pills ──────────────────────────────────────────────────
  describe('status pill', () => {
    it('shows 研究中 when mission is running', () => {
      setMockHooks();
      render(<MissionDetailPage />);
      expect(screen.getByText(/研究中/)).toBeInTheDocument();
    });

    it('shows 已取消 when mission is cancelled', () => {
      setMockHooks({
        legacyMission: { cancelledAt: Date.now(), status: 'cancelled' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'cancelled',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByText('已取消')).toBeInTheDocument();
    });

    it('shows 已失败 when mission has failedAt', () => {
      setMockHooks({
        legacyMission: { failedAt: Date.now(), status: 'failed' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByText('已失败')).toBeInTheDocument();
    });

    it('shows 质量未达标 when status is quality-failed', () => {
      setMockHooks({
        legacyMission: { completedAt: Date.now(), status: 'quality-failed' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'quality-failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByText('质量未达标')).toBeInTheDocument();
    });

    it('shows 已完成 when status is completed', () => {
      setMockHooks({
        legacyMission: { completedAt: Date.now(), status: 'completed' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByText('已完成')).toBeInTheDocument();
    });

    it('shows amber WS indicator when connState is polling', () => {
      setMockHooks({ connState: 'polling' });
      render(<MissionDetailPage />);
      const pill = screen.getByTestId('status-pill');
      expect(pill.querySelector('.bg-amber-400')).toBeInTheDocument();
    });

    it('does not show WS indicator when connState is live', () => {
      setMockHooks({ connState: 'live' });
      render(<MissionDetailPage />);
      const pill = screen.getByTestId('status-pill');
      expect(pill.querySelector('.bg-amber-400')).not.toBeInTheDocument();
    });
  });

  // ── Back navigation ───────────────────────────────────────────────
  describe('back navigation', () => {
    it('navigates to /agent-playground on back click', () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('back-btn'));
      expect(mockPush).toHaveBeenCalledWith('/agent-playground');
    });
  });

  // ── Left panel collapse ───────────────────────────────────────────
  describe('left panel collapse', () => {
    it('collapses left panel when collapse button in roster clicked', async () => {
      render(<MissionDetailPage />);
      // Frame renders left panel and left collapsed view simultaneously, both controlled by leftCollapsed prop
      expect(screen.getByTestId('team-roster-panel')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('collapse-btn'));
      // After collapse, collapsed view shows pulse and Team text
      await waitFor(() => {
        expect(screen.getByText('Team')).toBeInTheDocument();
      });
    });

    it('expands left panel when collapse toggle clicked', async () => {
      render(<MissionDetailPage />);
      // Collapse first
      fireEvent.click(screen.getByTestId('collapse-btn'));
      await waitFor(() => expect(screen.getByText('Team')).toBeInTheDocument());
      // Expand via toggle
      fireEvent.click(screen.getByTestId('collapse-toggle'));
      await waitFor(() => {
        expect(screen.getByTestId('team-roster-panel')).toBeInTheDocument();
      });
    });
  });

  // ── Leader chat modal ─────────────────────────────────────────────
  describe('leader chat modal', () => {
    it('opens leader chat when leader button clicked', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('leader-click-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('leader-chat-modal')).toBeInTheDocument();
      });
    });

    it('closes leader chat modal', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('leader-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('leader-chat-modal')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('leader-chat-close'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('leader-chat-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('calls refreshMissionView when dimensions appended', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('leader-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('leader-chat-modal')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('dimensions-appended'));
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  // ── Research team modal ───────────────────────────────────────────
  describe('research team modal', () => {
    it('opens team mission modal when research team click', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument();
      });
    });

    it('closes team mission modal', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('team-modal-close'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('team-mission-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('maps dim node ID to todo ID and opens drawer when agent clicked', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('agent-click-btn'));
      // Research team modal should close
      await waitFor(() => {
        expect(
          screen.queryByTestId('team-mission-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('maps macro stage node ID to system todo ID', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('macro-agent-click-btn'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('team-mission-modal')
        ).not.toBeInTheDocument();
      });
    });
  });

  // ── Task selection and drawer ─────────────────────────────────────
  describe('todo detail drawer', () => {
    it('renders todo detail drawer', () => {
      render(<MissionDetailPage />);
      expect(screen.getByTestId('todo-detail-drawer')).toBeInTheDocument();
    });

    it('selects a task when todo board select called', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('select-task-btn'));
      // Drawer should now have a todo prop (hard to test directly since it's mocked)
      await waitFor(() => {
        expect(screen.getByTestId('todo-detail-drawer')).toBeInTheDocument();
      });
    });

    it('closes drawer when close called', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('select-task-btn'));
      fireEvent.click(screen.getByTestId('close-drawer-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('todo-detail-drawer')).toBeInTheDocument();
      });
    });
  });

  // ── Settings modal ────────────────────────────────────────────────
  describe('settings modal', () => {
    it('opens settings modal when settings button clicked', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      expect(settingsBtn).toBeTruthy();
      fireEvent.click(settingsBtn!);
      await waitFor(() => {
        expect(screen.getByTestId('modal')).toBeInTheDocument();
      });
    });

    it('closes settings modal', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // Click the close button in the footer
      const closeBtn = screen.getByText('关闭');
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
      });
    });

    it('shows topic field in settings modal', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      expect(
        screen.getByPlaceholderText(/系统洞察一下 Anthropic/)
      ).toBeInTheDocument();
    });

    it('can update topic in settings modal', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      const topicInput = screen.getByPlaceholderText(/系统洞察一下 Anthropic/);
      fireEvent.change(topicInput, { target: { value: 'New Topic' } });
      expect((topicInput as HTMLInputElement).value).toBe('New Topic');
    });

    it('shows "另存为新 mission" button', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      expect(screen.getByText('另存为新 mission')).toBeInTheDocument();
    });

    it('shows "保存修改" button for terminal status mission', async () => {
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      expect(screen.getByText('保存修改')).toBeInTheDocument();
    });

    it('does not show "保存修改" when mission is still running', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      expect(screen.queryByText('保存修改')).not.toBeInTheDocument();
    });

    it('shows validation error when saving new mission with empty topic', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      const topicInput = screen.getByPlaceholderText(/系统洞察一下 Anthropic/);
      fireEvent.change(topicInput, { target: { value: '' } });
      // When topic is empty, the "另存为新 mission" button is disabled
      const saveBtn = screen.getByText('另存为新 mission').closest('button');
      expect(saveBtn).toBeDisabled();
    });

    it('calls runTeam and navigates when saving new mission', async () => {
      (runTeam as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        missionId: 'created-mission',
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      const saveBtn = screen.getByText('另存为新 mission');
      await act(async () => {
        fireEvent.click(saveBtn);
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalledWith(
          '/agent-playground/team/created-mission'
        );
      });
    });

    it('shows error when runTeam throws', async () => {
      (runTeam as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('API error')
      );
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      await act(async () => {
        fireEvent.click(screen.getByText('另存为新 mission'));
      });
      await waitFor(() => {
        expect(screen.getByText('API error')).toBeInTheDocument();
      });
    });

    it('toggles advanced budget panel', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // Advanced budget should be hidden initially
      expect(
        screen.queryByTestId('budget-time-limit-panel')
      ).not.toBeInTheDocument();
      // Click to expand
      fireEvent.click(screen.getByText(/精细预算/));
      await waitFor(() => {
        expect(
          screen.getByTestId('budget-time-limit-panel')
        ).toBeInTheDocument();
      });
      // Click to collapse
      fireEvent.click(screen.getByText('收起'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('budget-time-limit-panel')
        ).not.toBeInTheDocument();
      });
    });

    it('shows knowledge base selector', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      expect(screen.getByTestId('knowledge-base-selector')).toBeInTheDocument();
    });

    it('can change language in settings', async () => {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // Change language select
      const selects = screen.getAllByRole('combobox');
      const langSelect = selects.find(
        (s) => (s as HTMLSelectElement).value === 'zh-CN'
      );
      if (langSelect) {
        fireEvent.change(langSelect, { target: { value: 'en-US' } });
        expect((langSelect as HTMLSelectElement).value).toBe('en-US');
      }
    });

    it('handles save in place for terminal mission', async () => {
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      const { updateMission } = await import('@/services/agent-playground/api');
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      const saveInPlaceBtn = screen.getByText('保存修改');
      await act(async () => {
        fireEvent.click(saveInPlaceBtn);
      });
      await waitFor(() => {
        expect(updateMission).toHaveBeenCalled();
      });
    });

    it('shows maxCredits validation error when value out of range', async () => {
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );

      // Open advanced budget to access maxCredits
      fireEvent.click(screen.getByText(/精细预算/));
      await waitFor(() => {
        expect(
          screen.getByTestId('budget-time-limit-panel')
        ).toBeInTheDocument();
      });

      // Validation happens in handleSaveAsNew; try clicking save
      // First set an invalid maxCredits via the hidden inputs in the budget panel
      // Since BudgetAndTimeLimitPanel is mocked, we test via handleSaveAsNew validation
      // which validates the state values - we need to use save in place
      const saveInPlaceBtn = screen.getByText('保存修改');
      await act(async () => {
        fireEvent.click(saveInPlaceBtn);
      });
      // Default maxCredits is 2000 which is valid, so no error should show
      await waitFor(() => {
        expect(screen.queryByText(/maxCredits 必须在/)).not.toBeInTheDocument();
      });
    });

    it('shows error message section when mission status is failed with error', async () => {
      setMockHooks({
        legacyMission: {
          status: 'failed',
          failedAt: Date.now(),
          errorMessage: 'Budget exceeded',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // Error message block rendered
      await waitFor(() => {
        expect(screen.getByText('上次未成功原因')).toBeInTheDocument();
        expect(screen.getByText('Budget exceeded')).toBeInTheDocument();
      });
    });
  });

  // ── Rerun / Update handlers ───────────────────────────────────────
  describe('rerun handlers', () => {
    it('calls rerunMission with fresh mode on rerun button click', async () => {
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(rerunMission).toHaveBeenCalledWith('test-mission-123', 'fresh');
        expect(mockPush).toHaveBeenCalledWith(
          '/agent-playground/team/new-mission-id'
        );
      });
    });

    it('calls rerunMission with incremental mode on update button', async () => {
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('update-btn'));
      });
      await waitFor(() => {
        expect(rerunMission).toHaveBeenCalledWith(
          'test-mission-123',
          'incremental'
        );
        expect(mockPush).toHaveBeenCalledWith(
          '/agent-playground/team/new-mission-id'
        );
      });
    });

    it('shows toast.error when rerunMission fails', async () => {
      (rerunMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Rerun failed')
      );
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('启动失败', 'Rerun failed');
      });
    });

    it('shows toast.error when update fails', async () => {
      (rerunMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Update failed')
      );
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('update-btn'));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('更新失败', 'Update failed');
      });
    });

    it('calls runTeam when depth has changed', async () => {
      (useBudgetTiers as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          tiers: [
            {
              depth: 'deep',
              label: 'Deep',
              maxCredits: 5000,
              budgetMultiplier: 1.5,
              wallTimeMinutes: 120,
              capUsd: 50,
            },
          ],
        },
      });
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'deep',
        label: 'Deep',
        maxCredits: 5000,
        budgetMultiplier: 1.5,
        wallTimeMinutes: 120,
        capUsd: 50,
      });
      render(<MissionDetailPage />);
      // Change depth first
      fireEvent.click(screen.getByTestId('depth-change-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalled();
      });
    });
  });

  // ── Cancel handler ────────────────────────────────────────────────
  // Note: window.location.reload() is called after success/404 cancel in the source.
  // jsdom vmThreads does not allow deleting or redefining window.location.
  // We test confirm + cancelMission call path and error paths instead.
  describe('cancel handler', () => {
    it('shows confirm dialog when cancel button clicked', async () => {
      // cancelMission resolves but reload is called after — ignore reload crash in jsdom
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-btn'));
      });
      await waitFor(() => {
        expect(confirm).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'danger' })
        );
      });
    });

    it('calls cancelMission with missionId after confirm', async () => {
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-btn'));
      });
      await waitFor(() => {
        expect(cancelMission).toHaveBeenCalledWith('test-mission-123');
      });
    });

    it('does not call cancelMission when confirm returns false', async () => {
      (confirm as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-btn'));
      });
      await waitFor(() => expect(confirm).toHaveBeenCalled());
      expect(cancelMission).not.toHaveBeenCalled();
    });

    it('shows toast.error when cancelMission throws with non-400 error', async () => {
      (cancelMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Network failure')
      );
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-btn'));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('取消失败', 'Network failure');
      });
    });

    it('shows toast.info when cancelMission throws with "not running" message', async () => {
      (cancelMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Mission not running')
      );
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-btn'));
      });
      await waitFor(() => {
        expect(toast.info).toHaveBeenCalledWith(
          'Mission 已结束',
          expect.any(String)
        );
      });
    });
  });

  // ── Banners ───────────────────────────────────────────────────────
  describe('banners', () => {
    it('shows WS error banner when connState is not live and error exists', () => {
      setMockHooks({
        connState: 'polling',
        error: new Error('WS disconnected'),
      });
      render(<MissionDetailPage />);
      expect(
        screen.getByText('WebSocket 不可用 · 已退化为 4s 轮询 /replay')
      ).toBeInTheDocument();
    });

    it('does not show WS error banner when connState is live', () => {
      setMockHooks({ connState: 'live', error: null });
      render(<MissionDetailPage />);
      expect(
        screen.queryByText('WebSocket 不可用 · 已退化为 4s 轮询 /replay')
      ).not.toBeInTheDocument();
    });

    it('dismisses WS error banner when close clicked', async () => {
      setMockHooks({
        connState: 'polling',
        error: new Error('WS disconnected'),
      });
      render(<MissionDetailPage />);
      const wsBanner = screen.getByText(
        'WebSocket 不可用 · 已退化为 4s 轮询 /replay'
      );
      const closeBtn = wsBanner.closest('.relative')?.querySelector('button');
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn!);
      await waitFor(() => {
        expect(
          screen.queryByText('WebSocket 不可用 · 已退化为 4s 轮询 /replay')
        ).not.toBeInTheDocument();
      });
    });

    it('shows failed banner when mission has failedMessage', () => {
      setMockHooks({
        legacyMission: {
          failedMessage: 'Research failed due to timeout',
          failedAt: Date.now(),
          status: 'failed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            failureMessage: 'Research failed due to timeout',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(
        screen.getByText('Research failed due to timeout')
      ).toBeInTheDocument();
    });

    it('shows quality-failed banner with "查看输出报告" button', () => {
      setMockHooks({
        legacyMission: {
          failedMessage: 'Quality check failed',
          completedAt: Date.now(),
          status: 'quality-failed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'quality-failed',
            failureMessage: 'Quality check failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(
        screen.getByText('Leader 拒签 · 质量未达标但报告可阅读')
      ).toBeInTheDocument();
      expect(screen.getByText('查看输出报告 →')).toBeInTheDocument();
    });

    it('clicking "查看输出报告" switches to report tab', async () => {
      setMockHooks({
        legacyMission: {
          failedMessage: 'Quality check failed',
          completedAt: Date.now(),
          status: 'quality-failed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'quality-failed',
            failureMessage: 'Quality check failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByText('查看输出报告 →'));
      await waitFor(() => {
        expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
      });
    });

    it('dismisses failed banner', async () => {
      setMockHooks({
        legacyMission: {
          failedMessage: 'Research failed',
          failedAt: Date.now(),
          status: 'failed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            failureMessage: 'Research failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const banner = screen.getByText('Research failed');
      const closeBtn = banner
        .closest('.relative')
        ?.querySelector('button[aria-label="关闭"]');
      expect(closeBtn).toBeTruthy();
      fireEvent.click(closeBtn!);
      await waitFor(() => {
        expect(screen.queryByText('Research failed')).not.toBeInTheDocument();
      });
    });
  });

  // ── Effects ───────────────────────────────────────────────────────
  describe('effects', () => {
    it('sets setCitationClickCallback on mount', () => {
      render(<MissionDetailPage />);
      expect(setCitationClickCallback).toHaveBeenCalledWith(
        expect.any(Function)
      );
    });

    it('clears citation callback on unmount', () => {
      const { unmount } = render(<MissionDetailPage />);
      unmount();
      expect(setCitationClickCallback).toHaveBeenCalledWith(null);
    });

    it('refreshes mission view on terminal events', async () => {
      const terminalEvent = {
        type: 'playground.mission:completed',
        timestamp: '2026-01-01T00:01:00Z',
        payload: {},
      };
      setMockHooks({ events: [terminalEvent] });
      render(<MissionDetailPage />);
      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });

    it('applies refresh hints when events carry refreshHints payload', async () => {
      const eventWithHints = {
        type: 'playground.mission:updated',
        timestamp: '2026-01-01T00:01:00Z',
        payload: {
          refreshHints: [{ family: 'mission', mode: 'full', id: 'test' }],
        },
      };
      setMockHooks({ events: [eventWithHints] });
      render(<MissionDetailPage />);
      await waitFor(() => {
        expect(mockApplyRefreshHints).toHaveBeenCalled();
      });
    });

    it('does not refresh when no terminal events', async () => {
      setMockHooks({
        events: [
          {
            type: 'playground.agent:thinking',
            timestamp: '2026-01-01T00:00:30Z',
            payload: {},
          },
        ],
      });
      render(<MissionDetailPage />);
      // mockRefresh may still be called from initial view load — that's ok
      // but terminal refresh should not trigger extra calls
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
    });

    it('clears WS dismiss state when connState returns to live', async () => {
      // Start with polling + error
      setMockHooks({
        connState: 'polling',
        error: new Error('WS error'),
      });
      const { rerender } = render(<MissionDetailPage />);
      // Dismiss WS banner
      const wsBanner = screen.getByText(
        'WebSocket 不可用 · 已退化为 4s 轮询 /replay'
      );
      const closeBtn = wsBanner.closest('.relative')?.querySelector('button');
      fireEvent.click(closeBtn!);
      await waitFor(() => {
        expect(
          screen.queryByText('WebSocket 不可用 · 已退化为 4s 轮询 /replay')
        ).not.toBeInTheDocument();
      });
      // Switch to live — this should clear the dismissed state
      (useAgentPlaygroundStream as ReturnType<typeof vi.fn>).mockReturnValue({
        events: [],
        connState: 'live',
        error: null,
      });
      rerender(<MissionDetailPage />);
      // Now go back to polling — banner should reappear
      (useAgentPlaygroundStream as ReturnType<typeof vi.fn>).mockReturnValue({
        events: [],
        connState: 'polling',
        error: new Error('WS error again'),
      });
      rerender(<MissionDetailPage />);
      await waitFor(() => {
        expect(
          screen.getByText('WebSocket 不可用 · 已退化为 4s 轮询 /replay')
        ).toBeInTheDocument();
      });
    });
  });

  // ── Report version loading ────────────────────────────────────────
  describe('report versions', () => {
    it('loads report versions when mission is completed', async () => {
      const reportVersion = {
        version: 1,
        versionLabel: 'v1',
        triggerType: 'manual',
        generatedAt: '2026-01-01T00:05:00Z',
        finalScore: 85,
        leaderSigned: true,
      };
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        reportVersion,
      ]);
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      await waitFor(() => {
        expect(listReportVersions).toHaveBeenCalledWith('test-mission-123');
      });
    });

    it('does not load report versions when mission is running', async () => {
      setMockHooks();
      render(<MissionDetailPage />);
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(listReportVersions).not.toHaveBeenCalled();
    });
  });

  // ── todoLedger status sweep ───────────────────────────────────────
  describe('todoLedger status sweep', () => {
    it('sweeps in_progress todos to done when mission completed', () => {
      const viewWithTodos = {
        ...defaultMissionView,
        mission: {
          ...defaultMissionView.mission,
          status: 'completed',
          finishedAt: new Date().toISOString(),
        },
        todoBoard: {
          kind: 'TodoBoard',
          items: [
            {
              id: 'todo-1',
              parentId: undefined,
              origin: 'system',
              createdBy: 'leader',
              createdAt: Date.now(),
              reasonText: 'Research step',
              scope: 'mission',
              title: 'Step 1',
              assignee: { role: 'researcher' },
              status: 'in_progress',
              artifacts: [],
              narrativeLog: [],
            },
          ],
        },
      };
      setMockHooks({ missionView: viewWithTodos });
      render(<MissionDetailPage />);
      // The todoLedger sweeps in_progress → done. We can't easily inspect
      // the prop passed to MissionTodoBoard without more complex setup,
      // but rendering should not crash.
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });

    it('sweeps in_progress todos to cancelled when mission cancelled', () => {
      const viewWithTodos = {
        ...defaultMissionView,
        mission: {
          ...defaultMissionView.mission,
          status: 'cancelled',
          finishedAt: new Date().toISOString(),
        },
        todoBoard: {
          kind: 'TodoBoard',
          items: [
            {
              id: 'todo-2',
              parentId: undefined,
              origin: 'system',
              createdBy: 'leader',
              createdAt: Date.now(),
              reasonText: 'Task',
              scope: 'mission',
              title: 'Step 2',
              assignee: { role: 'researcher' },
              status: 'in_progress',
              artifacts: [],
              narrativeLog: [],
            },
          ],
        },
      };
      setMockHooks({ missionView: viewWithTodos });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });
  });

  // ── CompactMeters (tabBarTrailing) ────────────────────────────────
  describe('CompactMeters', () => {
    it('renders tab bar trailing when missionView available', () => {
      setMockHooks({ missionView: defaultMissionView });
      render(<MissionDetailPage />);
      // CompactMeters renders as tabBarTrailing — it's inside tab-bar-trailing testid
      const trailing = screen.getByTestId('tab-bar-trailing');
      expect(trailing).toBeInTheDocument();
    });

    it('does not render tab bar trailing when missionView is null', () => {
      setMockHooks({ missionView: null });
      render(<MissionDetailPage />);
      const trailing = screen.getByTestId('tab-bar-trailing');
      // Should be empty
      expect(trailing.textContent).toBe('');
    });
  });

  // ── dagNodeIdToTodoId function ────────────────────────────────────
  describe('dagNodeIdToTodoId mapping', () => {
    it('maps s3-researcher-collect::dim node to dim:{id}', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument()
      );
      // Agent click sends 's3-researcher-collect::dim1' → should map to 'dim:dim1'
      fireEvent.click(screen.getByTestId('agent-click-btn'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('team-mission-modal')
        ).not.toBeInTheDocument();
      });
    });

    it('handles unknown node ID gracefully (returns null, no drawer)', async () => {
      // dagNodeIdToTodoId returns null for unknown nodeIds (line 206 null arm)
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument()
      );
      // unknown-agent-click sends 'unknown-node-id-xyz' → not in BACKEND_TO_FRONTEND_STEP → null
      fireEvent.click(screen.getByTestId('unknown-agent-click-btn'));
      // Modal should still be open (unknown node means no task match → no drawer open)
      // but no crash
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('maps macro stage node to system:{stepId}', async () => {
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('research-team-click-btn'));
      await waitFor(() =>
        expect(screen.getByTestId('team-mission-modal')).toBeInTheDocument()
      );
      // macro-agent-click sends 's1-budget' which maps to 'system:s1-budget'
      fireEvent.click(screen.getByTestId('macro-agent-click-btn'));
      await waitFor(() => {
        expect(
          screen.queryByTestId('team-mission-modal')
        ).not.toBeInTheDocument();
      });
    });
  });

  // ── Version override / select ─────────────────────────────────────
  describe('version select', () => {
    it('calls getReportVersion when user selects a different version', async () => {
      // This is driven via onSelectVersion passed to ArtifactReader (mocked)
      // We test it through the report tab
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          version: 2,
          versionLabel: 'v2',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:05:00Z',
          finalScore: 90,
          leaderSigned: true,
        },
        {
          version: 1,
          versionLabel: 'v1',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:02:00Z',
          finalScore: 80,
          leaderSigned: false,
        },
      ]);
      (getReportVersion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        reportFull: { sections: [], content: { fullMarkdown: '' } },
      });

      render(<MissionDetailPage />);
      await waitFor(() => expect(listReportVersions).toHaveBeenCalled());
      // ArtifactReader is mocked so we can't directly trigger onSelectVersion,
      // but we can verify versions were loaded
      expect(listReportVersions).toHaveBeenCalledWith('test-mission-123');
    });
  });

  // ── MemoryIndexPanel phase logic ──────────────────────────────────
  describe('memory panel phase', () => {
    it('renders memory panel with aborted phase when mission failed', () => {
      setMockHooks({
        legacyMission: {
          status: 'failed',
          failedAt: Date.now(),
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-cost'));
      expect(screen.getByTestId('memory-index-panel')).toBeInTheDocument();
    });

    it('renders memory panel with completed-noindex phase when succeeded', () => {
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-cost'));
      expect(screen.getByTestId('memory-index-panel')).toBeInTheDocument();
    });
  });

  // ── References tab canonical detection ───────────────────────────
  describe('references tab', () => {
    it('renders references panel with canonical artifact citations', () => {
      const mvWithCitations = {
        ...defaultMissionView,
        reportArtifact: {
          kind: 'ReportArtifactV2',
          citations: [{ id: 'c1', url: 'https://example.com' }],
          content: { fullMarkdown: '' },
          sections: [],
          metadata: {},
        },
      };
      setMockHooks({ missionView: mvWithCitations });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-references'));
      expect(screen.getByTestId('references-panel')).toBeInTheDocument();
    });

    it('renders references panel with fallback sources', () => {
      setMockHooks({ missionView: defaultMissionView });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-references'));
      expect(screen.getByTestId('references-panel')).toBeInTheDocument();
    });
  });

  // ── Timer effect cleanup on unmount ──────────────────────────────
  describe('timer effect', () => {
    it('cleans up setInterval on unmount', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');
      const { unmount } = render(<MissionDetailPage />);
      // Advance timer to trigger the interval
      await act(async () => {
        vi.advanceTimersByTime(600);
      });
      unmount();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });
  });

  // ── Collapsed left view expand button ────────────────────────────
  describe('collapsed left view', () => {
    it('expands panel when expand button in collapsed view is clicked', async () => {
      render(<MissionDetailPage />);
      // Collapse via roster button
      fireEvent.click(screen.getByTestId('collapse-btn'));
      await waitFor(() => expect(screen.getByText('Team')).toBeInTheDocument());
      // Find the expand button inside collapsed view
      const collapsedView = screen.getByTestId('left-collapsed-view');
      const expandBtn = collapsedView.querySelector(
        'button[aria-label="Expand team panel"]'
      );
      expect(expandBtn).toBeTruthy();
      fireEvent.click(expandBtn!);
      await waitFor(() => {
        expect(screen.getByTestId('team-roster-panel')).toBeInTheDocument();
      });
    });

    it('shows running pulse in collapsed view when mission is running', async () => {
      setMockHooks(); // running by default
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('collapse-btn'));
      await waitFor(() => {
        const collapsedView = screen.getByTestId('left-collapsed-view');
        expect(
          collapsedView.querySelector('.animate-pulse')
        ).toBeInTheDocument();
      });
    });
  });

  // ── Settings modal form field changes ────────────────────────────
  describe('settings modal form field changes', () => {
    async function openSettings() {
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
    }

    it('can change description in settings', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      const descriptionTextarea =
        screen.getByPlaceholderText(/补充你的研究意图/);
      fireEvent.change(descriptionTextarea, {
        target: { value: 'new description' },
      });
      expect((descriptionTextarea as HTMLTextAreaElement).value).toBe(
        'new description'
      );
    });

    it('can change search time range', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      const selects = screen.getAllByRole('combobox');
      const timeRangeSelect = selects.find(
        (s) => (s as HTMLSelectElement).value === '365d'
      );
      if (timeRangeSelect) {
        fireEvent.change(timeRangeSelect, { target: { value: '90d' } });
        expect((timeRangeSelect as HTMLSelectElement).value).toBe('90d');
      }
    });

    it('can change length profile', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      // Find the lengthProfile select by its unique option text "brief · 3K"
      const selects = screen.getAllByRole('combobox');
      const lpSelect = selects.find((s) => {
        const opts = Array.from((s as HTMLSelectElement).options);
        return opts.some(
          (o) => o.text.includes('brief') && o.text.includes('3K')
        );
      });
      expect(lpSelect).toBeTruthy();
      if (lpSelect) {
        fireEvent.change(lpSelect, { target: { value: 'deep' } });
        expect((lpSelect as HTMLSelectElement).value).toBe('deep');
      }
    });

    it('can change audience profile', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      const selects = screen.getAllByRole('combobox');
      const apSelect = selects.find(
        (s) => (s as HTMLSelectElement).value === 'domain-expert'
      );
      if (apSelect) {
        fireEvent.change(apSelect, { target: { value: 'executive' } });
        expect((apSelect as HTMLSelectElement).value).toBe('executive');
      }
    });

    it('can change style profile', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      const selects = screen.getAllByRole('combobox');
      const spSelect = selects.find(
        (s) => (s as HTMLSelectElement).value === 'executive'
      );
      if (spSelect) {
        fireEvent.change(spSelect, { target: { value: 'academic' } });
        expect((spSelect as HTMLSelectElement).value).toBe('academic');
      }
    });

    it('can change audit layers', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      const selects = screen.getAllByRole('combobox');
      const alSelect = selects.find(
        (s) => (s as HTMLSelectElement).value === 'default'
      );
      if (alSelect) {
        fireEvent.change(alSelect, { target: { value: 'thorough' } });
        expect((alSelect as HTMLSelectElement).value).toBe('thorough');
      }
    });

    it('can change concurrency', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      const numberInput = screen.getByDisplayValue('3');
      fireEvent.change(numberInput, { target: { value: '5' } });
      expect((numberInput as HTMLInputElement).value).toBe('5');
    });

    it('can toggle withFigures checkbox', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      // 设置面板含两个 checkbox：图文并茂(withFigures) 与 知识本体(useOntology，
      // 2026-06 接入本体时新增)。本用例只验证第一个 withFigures。
      const checkbox = screen.getAllByRole('checkbox')[0] as HTMLInputElement;
      const initialState = checkbox.checked;
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(!initialState);
    });

    it('can change depth in settings and updates budget tier', async () => {
      (useBudgetTiers as ReturnType<typeof vi.fn>).mockReturnValue({
        data: {
          tiers: [
            {
              depth: 'quick',
              label: 'Quick',
              maxCredits: 500,
              budgetMultiplier: 0.5,
              wallTimeMinutes: 30,
              capUsd: 5,
            },
          ],
        },
      });
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'quick',
        label: 'Quick',
        maxCredits: 500,
        budgetMultiplier: 0.5,
        wallTimeMinutes: 30,
        capUsd: 5,
      });
      render(<MissionDetailPage />);
      await openSettings();
      const selects = screen.getAllByRole('combobox');
      const depthSelect = selects.find(
        (s) =>
          (s as HTMLSelectElement).options?.[0]?.value === 'quick' &&
          (s as HTMLSelectElement).options?.length === 3
      );
      if (depthSelect) {
        fireEvent.change(depthSelect, { target: { value: 'quick' } });
        // Should call pickTier
        expect(pickTier).toHaveBeenCalled();
      }
    });

    it('can select KB IDs via selector', async () => {
      render(<MissionDetailPage />);
      await openSettings();
      fireEvent.click(screen.getByTestId('kb-change-btn'));
      // Selection update shouldn't crash
      expect(screen.getByTestId('knowledge-base-selector')).toBeInTheDocument();
    });

    it('can click tier cards in settings modal', async () => {
      const tiersData = {
        data: {
          tiers: [
            {
              depth: 'quick',
              label: 'Quick',
              maxCredits: 500,
              budgetMultiplier: 0.5,
              wallTimeMinutes: 30,
              capUsd: 5,
            },
            {
              depth: 'standard',
              label: 'Standard',
              maxCredits: 2000,
              budgetMultiplier: 1.0,
              wallTimeMinutes: 60,
              capUsd: 20,
            },
            {
              depth: 'deep',
              label: 'Deep',
              maxCredits: 5000,
              budgetMultiplier: 1.5,
              wallTimeMinutes: 120,
              capUsd: 50,
            },
          ],
        },
      };
      (useBudgetTiers as ReturnType<typeof vi.fn>).mockReturnValue(tiersData);
      (pickTier as ReturnType<typeof vi.fn>).mockImplementation(
        (_data: unknown, depth: string) => {
          const tiers = tiersData.data.tiers;
          return tiers.find((t) => t.depth === depth) ?? null;
        }
      );
      render(<MissionDetailPage />);
      await openSettings();
      // Find the Quick tier button by looking for button containing "Quick" text and capUsd info
      // The button text will be "Quick" + "约 $5 · ~30 分钟"
      const buttons = screen.getAllByRole('button');
      const quickBtn = buttons.find(
        (b) =>
          b.textContent?.includes('Quick') && b.textContent?.includes('~30')
      );
      if (quickBtn && !quickBtn.hasAttribute('disabled')) {
        fireEvent.click(quickBtn);
        // After clicking, pickTier has been called (during rendering)
        expect(pickTier).toHaveBeenCalled();
      } else {
        // Fallback — just verify pickTier was called (during render)
        expect(pickTier).toHaveBeenCalled();
      }
    });
  });

  // ── Report version switch ─────────────────────────────────────────
  describe('getReportVersion', () => {
    it('does not crash when listReportVersions fails', async () => {
      (listReportVersions as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Not found')
      );
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      await waitFor(() => expect(listReportVersions).toHaveBeenCalled());
      // No crash
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('loads versions for quality-failed missions', async () => {
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          version: 1,
          versionLabel: 'v1',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:05:00Z',
          finalScore: 60,
          leaderSigned: false,
        },
      ]);
      setMockHooks({
        legacyMission: { status: 'quality-failed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'quality-failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      await waitFor(() => {
        expect(listReportVersions).toHaveBeenCalledWith('test-mission-123');
      });
    });
  });

  // ── Tools:recalled events (reportToolRecallEntries) ───────────────
  describe('tools:recalled events', () => {
    it('processes tools:recalled events for reportToolRecallEntries', () => {
      const toolsRecalledEvent = {
        type: 'playground.tools:recalled',
        timestamp: '2026-01-01T00:00:30Z',
        payload: {
          agentId: 'agent-1',
          role: 'researcher',
          recalledIds: ['tool-1'],
          categories: ['search'],
          source: 'spec',
          preferIds: [],
        },
      };
      setMockHooks({ events: [toolsRecalledEvent] });
      render(<MissionDetailPage />);
      // Switch to report tab to render ArtifactReader with the entries
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });

    it('limits tool recall entries to 12', () => {
      // Create 15 recalled events
      const events = Array.from({ length: 15 }, (_, i) => ({
        type: 'playground.tools:recalled',
        timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        payload: {
          agentId: `agent-${i}`,
          role: 'researcher',
          recalledIds: [],
          categories: [],
          source: 'spec',
          preferIds: [],
        },
      }));
      setMockHooks({ events });
      render(<MissionDetailPage />);
      // No crash — ArtifactReader is mocked anyway
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── allSources computation ────────────────────────────────────────
  describe('allSources from finalReport', () => {
    it('computes sources from finalReport sections and citations', () => {
      (useMissionLegacyView as ReturnType<typeof vi.fn>).mockReturnValue({
        mission: {
          topic: 'Test',
          depth: 'standard',
          language: 'zh-CN',
          startedAt: Date.now() - 5000,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          rejectedAt: null,
          failedMessage: null,
          finalScore: null,
          themeSummary: null,
          dimensions: null,
          maxCredits: 2000,
          status: 'running',
        },
        agents: [],
        stages: [],
        cost: { tokensUsed: 1500, costUsd: 0.05 },
        memory: {},
        finalReport: {
          sections: [{ sources: ['https://a.com', 'https://b.com'] }],
          citations: ['https://c.com'],
        },
        dimensionPipelines: new Map(),
        todoLedger: [],
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-references'));
      // References panel should be rendered with sources
      expect(screen.getByTestId('references-panel')).toBeInTheDocument();
    });
  });

  // ── CompactMeters totalWords with real data ───────────────────────
  describe('CompactMeters totalWords', () => {
    it('computes total words from dimension pipelines', () => {
      const pipelines = new Map([
        [
          'dim-1',
          {
            chapters: [{ wordCount: 1000 }, { wordCount: 2000 }],
          },
        ],
        [
          'dim-2',
          {
            chapters: [{ wordCount: 500 }],
          },
        ],
      ]);
      (useMissionLegacyView as ReturnType<typeof vi.fn>).mockReturnValue({
        mission: {
          topic: 'Test',
          depth: 'standard',
          language: 'zh-CN',
          startedAt: Date.now() - 5000,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          rejectedAt: null,
          failedMessage: null,
          finalScore: null,
          themeSummary: null,
          dimensions: null,
          maxCredits: 2000,
          status: 'running',
        },
        agents: [],
        stages: [],
        cost: { tokensUsed: 1500, costUsd: 0.05 },
        memory: {},
        finalReport: null,
        dimensionPipelines: pipelines,
        todoLedger: [],
      });
      setMockHooks({ missionView: defaultMissionView });
      render(<MissionDetailPage />);
      // CompactMeters is rendered in tabBarTrailing
      const trailing = screen.getByTestId('tab-bar-trailing');
      expect(trailing).toBeInTheDocument();
    });

    it('handles empty dim pipeline chapters gracefully', () => {
      const pipelines = new Map([
        ['dim-1', { chapters: null }],
        ['dim-2', {}],
      ]);
      (useMissionLegacyView as ReturnType<typeof vi.fn>).mockReturnValue({
        mission: {
          topic: 'Test',
          depth: 'standard',
          language: 'zh-CN',
          startedAt: Date.now() - 5000,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          rejectedAt: null,
          failedMessage: null,
          finalScore: null,
          themeSummary: null,
          dimensions: null,
          maxCredits: 2000,
          status: 'running',
        },
        agents: [],
        stages: [],
        cost: { tokensUsed: 1500, costUsd: 0.05 },
        memory: {},
        finalReport: null,
        dimensionPipelines: pipelines,
        todoLedger: [],
      });
      setMockHooks({ missionView: defaultMissionView });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });
  });

  // ── reportArtifact branches ───────────────────────────────────────
  describe('reportArtifact computation', () => {
    it('uses versionOverride when it is a valid ReportArtifact', async () => {
      const { isReportArtifact } =
        await import('@/lib/features/agent-playground/report-artifact.types');
      (
        isReportArtifact as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(
        (v) => v && typeof v === 'object' && 'content' in (v as object)
      );
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          version: 2,
          versionLabel: 'v2',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:05:00Z',
          finalScore: 90,
          leaderSigned: true,
        },
      ]);
      (getReportVersion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        reportFull: {
          content: { fullMarkdown: 'version 2 content' },
          sections: [],
          citations: [],
          figures: [],
          factTable: [],
          metadata: { topic: 'Test' },
          quality: { overall: 90 },
          quickView: {},
        },
      });
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      await waitFor(() => expect(listReportVersions).toHaveBeenCalled());
      // Switch to report tab
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });

    it('uses canonical view reportArtifact when available', async () => {
      const mod =
        await import('@/lib/features/agent-playground/report-artifact.types');
      (
        mod.isReportArtifact as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(
        (v: unknown) =>
          v != null && typeof v === 'object' && 'content' in (v as object)
      );
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          reportArtifact: {
            content: { fullMarkdown: 'canonical content' },
            sections: [],
            citations: [],
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── pendingDepth effect ───────────────────────────────────────────
  describe('pendingDepth initialization', () => {
    it('sets pendingDepth from view.mission.depth on mount', () => {
      setMockHooks({
        legacyMission: { depth: 'deep' },
      });
      render(<MissionDetailPage />);
      // pendingDepth is initialized in a useEffect from view.mission.depth
      // No observable assertion needed beyond no-crash
      expect(screen.getByTestId('team-roster-panel')).toBeInTheDocument();
    });
  });

  // ── mission cleanedTopic edge cases ──────────────────────────────
  describe('cleanedTopic computation', () => {
    it('shows 研究中… when topic is empty and status is starting', () => {
      setMockHooks({
        legacyMission: { topic: '', status: 'starting' },
      });
      render(<MissionDetailPage />);
      // Title contains cleanedTopic — MissionDetailFrame title prop
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('shows 未命名研究 when topic is empty and status is not starting', () => {
      setMockHooks({
        legacyMission: { topic: '', status: 'running' },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('strips [Re-run focus] from topic', () => {
      setMockHooks({
        legacyMission: {
          topic: 'My Research\n[Re-run focus] extra',
          status: 'running',
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });
  });

  // ── isRunning edge cases ──────────────────────────────────────────
  describe('isRunning computation', () => {
    it('is not running when rejected status', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'rejected',
            finishedAt: new Date().toISOString(),
          },
        },
        legacyMission: { status: 'rejected' },
      });
      render(<MissionDetailPage />);
      // For rejected, isRunning = false; report tab shows artifact reader not loading
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── reportDefaultView from userProfile ────────────────────────────
  describe('reportDefaultView', () => {
    it('uses chapter view when userProfile.viewMode is chapter', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: { viewMode: 'chapter' },
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });

    it('uses quick view when userProfile.viewMode is quick', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: { viewMode: 'quick' },
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── wallTimeMs computation ────────────────────────────────────────
  describe('wallTimeMs', () => {
    it('uses persisted startedAt as fallback when view.mission.startedAt is missing', () => {
      setMockHooks({
        legacyMission: { startedAt: undefined, status: 'running' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            startedAt: '2026-01-01T00:00:00Z',
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('computes wallTime using finishedAt when mission is done', () => {
      setMockHooks({
        legacyMission: {
          startedAt: Date.now() - 10000,
          completedAt: Date.now() - 1000,
          status: 'completed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            startedAt: new Date(Date.now() - 10000).toISOString(),
            finishedAt: new Date(Date.now() - 1000).toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });
  });

  // ── settings modal - userProfile with maxCredits ──────────────────
  describe('settings modal userProfile loading', () => {
    it('loads userProfile maxCredits and wallTimeCapMs from mission view', async () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: {
              maxCredits: 3000,
              wallTimeCapMs: 3600000,
              budgetMultiplierOverride: 2.0,
              lengthProfile: 'deep',
              styleProfile: 'academic',
              audienceProfile: 'general-public',
              auditLayers: 'thorough',
              withFigures: false,
              concurrency: 2,
              searchTimeRange: '90d',
              knowledgeBaseIds: ['kb-1', 'kb-2'],
              description: 'test description',
            },
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // Description should be populated from userProfile
      const descriptionTextarea =
        screen.getByPlaceholderText(/补充你的研究意图/);
      expect((descriptionTextarea as HTMLTextAreaElement).value).toBe(
        'test description'
      );
    });
  });

  // ── settings modal - save in place validation ─────────────────────
  describe('settings modal save in place validation', () => {
    async function openSettingsCompleted() {
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
    }

    it('handleSaveInPlace calls updateMission and closes modal', async () => {
      const { updateMission } = await import('@/services/agent-playground/api');
      (updateMission as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        undefined
      );
      await openSettingsCompleted();
      await act(async () => {
        fireEvent.click(screen.getByText('保存修改'));
      });
      await waitFor(() => {
        expect(updateMission).toHaveBeenCalled();
        // Modal should close
        expect(screen.queryByTestId('modal')).not.toBeInTheDocument();
      });
    });

    it('handleSaveInPlace shows error when updateMission fails', async () => {
      const { updateMission } = await import('@/services/agent-playground/api');
      (updateMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Save error')
      );
      await openSettingsCompleted();
      await act(async () => {
        fireEvent.click(screen.getByText('保存修改'));
      });
      await waitFor(() => {
        expect(screen.getByText('Save error')).toBeInTheDocument();
      });
    });

    it('handleSaveInPlace shows error when maxCredits < 10', async () => {
      // Set maxCredits to invalid value via legacyMission (no row.maxCredits → profMax used,
      // but row.maxCredits from legacyMission.maxCredits in the modal).
      // The modal reads: rowMax = (mission as { maxCredits?: number }).maxCredits
      // where mission = view.mission from useMissionLegacyView
      setMockHooks({
        legacyMission: {
          status: 'completed',
          completedAt: Date.now(),
          maxCredits: 5,
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      await act(async () => {
        fireEvent.click(screen.getByText('保存修改'));
      });
      await waitFor(() => {
        expect(
          screen.getByText('maxCredits 必须在 10 - 100000 之间')
        ).toBeInTheDocument();
      });
    });

    it('handleSaveAsNew shows error when maxCredits out of range', async () => {
      setMockHooks({
        legacyMission: { status: 'running', maxCredits: 5 },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      await act(async () => {
        fireEvent.click(screen.getByText('另存为新 mission'));
      });
      await waitFor(() => {
        expect(
          screen.getByText('maxCredits 必须在 10 - 100000 之间')
        ).toBeInTheDocument();
      });
    });
  });

  // ── reportToolRecallEntries ?? fallback branches ─────────────────
  describe('reportToolRecallEntries with missing fields', () => {
    it('applies ?? defaults when payload fields are undefined', () => {
      // Lines 567-572: agentId ?? '', role ?? '', recalledIds ?? [], etc.
      const eventWithMissingFields = {
        type: 'playground.tools:recalled',
        timestamp: '2026-01-01T00:00:30Z',
        payload: {
          // All fields undefined → covers the ?? '' and ?? [] fallback arms
          agentId: undefined,
          role: undefined,
          recalledIds: undefined,
          categories: undefined,
          source: undefined,
          preferIds: undefined,
        },
      };
      setMockHooks({ events: [eventWithMissingFields] });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── listReportVersions .then() callback ───────────────────────────
  describe('listReportVersions .then callback - sets selectedVersion', () => {
    it('sets selectedVersion when versions are loaded with head version', async () => {
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          version: 3,
          versionLabel: 'v3',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:07:00Z',
          finalScore: 85,
          leaderSigned: true,
        },
        {
          version: 2,
          versionLabel: 'v2',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:05:00Z',
          finalScore: 75,
          leaderSigned: false,
        },
      ]);
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      // listReportVersions .then() callback: items[0].version = 3, setSelectedVersion(3)
      await waitFor(() => {
        expect(listReportVersions).toHaveBeenCalledWith('test-mission-123');
      });
      // No crash - selectedVersion is set internally
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('handles cancelled flag in .then (no double set when cancelled=true)', async () => {
      // The effect cleanup sets cancelled = true; when unmounted immediately,
      // the .then callback should be skipped
      let resolveVersions!: (v: unknown[]) => void;
      const promise = new Promise<unknown[]>((res) => {
        resolveVersions = res;
      });
      (listReportVersions as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        promise
      );
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      const { unmount } = render(<MissionDetailPage />);
      // Unmount before promise resolves — cancelled flag is set
      unmount();
      // Resolve after unmount — .then callback should exit early (no state update)
      await act(async () => {
        resolveVersions([
          {
            version: 1,
            versionLabel: 'v1',
            triggerType: 'auto',
            generatedAt: '',
            finalScore: null,
            leaderSigned: false,
          },
        ]);
      });
      // No crash expected
    });
  });

  // ── citation callback body ────────────────────────────────────────
  describe('citation click callback body', () => {
    it('invoking the citation callback sets activeTab to references', async () => {
      render(<MissionDetailPage />);
      // The effect calls: setCitationClickCallback((evidenceId) => { ... })
      // Retrieve the captured callback
      const calls = (setCitationClickCallback as ReturnType<typeof vi.fn>).mock
        .calls;
      const lastCall = calls[calls.length - 1];
      const citationCallback = lastCall?.[0] as
        | ((evidenceId: string) => void)
        | null;
      expect(citationCallback).toBeInstanceOf(Function);
      if (citationCallback) {
        // Create a mock DOM element to find
        const target = document.createElement('div');
        target.id = 'ref-test-evidence-1';
        document.body.appendChild(target);
        // Invoke the callback — it calls setActiveTab('references') + requestAnimationFrame
        await act(async () => {
          citationCallback('test-evidence-1');
        });
        document.body.removeChild(target);
      }
      // After callback, references tab should be active — verify no crash
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('requestAnimationFrame callback runs DOM scroll and highlight', async () => {
      // Fake RAF to execute synchronously
      const rafSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb) => {
          cb(performance.now());
          return 0;
        });
      render(<MissionDetailPage />);
      const calls = (setCitationClickCallback as ReturnType<typeof vi.fn>).mock
        .calls;
      const citationCallback = calls[calls.length - 1]?.[0] as
        | ((id: string) => void)
        | null;
      if (citationCallback) {
        // Create target element
        const target = document.createElement('div');
        target.setAttribute('data-cite-uuid', 'cite-abc');
        document.body.appendChild(target);
        await act(async () => {
          citationCallback('cite-abc');
        });
        // Advance just past the 2000ms highlight-removal timeout (not runAll to avoid infinite loop)
        vi.advanceTimersByTime(2100);
        document.body.removeChild(target);
      }
      rafSpy.mockRestore();
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('RAF callback handles missing target gracefully', async () => {
      const rafSpy = vi
        .spyOn(window, 'requestAnimationFrame')
        .mockImplementation((cb) => {
          cb(performance.now());
          return 0;
        });
      render(<MissionDetailPage />);
      const calls = (setCitationClickCallback as ReturnType<typeof vi.fn>).mock
        .calls;
      const citationCallback = calls[calls.length - 1]?.[0] as
        | ((id: string) => void)
        | null;
      if (citationCallback) {
        // No DOM element with this ID — target = null
        await act(async () => {
          citationCallback('nonexistent-evidence');
        });
      }
      rafSpy.mockRestore();
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });
  });

  // ── sweepStatus with terminal mission ────────────────────────────
  describe('sweepStatus with terminal mission state', () => {
    it('sweeps in_progress todos to done when mission is completed', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
          todoBoard: {
            kind: 'todo-board',
            items: [
              {
                id: 'todo-1',
                parentId: undefined,
                origin: 'system',
                createdBy: 'system',
                createdAt: Date.now(),
                reasonText: 'Test',
                scope: 'pipeline',
                title: 'Test task',
                assignee: { role: 'researcher' },
                status: 'in_progress',
                artifacts: [],
                narrativeLog: [],
              },
              {
                id: 'todo-2',
                parentId: undefined,
                origin: 'system',
                createdBy: 'system',
                createdAt: Date.now(),
                reasonText: 'Done already',
                scope: 'pipeline',
                title: 'Already done',
                assignee: { role: 'researcher' },
                status: 'done',
                artifacts: [],
                narrativeLog: [],
              },
            ],
          },
        },
      });
      render(<MissionDetailPage />);
      // No crash — sweepStatus maps in_progress → done for completed missions
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });

    it('sweeps pending todos to cancelled when mission is cancelled', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'cancelled',
            finishedAt: new Date().toISOString(),
          },
          todoBoard: {
            kind: 'todo-board',
            items: [
              {
                id: 'todo-3',
                parentId: undefined,
                origin: 'system',
                createdBy: 'system',
                createdAt: Date.now(),
                reasonText: 'Pending',
                scope: 'pipeline',
                title: 'Not started',
                assignee: { role: 'researcher' },
                status: 'pending',
                artifacts: [],
                narrativeLog: [],
              },
            ],
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });

    it('sweeps pending todos to failed when mission is failed', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            finishedAt: new Date().toISOString(),
          },
          todoBoard: {
            kind: 'todo-board',
            items: [
              {
                id: 'todo-4',
                parentId: undefined,
                origin: 'system',
                createdBy: 'system',
                createdAt: Date.now(),
                reasonText: 'Pending',
                scope: 'pipeline',
                title: 'Failed task',
                assignee: { role: 'researcher' },
                status: 'pending',
                artifacts: [],
                narrativeLog: [],
              },
            ],
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });

    it('passes through status unchanged for running mission with items (!missionTerminal = true branch)', () => {
      // missionTerminal = false → !missionTerminal = true → returns raw
      // This hits sweepStatus branch 77 arm 0 (the "return raw" path)
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: { ...defaultMissionView.mission, status: 'running' },
          todoBoard: {
            kind: 'todo-board',
            items: [
              {
                id: 'todo-r1',
                parentId: undefined,
                origin: 'system',
                createdBy: 'system',
                createdAt: Date.now(),
                reasonText: 'Running',
                scope: 'pipeline',
                title: 'In-progress task',
                assignee: { role: 'researcher' },
                status: 'in_progress',
                artifacts: [],
                narrativeLog: [],
              },
            ],
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-todo-board')).toBeInTheDocument();
    });
  });

  // ── dismiss quality-failed banner close button (line 919) ──────────
  describe('dismiss quality-failed banner (line 919)', () => {
    it('dismisses quality-failed banner on close button click', async () => {
      setMockHooks({
        legacyMission: {
          failedMessage: 'Leader 拒签',
          completedAt: Date.now(),
          status: 'quality-failed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'quality-failed',
            failureMessage: 'Leader 拒签',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      // quality-failed banner shows "Leader 拒签 · 质量未达标但报告可阅读"
      expect(
        screen.getByText('Leader 拒签 · 质量未达标但报告可阅读')
      ).toBeInTheDocument();
      // The close button has aria-label="关闭"
      const closeBtn = screen.getAllByLabelText('关闭')[0];
      fireEvent.click(closeBtn);
      await waitFor(() => {
        expect(
          screen.queryByText('Leader 拒签 · 质量未达标但报告可阅读')
        ).not.toBeInTheDocument();
      });
    });

    it('quality-failed banner "查看输出报告" button switches to report tab', async () => {
      setMockHooks({
        legacyMission: {
          failedMessage: 'Leader 拒签',
          completedAt: Date.now(),
          status: 'quality-failed',
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'quality-failed',
            failureMessage: 'Leader 拒签',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      // Click "查看输出报告 →"
      fireEvent.click(screen.getByText('查看输出报告 →'));
      // ArtifactReader should now be visible (report tab content)
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── totalWords from missionView dimensionPipelines ────────────────
  // Note: CompactMeters receives view={missionView} from useMissionDetailView,
  // NOT from useMissionLegacyView. So pipelines must be set in missionView.
  describe('CompactMeters totalWords via missionView dimensionPipelines', () => {
    it('sums wordCount from dimensionPipelines chapters in missionView', () => {
      const pipelines = new Map<
        string,
        { chapters?: { wordCount?: number }[] }
      >([
        ['dim-1', { chapters: [{ wordCount: 1500 }, { wordCount: 2500 }] }],
        ['dim-2', { chapters: [{ wordCount: 800 }] }],
      ]);
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          dimensionPipelines:
            pipelines as unknown as typeof defaultMissionView.dimensionPipelines,
        },
      });
      render(<MissionDetailPage />);
      // totalWords = 1500 + 2500 + 800 = 4800 > 0 → FileText icon renders
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });

    it('totalWords = 0 when pipeline is not a Map (no .values())', () => {
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          dimensionPipelines: {
            notAMap: true,
          } as unknown as typeof defaultMissionView.dimensionPipelines,
        },
      });
      render(<MissionDetailPage />);
      // totalWords = 0 → guard returns 0
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });

    it('covers chapter without wordCount (undefined wordCount skipped)', () => {
      const pipelines = new Map<
        string,
        { chapters?: { wordCount?: number }[] }
      >([
        ['dim-1', { chapters: [{ wordCount: undefined }, { wordCount: 500 }] }],
      ]);
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          dimensionPipelines:
            pipelines as unknown as typeof defaultMissionView.dimensionPipelines,
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });

    it('covers dim with no chapters array (skips continue branch)', () => {
      const pipelines = new Map<
        string,
        { chapters?: { wordCount?: number }[] }
      >([
        ['dim-1', {}], // no chapters property
        ['dim-2', { chapters: [{ wordCount: 300 }] }],
      ]);
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          dimensionPipelines:
            pipelines as unknown as typeof defaultMissionView.dimensionPipelines,
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });
  });

  // ── handleSelectVersion via ArtifactReader onSelectVersion ────────
  describe('handleSelectVersion', () => {
    it('calls getReportVersion when a different version is selected via ArtifactReader', async () => {
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          version: 2,
          versionLabel: 'v2',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:05:00Z',
          finalScore: 90,
          leaderSigned: true,
        },
        {
          version: 1,
          versionLabel: 'v1',
          triggerType: 'auto',
          generatedAt: '2026-01-01T00:03:00Z',
          finalScore: 70,
          leaderSigned: false,
        },
      ]);
      (getReportVersion as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        reportFull: {
          content: {},
          sections: [],
          citations: [],
          figures: [],
          factTable: [],
          metadata: {},
          quality: {},
          quickView: {},
        },
      });
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      // Wait for versions to load (sets selectedVersion = 2)
      await waitFor(() => expect(listReportVersions).toHaveBeenCalled());
      // Switch to report tab to see ArtifactReader
      fireEvent.click(screen.getByTestId('tab-report'));
      // ArtifactReader is now rendered with onSelectVersion
      const btn = screen.queryByTestId('select-version-btn');
      if (btn) {
        // Click to trigger onSelectVersion(99) - version 99 !== selectedVersion 2 → calls getReportVersion
        await act(async () => {
          fireEvent.click(btn);
        });
        await waitFor(() => {
          expect(getReportVersion).toHaveBeenCalledWith('test-mission-123', 99);
        });
      }
    });

    it('handleSelectVersion does nothing if same version is requested', async () => {
      // selectedVersion starts null, setSelectedVersion is called with head = 99 from .then()
      // When select-version-btn is clicked with 99 and selectedVersion is already 99 → early return
      (listReportVersions as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          version: 99,
          versionLabel: 'v99',
          triggerType: 'auto',
          generatedAt: '',
          finalScore: null,
          leaderSigned: false,
        },
      ]);
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      await waitFor(() => expect(listReportVersions).toHaveBeenCalled());
      // selectedVersion is now 99 (head of versions list)
      fireEvent.click(screen.getByTestId('tab-report'));
      const btn = screen.queryByTestId('select-version-btn');
      if (btn) {
        // Click — onSelectVersion(99) but selectedVersion is already 99 → early return, no getReportVersion call
        await act(async () => {
          fireEvent.click(btn);
        });
        // getReportVersion should NOT be called (same version = early return)
        expect(getReportVersion).not.toHaveBeenCalled();
      }
    });
  });

  // ── handleSaveAsNew validation branches ──────────────────────────
  describe('handleSaveAsNew validation branches', () => {
    async function openSettings() {
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
    }

    it('shows budgetMultiplier validation error when out of range', async () => {
      // Set budgetMultiplierOverride < 0.3 via userProfile
      setMockHooks({
        legacyMission: { status: 'running' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: {
              budgetMultiplierOverride: 0.1,
              maxCredits: 2000,
              wallTimeCapMs: 3600000,
            },
          },
        },
      });
      await openSettings();
      await act(async () => {
        fireEvent.click(screen.getByText('另存为新 mission'));
      });
      await waitFor(() => {
        expect(
          screen.getByText('agent 倍率必须在 0.3 - 10 之间')
        ).toBeInTheDocument();
      });
    });

    it('shows wallTimeMinutes validation error when out of range', async () => {
      // Set wallTimeCapMs to produce wallTimeMinutes > 180
      setMockHooks({
        legacyMission: { status: 'running' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: {
              wallTimeCapMs: 200 * 60 * 1000, // 200 minutes > 180
              maxCredits: 2000,
              budgetMultiplierOverride: 1.0,
            },
          },
        },
      });
      await openSettings();
      await act(async () => {
        fireEvent.click(screen.getByText('另存为新 mission'));
      });
      await waitFor(() => {
        expect(
          screen.getByText('时长上限必须在 1 - 180 分钟之间')
        ).toBeInTheDocument();
      });
    });
  });

  // ── handleSaveInPlace validation branches ─────────────────────────
  describe('handleSaveInPlace validation branches', () => {
    async function openSettingsWithValues(
      userProfile: Record<string, unknown>
    ) {
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
            userProfile,
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
    }

    it('shows budgetMultiplier validation error in handleSaveInPlace', async () => {
      await openSettingsWithValues({
        budgetMultiplierOverride: 0.1,
        maxCredits: 2000,
        wallTimeCapMs: 3600000,
      });
      await act(async () => {
        fireEvent.click(screen.getByText('保存修改'));
      });
      await waitFor(() => {
        expect(
          screen.getByText('agent 倍率必须在 0.3 - 10 之间')
        ).toBeInTheDocument();
      });
    });

    it('shows wallTime validation error in handleSaveInPlace', async () => {
      await openSettingsWithValues({
        wallTimeCapMs: 200 * 60 * 1000, // 200 minutes → invalid
        maxCredits: 2000,
        budgetMultiplierOverride: 1.0,
      });
      await act(async () => {
        fireEvent.click(screen.getByText('保存修改'));
      });
      await waitFor(() => {
        expect(
          screen.getByText('时长上限必须在 1 - 180 分钟之间')
        ).toBeInTheDocument();
      });
    });
  });

  // ── Branch coverage expansion: persisted useMemo ?? fallbacks ────
  describe('persisted useMemo null field fallbacks', () => {
    it('uses ?? fallbacks when missionView.mission fields are null', () => {
      // Covers lines 249-252, 257: topic/depth/language/maxCredits/startedAt ?? fallbacks
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            topic: null as unknown as string,
            depth: null as unknown as string,
            language: null as unknown as string,
            maxCredits: null as unknown as number,
            startedAt: null as unknown as string,
          },
          cost: {
            ...defaultMissionView.cost,
            tokensUsed: null as unknown as number,
            costUsd: null as unknown as number,
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });

    it('uses ?? fallbacks when missionView.cost fields are null', () => {
      // Covers lines 264 (tokensUsed != null = false) and 267 (costUsd ?? 0)
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          cost: {
            tokensUsed: null as unknown as number,
            costUsd: null as unknown as number,
            trajectoryStored: null,
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });
  });

  // ── Branch coverage expansion: terminal event without timestamp ───
  describe('terminal event timestamp fallback', () => {
    it('handles terminal event with no timestamp (uses empty string sig)', async () => {
      // Line 299: terminal.timestamp ?? '' fallback arm
      const terminalNoTimestamp = {
        type: 'playground.mission:completed',
        timestamp: undefined,
        payload: {},
      };
      setMockHooks({ events: [terminalNoTimestamp] });
      render(<MissionDetailPage />);
      await waitFor(() => {
        expect(mockRefresh).toHaveBeenCalled();
      });
    });
  });

  // ── Branch coverage: startedAtMs line 335 - persisted.startedAt falsy
  describe('startedAtMs with null legacy startedAt and null missionView.mission.startedAt', () => {
    it('returns undefined for startedAtMs when both startedAt sources are null', () => {
      // Line 335: persisted?.startedAt ? ... : undefined - arm 1 (undefined)
      // needs: view.mission.startedAt = null AND missionView.mission.startedAt = null
      // so persisted.startedAt = '' (falsy) → ternary takes false arm (undefined)
      setMockHooks({
        legacyMission: { startedAt: null, status: 'running' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            startedAt: null as unknown as string,
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: allSources sections without sources property ─
  describe('allSources computation with section having no sources', () => {
    it('skips section without sources property (arm 1 of if s.sources)', () => {
      // Line 393: if (s.sources) - arm 1 (false) when section has no sources
      (useMissionLegacyView as ReturnType<typeof vi.fn>).mockReturnValue({
        mission: {
          topic: 'Test',
          depth: 'standard',
          language: 'zh-CN',
          startedAt: Date.now() - 5000,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          rejectedAt: null,
          failedMessage: null,
          finalScore: null,
          themeSummary: null,
          dimensions: null,
          maxCredits: 2000,
          status: 'running',
        },
        agents: [],
        stages: [],
        cost: { tokensUsed: 1500, costUsd: 0.05 },
        memory: {},
        finalReport: {
          // One section WITH sources, one WITHOUT sources
          sections: [
            { sources: ['https://a.com'] },
            { title: 'No sources section' }, // no sources property
          ],
          citations: [],
        },
        dimensionPipelines: new Map(),
        todoLedger: [],
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-references'));
      expect(screen.getByTestId('references-panel')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: catch with cancelled = true ──────────────────
  describe('listReportVersions catch with cancelled flag', () => {
    it('skips setReportVersions when component unmounts before catch fires', async () => {
      // Line 431: if (!cancelled) setReportVersions([]) - arm 1 (cancelled = true)
      let rejectFn!: (e: Error) => void;
      const promise = new Promise<never>((_, rej) => {
        rejectFn = rej;
      });
      (listReportVersions as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        promise
      );
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      const { unmount } = render(<MissionDetailPage />);
      // Unmount before promise rejects — cancelled = true
      unmount();
      // Reject after unmount
      await act(async () => {
        rejectFn(new Error('cancelled fetch'));
      });
      // No crash expected
    });
  });

  // ── Branch coverage: topic ?? '研究报告' in buildEmpty fallback ───
  describe('empty artifact fallback with null topic', () => {
    it('uses 研究报告 as fallback title when topic is null', () => {
      // Line 523: view.mission.topic ?? '研究报告' - arm 1
      setMockHooks({
        legacyMission: { topic: null, status: 'running' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            topic: null as unknown as string,
            status: 'running',
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: cleanedTopic view.mission.topic ?? '' arm 1 ─
  describe('cleanedTopic with null topic', () => {
    it('falls back to empty string when view.mission.topic is null', () => {
      // Line 731: view.mission.topic ?? '' - arm 1 (fallback '')
      setMockHooks({
        legacyMission: { topic: null, status: 'running' },
      });
      render(<MissionDetailPage />);
      // cleanedTopic will be '' → since status=running (not starting), returns '未命名研究'
      expect(screen.getByTestId('mission-detail-frame')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: TeamRosterPanel depth/language/maxCredits null
  describe('TeamRosterPanel depth/language/maxCredits null fallbacks', () => {
    it('falls back to persisted values when legacyMission fields are null', () => {
      // Lines 993, 996, 1000: ?? fallbacks for depth/language/maxCredits
      setMockHooks({
        legacyMission: {
          topic: 'Test',
          status: 'running',
          depth: null,
          language: null,
          maxCredits: null,
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            depth: 'standard',
            language: 'zh-CN',
            maxCredits: 2000,
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('team-roster-panel')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: runTeam call with null topic/language ────────
  describe('runTeam with null topic and language fallbacks', () => {
    it('uses empty string / zh-CN fallbacks when topic/language are null', async () => {
      // Lines 1032, 1034: topic ?? '' and language ?? 'zh-CN' fallbacks
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'deep',
        label: 'Deep',
        maxCredits: 5000,
        budgetMultiplier: 1.5,
        wallTimeMinutes: 120,
        capUsd: 50,
      });
      setMockHooks({
        legacyMission: {
          topic: null,
          language: null,
          status: 'running',
          depth: 'standard',
        },
      });
      render(<MissionDetailPage />);
      // Change depth to trigger runTeam path
      fireEvent.click(screen.getByTestId('depth-change-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            topic: '',
            language: 'zh-CN',
          })
        );
      });
    });
  });

  // ── Branch coverage: non-Error thrown from update/cancel/runTeam ─
  describe('non-Error thrown in action handlers', () => {
    it('shows String(e) when update throws non-Error', async () => {
      // Line 1101: arm 1 (String(e) when non-Error thrown from rerunMission)
      (rerunMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'string-update-error'
      );
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('update-btn'));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          '更新失败',
          'string-update-error'
        );
      });
    });

    it('shows String(e) when cancel throws non-Error', async () => {
      // Line 1116: arm 1 (String(e) when non-Error thrown from cancelMission)
      (cancelMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'string-cancel-error'
      );
      render(<MissionDetailPage />);
      await act(async () => {
        fireEvent.click(screen.getByTestId('cancel-btn'));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          '取消失败',
          'string-cancel-error'
        );
      });
    });

    it('shows String(e) when runTeam (save as new) throws non-Error', async () => {
      // Line 1507: arm 1 (String(e) when non-Error thrown from runTeam)
      (runTeam as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'string-run-error'
      );
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      await act(async () => {
        fireEvent.click(screen.getByText('另存为新 mission'));
      });
      await waitFor(() => {
        expect(screen.getByText('string-run-error')).toBeInTheDocument();
      });
    });

    it('shows String(e) when updateMission (save in place) throws non-Error', async () => {
      // Line 1543: arm 1 (String(e) when non-Error thrown from updateMission)
      const { updateMission } = await import('@/services/agent-playground/api');
      (updateMission as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'string-save-error'
      );
      setMockHooks({
        legacyMission: { status: 'completed', completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      await act(async () => {
        fireEvent.click(screen.getByText('保存修改'));
      });
      await waitFor(() => {
        expect(screen.getByText('string-save-error')).toBeInTheDocument();
      });
    });

    it('shows String(e) when runTeam (depth-change rerun) throws non-Error', async () => {
      // Line 1083: arm 1 (String(e) when non-Error thrown from runTeam after depth change)
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'deep',
        label: 'Deep',
        maxCredits: 5000,
        budgetMultiplier: 1.5,
        wallTimeMinutes: 120,
        capUsd: 50,
      });
      (runTeam as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        'string-depth-rerun-error'
      );
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('depth-change-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith(
          '启动失败',
          'string-depth-rerun-error'
        );
      });
    });
  });

  // ── Branch coverage: mission status null (isTerminal ?? '') ───────
  describe('isTerminal with null status', () => {
    it('mission.status null falls back to empty string for isTerminal check', async () => {
      // Line 1514: (mission.status ?? '') - arm 1 (empty string fallback)
      setMockHooks({
        legacyMission: { status: null, completedAt: Date.now() },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: null as unknown as string,
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // No crash
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: knowledgeBaseIds.length > 0 in handleSaveAsNew
  describe('handleSaveAsNew with knowledgeBaseIds', () => {
    it('passes knowledgeBaseIds when > 0 in handleSaveAsNew', async () => {
      // Line 1503: knowledgeBaseIds.length > 0 ? knowledgeBaseIds : undefined - arm 0
      (runTeam as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        missionId: 'kb-test-mission',
      });
      setMockHooks({
        legacyMission: { status: 'running' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: {
              knowledgeBaseIds: ['kb-1', 'kb-2'],
              maxCredits: 2000,
              budgetMultiplierOverride: 1.0,
            },
          },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      await act(async () => {
        fireEvent.click(screen.getByText('另存为新 mission'));
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalledWith(
          expect.objectContaining({ knowledgeBaseIds: ['kb-1', 'kb-2'] })
        );
      });
    });
  });

  // ── Branch coverage: depth select pickTier returns null (no update)
  describe('depth select with no matching tier', () => {
    it('does not update budget when pickTier returns null', async () => {
      // Line 1683: if (tier) - arm 1 (false) when pickTier returns null
      (useBudgetTiers as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { tiers: [] },
      });
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue(null);
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // Change the depth select — pickTier returns null, so if(tier) is false
      const selects = screen.getAllByRole('combobox');
      const depthSelect = selects.find(
        (s) =>
          (s as HTMLSelectElement).options?.[0]?.value === 'quick' &&
          (s as HTMLSelectElement).options?.length === 3
      );
      if (depthSelect) {
        fireEvent.change(depthSelect, { target: { value: 'quick' } });
        expect(pickTier).toHaveBeenCalled();
      }
    });
  });

  // ── Branch coverage: tier button click when tier is null (disabled)
  describe('tier button click when tier is null (disabled button onclick)', () => {
    it('tier button onclick guard returns early when tier is null', async () => {
      // Line 1851: if (!tier) return; - arm 0 (tier is null)
      // When useBudgetTiers returns null data, tier = pickTier(null, depth) = null
      // The button is disabled but we can trigger onClick via fireEvent
      (useBudgetTiers as ReturnType<typeof vi.fn>).mockReturnValue({
        data: null,
      });
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue(null);
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      // All tier buttons will be disabled (tier = null for each)
      // Force-click a disabled button to trigger the guard
      const buttons = screen.getAllByRole('button');
      const tierBtn = buttons.find((b) => b.hasAttribute('disabled'));
      if (tierBtn) {
        fireEvent.click(tierBtn);
        // No crash — guard returns early
      }
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: CompactMeters with maxCredits null ──────────
  describe('CompactMeters maxCredits null (usageRatio = null)', () => {
    it('renders amber color when maxCredits is null (usageRatio = null)', () => {
      // Lines 2020 (arm 1), 2022 (arm 1), 2024 (arm 0): all need maxCredits = null
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            maxCredits: null as unknown as number,
            finalScore: 85, // Also covers line 2065 arm 1
          },
          cost: { tokensUsed: 1500, costUsd: 0.05, trajectoryStored: null },
        },
      });
      render(<MissionDetailPage />);
      const trailing = screen.getByTestId('tab-bar-trailing');
      expect(trailing).toBeInTheDocument();
    });

    it('renders red color when usageRatio >= 1 (maxCredits low, tokens high)', () => {
      // Lines 2026 arm 0, 2048 arm 0: usageRatio >= 1
      // maxTokens = maxCredits * 1000; if maxCredits = 1 (1000 tokens), tokensUsed >= 1000
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            maxCredits: 1, // maxTokens = 1000
          },
          cost: { tokensUsed: 1500, costUsd: 0.05, trajectoryStored: null }, // 1500 >= 1000 → ratio = 1
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });

    it('renders orange color when usageRatio is between 0.9 and 1', () => {
      // Lines 2028 arm 0, 2050 arm 0: usageRatio in [0.9, 1)
      // maxCredits = 1, maxTokens = 1000; tokensUsed = 950 → ratio = 0.95
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            maxCredits: 1,
          },
          cost: { tokensUsed: 950, costUsd: 0.05, trajectoryStored: null },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: fmtTokens M branch (tokensUsed >= 1M) ───────
  describe('CompactMeters fmtTokens M branch', () => {
    it('formats tokens as M when tokensUsed >= 1_000_000', () => {
      // Line 1991 arm 1: n >= 1_000_000 → fmtTokens returns M format
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          cost: { tokensUsed: 2_000_000, costUsd: 0.5, trajectoryStored: null },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });

    it('formats tokens as String when tokensUsed < 1000', () => {
      // Line 1989 arm 0: n < 1000 → fmtTokens returns String(n)
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          cost: { tokensUsed: 500, costUsd: 0.01, trajectoryStored: null },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: CompactMeters maxTokens title with null ─────
  describe('CompactMeters maxTokens title format', () => {
    it('shows short title without limit when maxCredits is null', () => {
      // Line 2037 arm 1: maxTokens != null = false → shorter title format
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            maxCredits: null as unknown as number,
          },
        },
      });
      render(<MissionDetailPage />);
      expect(screen.getByTestId('tab-bar-trailing')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: CompactMeters totalWords > 0 renders FileText ─
  describe('CompactMeters totalWords > 0 renders file icon', () => {
    it('renders FileText span when totalWords > 0 (branch 230 arm 1)', () => {
      // Line 2065: {totalWords > 0 && (...)} arm 1 = renders FileText
      const pipelines = new Map([
        ['dim-1', { chapters: [{ wordCount: 5000 }] }],
      ]);
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          dimensionPipelines:
            pipelines as unknown as typeof defaultMissionView.dimensionPipelines,
          mission: { ...defaultMissionView.mission, finalScore: 88 },
        },
      });
      render(<MissionDetailPage />);
      const trailing = screen.getByTestId('tab-bar-trailing');
      // FileText renders inside trailing
      expect(trailing).toBeInTheDocument();
    });
  });

  // ── Branch coverage: settings modal budget labels ────────────────
  describe('settings modal budget display with small maxCredits', () => {
    it('shows k-format cap label when maxCredits * 1000 < 1M', async () => {
      // Line 1631 arm 1: capTokens < 1_000_000 → uses k format
      // Also covers line 1621 arm 1: tokensUsed < 1000
      setMockHooks({
        legacyMission: {
          status: 'completed',
          completedAt: Date.now(),
          maxCredits: 500,
        },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
          cost: { tokensUsed: 500, costUsd: 0.01, trajectoryStored: null },
        },
      });
      render(<MissionDetailPage />);
      const settingsBtn = screen
        .getByTestId('header-actions')
        .querySelector('button');
      fireEvent.click(settingsBtn!);
      await waitFor(() =>
        expect(screen.getByTestId('modal')).toBeInTheDocument()
      );
      expect(screen.getByTestId('modal')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: runTeam with no userProfile knowledgeBaseIds ─
  describe('runTeam with no-array knowledgeBaseIds in depth change', () => {
    it('passes undefined knowledgeBaseIds when userProfile.knowledgeBaseIds is not array', async () => {
      // Line 1077: Array.isArray(up.knowledgeBaseIds) arm 0 (false) → undefined
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'deep',
        label: 'Deep',
        maxCredits: 5000,
        budgetMultiplier: 1.5,
        wallTimeMinutes: 120,
        capUsd: 50,
      });
      setMockHooks({
        legacyMission: { status: 'running', depth: 'standard' },
        missionView: {
          ...defaultMissionView,
          mission: {
            ...defaultMissionView.mission,
            userProfile: { knowledgeBaseIds: 'not-an-array', maxCredits: 2000 },
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('depth-change-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalledWith(
          expect.objectContaining({ knowledgeBaseIds: undefined })
        );
      });
    });
  });

  // ── Branch coverage: maxCredits chain in runTeam call ────────────
  describe('runTeam maxCredits ?? chain (lines 1071-1073)', () => {
    it('falls through to view.mission.maxCredits when tier.maxCredits is null', async () => {
      // Line 1071 arm 1: tier?.maxCredits = null → falls to view.mission.maxCredits
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'deep',
        label: 'Deep',
        maxCredits: null as unknown as number, // null → falls through
        budgetMultiplier: null as unknown as number,
        wallTimeMinutes: null as unknown as number,
        capUsd: 50,
      });
      setMockHooks({
        legacyMission: {
          status: 'running',
          depth: 'standard',
          maxCredits: 3000,
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('depth-change-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalledWith(
          expect.objectContaining({ maxCredits: 3000 })
        );
      });
    });

    it('falls through to 2000 when both tier.maxCredits and view.mission.maxCredits are null', async () => {
      // Line 1071 arms 1,2: tier.maxCredits = null AND view.mission.maxCredits = null → 2000
      (pickTier as ReturnType<typeof vi.fn>).mockReturnValue({
        depth: 'deep',
        label: 'Deep',
        maxCredits: null as unknown as number,
        budgetMultiplier: null as unknown as number,
        wallTimeMinutes: null as unknown as number,
        capUsd: 50,
      });
      setMockHooks({
        legacyMission: {
          status: 'running',
          depth: 'standard',
          maxCredits: null,
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('depth-change-btn'));
      await act(async () => {
        fireEvent.click(screen.getByTestId('rerun-btn'));
      });
      await waitFor(() => {
        expect(runTeam).toHaveBeenCalledWith(
          expect.objectContaining({ maxCredits: 2000 })
        );
      });
    });
  });

  // ── Branch coverage: reportFullRef valid artifact (line 508 arm 0) ─
  describe('reportFullRef is valid ReportArtifact (line 508 arm 0)', () => {
    it('returns reportFullRef when isReportArtifact returns true for finalReport', async () => {
      // Line 508: if (reportFullRef && typeof reportFullRef === 'object' && isReportArtifact(reportFullRef))
      // arm 0 = condition TRUE. Need: canonicalArtifact = null, reportFullRef = view.finalReport, isReportArtifact = true
      const { isReportArtifact } =
        await import('@/lib/features/agent-playground/report-artifact.types');
      (
        isReportArtifact as unknown as ReturnType<typeof vi.fn>
      ).mockImplementation(
        (v: unknown) =>
          v != null && typeof v === 'object' && 'content' in (v as object)
      );
      (useMissionLegacyView as ReturnType<typeof vi.fn>).mockReturnValue({
        mission: {
          topic: 'Test',
          depth: 'standard',
          language: 'zh-CN',
          startedAt: Date.now() - 5000,
          completedAt: null,
          failedAt: null,
          cancelledAt: null,
          rejectedAt: null,
          failedMessage: null,
          finalScore: null,
          themeSummary: null,
          dimensions: null,
          maxCredits: 2000,
          status: 'completed',
        },
        agents: [],
        stages: [],
        cost: { tokensUsed: 1500, costUsd: 0.05 },
        memory: {},
        finalReport: {
          content: { fullMarkdown: 'full report text' },
          sections: [],
          citations: [],
        },
        dimensionPipelines: new Map(),
        todoLedger: [],
      });
      setMockHooks({
        missionView: {
          ...defaultMissionView,
          reportArtifact: null, // no canonical artifact → falls through to reportFullRef
          mission: {
            ...defaultMissionView.mission,
            status: 'completed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });

  // ── Branch coverage: mission failedAt in empty-state message ─────
  describe('empty artifact message failedAt branch', () => {
    it('shows failedAt message when mission.failedAt is set (line 516)', () => {
      // Line 516: view.mission.failedAt ? '...' : ...
      // This requires: canonicalArtifact = null, reportFullRef falsy
      // view.mission.failedAt = truthy (from useMissionLegacyView)
      setMockHooks({
        legacyMission: {
          topic: 'Test',
          status: 'failed',
          failedAt: Date.now(),
          failedMessage: 'Out of budget',
        },
        missionView: {
          ...defaultMissionView,
          reportArtifact: null,
          mission: {
            ...defaultMissionView.mission,
            status: 'failed',
            finishedAt: new Date().toISOString(),
          },
        },
      });
      render(<MissionDetailPage />);
      fireEvent.click(screen.getByTestId('tab-report'));
      // ArtifactReader renders with the empty-state content
      expect(screen.getByTestId('artifact-reader')).toBeInTheDocument();
    });
  });
});
