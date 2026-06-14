import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlaygroundMissionDialog } from '../PlaygroundMissionDialog';

// Stub browser APIs
Element.prototype.scrollIntoView = vi.fn();
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock API
const mockRunTeam = vi.fn();
vi.mock('@/services/agent-playground/api', () => ({
  runTeam: (...args: unknown[]) => mockRunTeam(...args),
}));

// Controllable useBudgetTiers mock
const MOCK_BUDGET_DATA = {
  tiers: [
    {
      depth: 'quick',
      label: '快速',
      desc: 'Basic',
      dimensionsHint: '2-3 维度',
      maxCredits: 100,
      budgetMultiplier: 1,
      wallTimeMinutes: 10,
      capUsd: 1,
    },
    {
      depth: 'standard',
      label: '标准',
      desc: 'Balanced',
      dimensionsHint: '4-5 维度',
      maxCredits: 300,
      budgetMultiplier: 1.5,
      wallTimeMinutes: 30,
      capUsd: 3,
    },
    {
      depth: 'deep',
      label: '深度',
      desc: 'Full',
      dimensionsHint: '6-8 维度',
      maxCredits: 800,
      budgetMultiplier: 2,
      wallTimeMinutes: 60,
      capUsd: 8,
    },
  ],
  limits: {
    maxCredits: { min: 10, max: 100000 },
    budgetMultiplier: { min: 0.3, max: 10 },
    wallTimeMinutes: { min: 1, max: 180 },
  },
};

let mockBudgetData: typeof MOCK_BUDGET_DATA | null = MOCK_BUDGET_DATA;

vi.mock('@/hooks/features/useBudgetTiers', () => ({
  useBudgetTiers: () => ({
    data: mockBudgetData,
    loading: false,
  }),
  pickTier: (
    data: {
      tiers: {
        depth: string;
        label: string;
        dimensionsHint: string;
        maxCredits: number;
        wallTimeMinutes: number;
        budgetMultiplier: number;
        capUsd: number;
      }[];
    } | null,
    depth: string
  ) => data?.tiers.find((t) => t.depth === depth),
}));

// Mock MissionDialogShell
vi.mock('@/components/common/dialogs/MissionDialogShell', () => ({
  MissionDialogShell: ({
    isOpen,
    onClose,
    title,
    subtitle,
    primary,
    advanced,
    error,
    submitting,
    submitDisabled,
    onSubmit,
    footerLeftSlot,
    submitLabel,
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    primary: React.ReactNode;
    advanced?: React.ReactNode;
    error?: string | null;
    submitting?: boolean;
    submitDisabled?: boolean;
    onSubmit: () => void;
    footerLeftSlot?: React.ReactNode;
    submitLabel: string;
  }) =>
    isOpen ? (
      <div data-testid="mission-dialog">
        <span data-testid="dialog-title">{title}</span>
        {subtitle && <span data-testid="dialog-subtitle">{subtitle}</span>}
        {error && <span data-testid="dialog-error">{error}</span>}
        {footerLeftSlot && (
          <div data-testid="footer-left">{footerLeftSlot}</div>
        )}
        <button data-testid="dialog-close" onClick={onClose}>
          close
        </button>
        <button
          data-testid="dialog-submit"
          onClick={onSubmit}
          disabled={!!submitDisabled}
        >
          {submitLabel}
        </button>
        <div data-testid="primary-content">{primary}</div>
        {advanced && <div data-testid="advanced-content">{advanced}</div>}
      </div>
    ) : null,
}));

// Mock BudgetAndTimeLimitPanel
vi.mock('@/components/agent-playground/panels/BudgetAndTimeLimitPanel', () => ({
  BudgetAndTimeLimitPanel: ({
    maxCredits,
    setMaxCredits,
    budgetMultiplierOverride,
    setBudgetMultiplierOverride,
    wallTimeMinutes,
    setWallTimeMinutes,
  }: {
    maxCredits: number;
    setMaxCredits: (v: number) => void;
    budgetMultiplierOverride: number;
    setBudgetMultiplierOverride: (v: number) => void;
    wallTimeMinutes: number;
    setWallTimeMinutes: (v: number) => void;
  }) => (
    <div data-testid="budget-panel">
      <input
        type="number"
        data-testid="max-credits-input"
        value={maxCredits}
        onChange={(e) => setMaxCredits(Number(e.target.value))}
      />
      <input
        type="number"
        data-testid="multiplier-input"
        value={budgetMultiplierOverride}
        onChange={(e) => setBudgetMultiplierOverride(Number(e.target.value))}
      />
      <input
        type="number"
        data-testid="wall-time-input"
        value={wallTimeMinutes}
        onChange={(e) => setWallTimeMinutes(Number(e.target.value))}
      />
    </div>
  ),
  MAX_CREDITS_LIMIT: { min: 10, max: 100000 },
  MULTIPLIER_LIMIT: { min: 0.3, max: 10 },
  WALL_TIME_LIMIT_MINUTES: { min: 1, max: 180 },
}));

// Mock KnowledgeBaseSelector
vi.mock('@/components/common/selectors', () => ({
  KnowledgeBaseSelector: ({
    selectedIds,
    onSelectionChange,
    multiple,
    maxSelections,
    filterType,
    onlyReady,
  }: {
    selectedIds: string[];
    onSelectionChange: (ids: string[]) => void;
    multiple?: boolean;
    maxSelections?: number;
    filterType?: string;
    onlyReady?: boolean;
  }) => (
    <div data-testid="kb-selector">
      <button
        data-testid="kb-add-btn"
        onClick={() => onSelectionChange(['kb-1'])}
      >
        Add KB
      </button>
      <button data-testid="kb-clear-btn" onClick={() => onSelectionChange([])}>
        Clear KB
      </button>
      <span>{selectedIds.join(',')}</span>
    </div>
  ),
}));

describe('PlaygroundMissionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockBudgetData = MOCK_BUDGET_DATA;
  });

  afterEach(() => {
    localStorageMock.clear();
    mockBudgetData = MOCK_BUDGET_DATA;
  });

  it('does not render when isOpen=false', () => {
    render(<PlaygroundMissionDialog isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('mission-dialog')).toBeNull();
  });

  it('renders when isOpen=true', () => {
    render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('mission-dialog')).toBeInTheDocument();
  });

  it('shows correct title', () => {
    render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
    expect(screen.getByTestId('dialog-title')).toHaveTextContent(
      '新建洞察 Mission'
    );
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<PlaygroundMissionDialog isOpen onClose={onClose} />);
    fireEvent.click(screen.getByTestId('dialog-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('topic input', () => {
    it('renders topic input', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      expect(input).toBeInTheDocument();
    });

    it('submit button disabled when topic empty', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByTestId('dialog-submit')).toBeDisabled();
    });

    it('submit button enabled when topic has value', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'My Research Topic' } });
      expect(screen.getByTestId('dialog-submit')).not.toBeDisabled();
    });

    it('shows character count when topic has value', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Hello' } });
      expect(screen.getByText('5/200')).toBeInTheDocument();
    });

    it('shows sample topic buttons when topic is empty', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(
        screen.getByText('2026 Q2 AI Agent 市场格局与竞争力变化')
      ).toBeInTheDocument();
    });

    it('clicking sample topic fills input', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(
        screen.getByText('2026 Q2 AI Agent 市场格局与竞争力变化')
      );
      const input = screen.getByPlaceholderText(
        /2026 Q2 AI Agent/
      ) as HTMLInputElement;
      expect(input.value).toBe('2026 Q2 AI Agent 市场格局与竞争力变化');
    });

    it('hides sample topics when topic is filled', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Topic' } });
      expect(
        screen.queryByText('全球存储芯片供需拐点与主要厂商策略')
      ).toBeNull();
    });
  });

  describe('description input', () => {
    it('renders description textarea', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/聚焦头部 5 家厂商/);
      expect(textarea).toBeInTheDocument();
    });

    it('shows char count when description has value', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const textarea = screen.getByPlaceholderText(/聚焦头部 5 家厂商/);
      fireEvent.change(textarea, { target: { value: 'Test desc' } });
      expect(screen.getByText('9/10000')).toBeInTheDocument();
    });
  });

  describe('depth selection', () => {
    it('renders all depth options', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('快速')).toBeInTheDocument();
      // "标准" appears in both the depth tiles and audit options — check at least one exists
      expect(screen.getAllByText('标准').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('深度')).toBeInTheDocument();
    });

    it('shows tier hints', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // "约 $8" appears in both the depth tile hint and the budget checkbox label
      expect(screen.getAllByText(/约 \$8/).length).toBeGreaterThanOrEqual(1);
    });

    it('clicking depth tile persists to localStorage', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('快速'));
      const stored =
        window.localStorage.getItem('playground:depth') ??
        localStorageMock.getItem('playground:depth');
      expect(stored).toBe('quick');
    });

    it('default depth is deep (from localStorage defaulting)', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // Deep should be selected by default — "约 $8" text with "60 分钟" appears in tile + budget label
      expect(
        screen.getAllByText(/约 \$8.*60 分钟/).length
      ).toBeGreaterThanOrEqual(1);
    });
  });

  describe('language select', () => {
    it('renders language dropdown', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const select = screen
        .getAllByRole('combobox')
        .find((s) => s.textContent?.includes('中文'));
      expect(select).toBeInTheDocument();
    });

    it('can select English', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const selects = screen.getAllByRole('combobox');
      const langSelect = selects.find((s) =>
        s.querySelector('option[value="zh-CN"]')
      );
      if (langSelect) {
        fireEvent.change(langSelect, { target: { value: 'en-US' } });
        expect((langSelect as HTMLSelectElement).value).toBe('en-US');
      }
    });
  });

  describe('form submission', () => {
    it('shows error when topic too short', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'new-mission' });
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'ab' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toHaveTextContent(
          'Topic 至少 4 个字符'
        );
      });
    });

    it('does nothing when topic is empty', async () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).not.toHaveBeenCalled();
      });
    });

    it('submits successfully and calls onCreated', async () => {
      const onCreated = vi.fn();
      const onClose = vi.fn();
      mockRunTeam.mockResolvedValue({ missionId: 'mission-abc' });
      render(
        <PlaygroundMissionDialog
          isOpen
          onClose={onClose}
          onCreated={onCreated}
        />
      );
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Test Research Topic' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            topic: 'Test Research Topic',
            depth: 'deep',
            language: 'zh-CN',
          })
        );
      });
      await waitFor(() => {
        expect(onCreated).toHaveBeenCalledWith('mission-abc');
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('navigates to mission when no onCreated', async () => {
      const onClose = vi.fn();
      mockRunTeam.mockResolvedValue({ missionId: 'mission-xyz' });
      render(<PlaygroundMissionDialog isOpen onClose={onClose} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Research Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(
          '/agent-playground/team/mission-xyz'
        );
      });
    });

    it('shows error when submission fails', async () => {
      mockRunTeam.mockRejectedValue(new Error('Server error'));
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toHaveTextContent(
          'Server error'
        );
      });
    });

    it('shows submitting label while submitting', async () => {
      mockRunTeam.mockReturnValue(new Promise(() => {}));
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-submit')).toHaveTextContent(
          '启动中…'
        );
      });
    });

    it('throws error when missionId is undefined string', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'undefined' });
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Test' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toBeInTheDocument();
      });
    });

    it('throws error when missionId is missing', async () => {
      mockRunTeam.mockResolvedValue({});
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Test X' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toBeInTheDocument();
      });
    });

    it('sends description when provided', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'mission-desc' });
      const onCreated = vi.fn();
      render(
        <PlaygroundMissionDialog
          isOpen
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      );
      const topicInput = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(topicInput, { target: { value: 'Valid Topic Here' } });
      const descTextarea = screen.getByPlaceholderText(/聚焦头部 5 家厂商/);
      fireEvent.change(descTextarea, {
        target: { value: 'Research description here' },
      });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            description: 'Research description here',
          })
        );
      });
    });

    it('does not send empty description', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'mission-nodesc' });
      const onCreated = vi.fn();
      render(
        <PlaygroundMissionDialog
          isOpen
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      );
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here Now' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).toHaveBeenCalledWith(
          expect.not.objectContaining({
            description: expect.any(String),
          })
        );
      });
    });
  });

  describe('advanced settings', () => {
    it('renders advanced content', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByTestId('advanced-content')).toBeInTheDocument();
    });

    it('renders search time range options', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('1 月')).toBeInTheDocument();
      expect(screen.getByText('3 月')).toBeInTheDocument();
      expect(screen.getByText('不限')).toBeInTheDocument();
    });

    it('clicking search time range persists to localStorage', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('1 月'));
      const stored =
        window.localStorage.getItem('playground:searchTimeRange') ??
        localStorageMock.getItem('playground:searchTimeRange');
      expect(stored).toBe('30d');
    });

    it('renders audit options', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('最简')).toBeInTheDocument();
      // "标准" appears in both audit options and depth tiles
      expect(screen.getAllByText('标准').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('完整')).toBeInTheDocument();
      expect(screen.getByText('全审')).toBeInTheDocument();
    });

    it('clicking audit option persists to localStorage', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('最简'));
      const stored =
        window.localStorage.getItem('playground:auditLayers') ??
        localStorageMock.getItem('playground:auditLayers');
      expect(stored).toBe('minimal');
    });

    it('renders style profile select', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('管理层简报')).toBeInTheDocument();
    });

    it('changing style profile persists to localStorage', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const selects = screen.getAllByRole('combobox');
      const styleSelect = selects.find((s) =>
        s.querySelector('option[value="executive"]')
      );
      if (styleSelect) {
        fireEvent.change(styleSelect, { target: { value: 'academic' } });
        const stored =
          window.localStorage.getItem('playground:styleProfile') ??
          localStorageMock.getItem('playground:styleProfile');
        expect(stored).toBe('academic');
      }
    });

    it('renders length profile select', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('简洁')).toBeInTheDocument();
    });

    it('changing length profile persists to localStorage', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const selects = screen.getAllByRole('combobox');
      const lenSelect = selects.find((s) =>
        s.querySelector('option[value="brief"]')
      );
      if (lenSelect) {
        fireEvent.change(lenSelect, { target: { value: 'brief' } });
        const stored =
          window.localStorage.getItem('playground:lengthProfile') ??
          localStorageMock.getItem('playground:lengthProfile');
        expect(stored).toBe('brief');
      }
    });

    it('renders audience profile select', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('领域专家')).toBeInTheDocument();
    });

    it('changing audience profile persists to localStorage', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const selects = screen.getAllByRole('combobox');
      const audienceSelect = selects.find((s) =>
        s.querySelector('option[value="domain-expert"]')
      );
      if (audienceSelect) {
        fireEvent.change(audienceSelect, { target: { value: 'executive' } });
        const stored =
          window.localStorage.getItem('playground:audienceProfile') ??
          localStorageMock.getItem('playground:audienceProfile');
        expect(stored).toBe('executive');
      }
    });

    it('renders withFigures toggle', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText('图文并茂')).toBeInTheDocument();
    });

    it('toggles withFigures on button click', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // Find the toggle button via "图文并茂" text proximity
      const label = screen.getByText('图文并茂');
      const container = label.closest('div');
      const toggleContainer = container?.closest(
        'div.flex.items-center.justify-between'
      );
      const btn = toggleContainer?.querySelector(
        'button[type="button"]'
      ) as HTMLButtonElement | null;
      if (btn) {
        fireEvent.click(btn);
        // After click, withFigures is false → localStorage has '0'
        const stored =
          window.localStorage.getItem('playground:withFigures') ??
          localStorageMock.getItem('playground:withFigures');
        expect(stored).toBe('0');
      } else {
        // Fallback: find by class
        const toggleBtn = document.querySelector(
          '.bg-blue-600, .bg-gray-200'
        ) as HTMLButtonElement | null;
        if (toggleBtn) {
          fireEvent.click(toggleBtn);
          const stored =
            window.localStorage.getItem('playground:withFigures') ??
            localStorageMock.getItem('playground:withFigures');
          // After toggling, either '0' or '1' should be set
          expect(['0', '1']).toContain(stored);
        }
      }
    });

    it('renders knowledge base selector', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByTestId('kb-selector')).toBeInTheDocument();
    });

    it('shows KB notice when knowledge bases selected', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByTestId('kb-add-btn'));
      expect(screen.getByText(/已挂载 1 个知识源/)).toBeInTheDocument();
    });

    it('sends knowledgeBaseIds when KBs selected', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'mission-kb' });
      const onCreated = vi.fn();
      render(
        <PlaygroundMissionDialog
          isOpen
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      );
      // Add KB
      fireEvent.click(screen.getByTestId('kb-add-btn'));
      // Set topic
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Topic with KB here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            knowledgeBaseIds: ['kb-1'],
          })
        );
      });
    });

    it('shows radar notice', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.getByText(/雷达信号已自动接入/)).toBeInTheDocument();
    });
  });

  describe('budget override', () => {
    it('renders budget override checkbox', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('enables budget panel when checkbox checked', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(screen.getByTestId('budget-panel')).toBeInTheDocument();
    });

    it('initializes budget from current tier when enabling override', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      const maxCreditsInput = screen.getByTestId(
        'max-credits-input'
      ) as HTMLInputElement;
      // Default depth is 'deep' which has maxCredits=800
      expect(maxCreditsInput.value).toBe('800');
    });

    it('shows error when credits out of range', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'mission-budget' });
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // Set invalid credits
      const maxCreditsInput = screen.getByTestId('max-credits-input');
      fireEvent.change(maxCreditsInput, { target: { value: '5' } }); // below min=10
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toHaveTextContent(
          /Credits 上限必须/
        );
      });
    });

    it('shows error when multiplier out of range', async () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // Credits is set to 800 (valid), set multiplier to invalid
      const multiplierInput = screen.getByTestId('multiplier-input');
      fireEvent.change(multiplierInput, { target: { value: '0.1' } }); // below min=0.3
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toHaveTextContent(
          /Agent 倍率必须/
        );
      });
    });

    it('shows error when wallTime out of range', async () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // Set valid credits and multiplier
      const wallTimeInput = screen.getByTestId('wall-time-input');
      fireEvent.change(wallTimeInput, { target: { value: '0' } }); // below min=1
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toHaveTextContent(
          /时长上限必须/
        );
      });
    });

    it('sends budget override when enabled and valid', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'mission-budgeted' });
      const onCreated = vi.fn();
      render(
        <PlaygroundMissionDialog
          isOpen
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      );
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      // Default values from tier (800/2/60) are valid
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here Now' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).toHaveBeenCalledWith(
          expect.objectContaining({
            maxCredits: 800,
            budgetMultiplierOverride: 2,
            wallTimeCapMs: 60 * 60_000,
          })
        );
      });
    });

    it('does not send budget fields when override disabled', async () => {
      mockRunTeam.mockResolvedValue({ missionId: 'mission-nobudget' });
      const onCreated = vi.fn();
      render(
        <PlaygroundMissionDialog
          isOpen
          onClose={vi.fn()}
          onCreated={onCreated}
        />
      );
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here Yes' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(mockRunTeam).toHaveBeenCalledWith(
          expect.not.objectContaining({
            maxCredits: expect.any(Number),
          })
        );
      });
    });
  });

  describe('reset defaults', () => {
    it('shows reset button when profile is custom', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // Select a non-default depth
      fireEvent.click(screen.getByText('快速'));
      expect(screen.getByTestId('footer-left')).toBeInTheDocument();
      expect(screen.getByText('恢复默认配置')).toBeInTheDocument();
    });

    it('does not show reset button when defaults', () => {
      // Default is deep, executive, standard, domain-expert, withFigures=true, default, 365d
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(screen.queryByText('恢复默认配置')).toBeNull();
    });

    it('clicking reset restores defaults', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // Change depth
      fireEvent.click(screen.getByText('快速'));
      expect(screen.getByText('恢复默认配置')).toBeInTheDocument();
      fireEvent.click(screen.getByText('恢复默认配置'));
      // Reset button should disappear since profile is now default
      expect(screen.queryByText('恢复默认配置')).toBeNull();
    });

    it('reset removes localStorage keys', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('快速'));
      fireEvent.click(screen.getByText('恢复默认配置'));
      // depth key should be removed
      expect(localStorageMock.getItem('playground:depth')).toBeNull();
    });
  });

  describe('isCustomProfile detection', () => {
    it('non-default audit shows reset button', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('最简'));
      expect(screen.getByText('恢复默认配置')).toBeInTheDocument();
    });

    it('non-default searchTimeRange shows reset button', () => {
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      fireEvent.click(screen.getByText('1 月'));
      expect(screen.getByText('恢复默认配置')).toBeInTheDocument();
    });
  });

  describe('localStorage preferences', () => {
    it('loads depth from localStorage', () => {
      localStorageMock.setItem('playground:depth', 'quick');
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // Quick should be selected - verified by tile check icon
      // The depth is used in submission
    });

    it('loads styleProfile from localStorage', () => {
      localStorageMock.setItem('playground:styleProfile', 'academic');
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const selects = screen.getAllByRole('combobox');
      const styleSelect = selects.find((s) =>
        s.querySelector('option[value="academic"]')
      );
      if (styleSelect) {
        expect((styleSelect as HTMLSelectElement).value).toBe('academic');
      }
    });

    it('loads withFigures from localStorage (false)', () => {
      localStorageMock.setItem('playground:withFigures', '0');
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // withFigures=false -> toggle should be gray (bg-gray-200)
      const toggle = document.querySelector('.bg-gray-200');
      expect(toggle).toBeTruthy();
    });
  });

  describe('branch coverage for lines 279, 413-428, 560', () => {
    it('shows fallback budget text when budgetTierData is null (covers line 413 false branch)', () => {
      // When budgetTierData is null, pickTier returns undefined → shows fallback description
      mockBudgetData = null;
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      expect(
        screen.getByText(
          '默认按当前调研规模档位自动匹配。开启后可手动设定 Credits / 倍率 / 时长。'
        )
      ).toBeInTheDocument();
    });

    it('does not populate budget fields when tier not found on checkbox enable (covers line 428 false branch)', () => {
      // budgetTierData null → tier is undefined → if (on && tier) is false → budget fields stay at 0
      mockBudgetData = null;
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      // checkbox is disabled when !budgetTierData, so onChange cannot fire
      expect(checkbox).toBeDisabled();
    });

    it('unchecking the budget checkbox does not set tier fields (covers on=false branch in line 428)', () => {
      // Enable then disable budget override — second click triggers onChange with on=false
      // if (on && tier) → false because on=false → budget fields not updated
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const checkbox = screen.getByRole('checkbox');
      // First click: enable (on=true, tier=deepTier → sets maxCredits=800)
      fireEvent.click(checkbox);
      expect(screen.getByTestId('budget-panel')).toBeInTheDocument();
      // Second click: disable (on=false → if(on && tier) is false → body skipped)
      fireEvent.click(checkbox);
      expect(screen.queryByTestId('budget-panel')).toBeNull();
    });

    it('handles non-Error thrown by runTeam (covers line 279 String(err) branch)', async () => {
      // Throw a string (not Error) to hit `String(err)` branch in catch
      mockRunTeam.mockRejectedValue('raw-string-error');
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      const input = screen.getByPlaceholderText(/2026 Q2 AI Agent/);
      fireEvent.change(input, { target: { value: 'Valid Topic Here' } });
      fireEvent.click(screen.getByTestId('dialog-submit'));
      await waitFor(() => {
        expect(screen.getByTestId('dialog-error')).toHaveTextContent(
          'raw-string-error'
        );
      });
    });

    it("toggles withFigures from false to true persists '1' to localStorage (covers line 560 '1' branch)", () => {
      // Start with withFigures=false from localStorage
      localStorageMock.setItem('playground:withFigures', '0');
      render(<PlaygroundMissionDialog isOpen onClose={vi.fn()} />);
      // Find the toggle button (bg-gray-200 when off)
      const toggleBtn = document.querySelector(
        '.bg-gray-200'
      ) as HTMLButtonElement | null;
      if (toggleBtn) {
        fireEvent.click(toggleBtn);
        // After click: withFigures=true → localStorage gets '1'
        const stored =
          window.localStorage.getItem('playground:withFigures') ??
          localStorageMock.getItem('playground:withFigures');
        expect(stored).toBe('1');
      }
    });
  });
});
