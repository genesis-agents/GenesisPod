import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReportVersionDrawer } from '../ReportVersionDrawer';
import type { ReportVersionMeta } from '../ArtifactReader';

vi.mock('@/components/common/drawers/SideDrawer', () => ({
  SideDrawer: ({
    open,
    children,
    title,
    onClose,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
    onClose: () => void;
    widthPx?: number;
  }) =>
    open ? (
      <div data-testid="side-drawer">
        <div data-testid="drawer-title">{title}</div>
        <button data-testid="drawer-close" onClick={onClose}>
          Close
        </button>
        {children}
      </div>
    ) : null,
}));

vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
    icon?: React.ReactNode;
  }) => (
    <div data-testid="empty-state">
      <div>{title}</div>
      {description && <div>{description}</div>}
    </div>
  ),
}));

const baseVersion: ReportVersionMeta = {
  version: 1,
  versionLabel: '首次生成',
  triggerType: 'initial',
  generatedAt: '2026-01-01T10:00:00Z',
  finalScore: 85,
  leaderSigned: true,
};

const secondVersion: ReportVersionMeta = {
  version: 2,
  versionLabel: '全量重跑',
  triggerType: 'rerun-fresh',
  generatedAt: '2026-01-02T14:30:00Z',
  finalScore: 90,
  leaderSigned: false,
};

const todoVersion: ReportVersionMeta = {
  version: 3,
  versionLabel: null,
  triggerType: 'todo-rerun',
  generatedAt: '2026-01-03T09:15:00Z',
  finalScore: null,
  leaderSigned: null,
};

describe('ReportVersionDrawer - closed state', () => {
  it('does not render when open=false', () => {
    render(
      <ReportVersionDrawer
        open={false}
        versions={[baseVersion]}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByTestId('side-drawer')).not.toBeInTheDocument();
  });
});

describe('ReportVersionDrawer - empty versions', () => {
  it('shows empty state when versions array is empty', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[]}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('暂无版本记录')).toBeInTheDocument();
  });

  it('shows "共 0 个版本" subtitle', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[]}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/共 0 个版本/)).toBeInTheDocument();
  });
});

describe('ReportVersionDrawer - single version', () => {
  it('renders drawer title', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByTestId('drawer-title').textContent).toBe('版本历史');
  });

  it('shows "共 1 个版本" in subtitle', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/共 1 个版本/)).toBeInTheDocument();
  });

  it('shows currentVersion in subtitle', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/当前显示 v1/)).toBeInTheDocument();
  });

  it('shows version number badge', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('shows trigger type label "首版" for initial', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('首版')).toBeInTheDocument();
  });

  it('shows "当前" badge for current version', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('当前')).toBeInTheDocument();
  });

  it('shows "已签" badge when leaderSigned=true', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('已签')).toBeInTheDocument();
  });

  it('shows score with green color when >= 80', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const scoreEl = screen.getByText('85 分');
    expect(scoreEl.className).toContain('text-emerald-600');
  });

  it('shows first-run hint when single version', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/首次生成版本/)).toBeInTheDocument();
  });

  it('shows versionLabel text', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('首次生成')).toBeInTheDocument();
  });

  it('renders formatted datetime', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // formatDateTime produces YYYY/MM/DD HH:MM:SS format
    expect(screen.getByText(/2026\/01\/01/)).toBeInTheDocument();
  });

  it('calls onClose when drawer close is clicked', () => {
    const onClose = vi.fn();
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('drawer-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('radio is checked for current version', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const radio = screen.getByRole('radio') as HTMLInputElement;
    expect(radio.checked).toBe(true);
  });

  it('does not call onSelectVersion when clicking current version radio', () => {
    const onSelect = vi.fn();
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        onSelectVersion={onSelect}
        onClose={vi.fn()}
      />
    );
    const radio = screen.getByRole('radio');
    fireEvent.change(radio);
    // isCurrent → should not call onSelectVersion
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('ReportVersionDrawer - multiple versions', () => {
  it('renders all versions', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion, secondVersion, todoVersion]}
        currentVersion={2}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('v2')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  it('shows "全量重跑" label for rerun-fresh', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion, secondVersion]}
        currentVersion={2}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // The component renders cfg.label (trigger type badge) AND versionLabel both as "全量重跑"
    // so use getAllByText which handles multiple matches
    expect(screen.getAllByText('全量重跑').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "TODO 重跑" label for todo-rerun', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion, secondVersion, todoVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('TODO 重跑')).toBeInTheDocument();
  });

  it('shows unknown trigger type as raw string', () => {
    const unknownVersion: ReportVersionMeta = {
      ...baseVersion,
      version: 4,
      triggerType: 'custom-trigger',
    };
    render(
      <ReportVersionDrawer
        open
        versions={[unknownVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('custom-trigger')).toBeInTheDocument();
  });

  it('calls onSelectVersion when clicking non-current version radio', () => {
    const onSelect = vi.fn();
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion, secondVersion]}
        currentVersion={1}
        onSelectVersion={onSelect}
        onClose={vi.fn()}
      />
    );
    const radios = screen.getAllByRole('radio');
    // The component renders a <label> wrapping the <input type="radio">.
    // The radio's onChange handler calls onSelectVersion only when !isCurrent.
    // Version 2 is not current (currentVersion=1).
    // Get the parent label and simulate click on label which activates the radio.
    const label = radios[1].closest('label');
    if (label) {
      fireEvent.click(label);
    } else {
      // Fallback: dispatch change event directly
      fireEvent.change(radios[1]);
    }
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it('does not show first-run hint when multiple versions', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion, secondVersion]}
        currentVersion={2}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/首次生成版本/)).not.toBeInTheDocument();
  });

  it('shows "未签" badge when leaderSigned=false', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion, secondVersion]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('未签')).toBeInTheDocument();
  });

  it('does not show signed badges when leaderSigned is null', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[todoVersion]}
        currentVersion={3}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText('已签')).not.toBeInTheDocument();
    expect(screen.queryByText('未签')).not.toBeInTheDocument();
  });

  it('shows score with amber color when 65-79', () => {
    const medVersion: ReportVersionMeta = {
      ...baseVersion,
      version: 5,
      finalScore: 70,
      leaderSigned: null,
    };
    render(
      <ReportVersionDrawer
        open
        versions={[medVersion]}
        currentVersion={5}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const scoreEl = screen.getByText('70 分');
    expect(scoreEl.className).toContain('text-amber-600');
  });

  it('shows score with red color when < 65', () => {
    const lowVersion: ReportVersionMeta = {
      ...baseVersion,
      version: 6,
      finalScore: 50,
      leaderSigned: null,
    };
    render(
      <ReportVersionDrawer
        open
        versions={[lowVersion]}
        currentVersion={6}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const scoreEl = screen.getByText('50 分');
    expect(scoreEl.className).toContain('text-red-600');
  });

  it('does not show score when finalScore is null', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[todoVersion]}
        currentVersion={3}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/分$/)).not.toBeInTheDocument();
  });

  it('does not show versionLabel when null', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[todoVersion]}
        currentVersion={3}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    // todoVersion has versionLabel=null, should not render label paragraph
    // Just check no null text is shown
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });
});

describe('ReportVersionDrawer - versionSwitching', () => {
  it('shows loading message when versionSwitching=true', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        versionSwitching
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/正在加载版本内容…/)).toBeInTheDocument();
  });

  it('disables radio when versionSwitching=true', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        versionSwitching
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    const radio = screen.getByRole('radio') as HTMLInputElement;
    expect(radio.disabled).toBe(true);
  });

  it('does not show loading message when versionSwitching=false', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        currentVersion={1}
        versionSwitching={false}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/正在加载版本内容…/)).not.toBeInTheDocument();
  });

  it('shows loading message when versionSwitching=true with no currentVersion', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        versionSwitching
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/正在加载版本内容…/)).toBeInTheDocument();
  });
});

describe('ReportVersionDrawer - currentVersion edge cases', () => {
  it('shows subtitle without current version when currentVersion is undefined', () => {
    render(
      <ReportVersionDrawer
        open
        versions={[baseVersion]}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/当前显示/)).not.toBeInTheDocument();
    expect(screen.getByText(/共 1 个版本/)).toBeInTheDocument();
  });

  it('shows "增量重跑" label for rerun-incremental trigger', () => {
    const incVersion: ReportVersionMeta = {
      ...baseVersion,
      version: 7,
      triggerType: 'rerun-incremental',
    };
    render(
      <ReportVersionDrawer
        open
        versions={[incVersion]}
        currentVersion={7}
        onSelectVersion={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('增量重跑')).toBeInTheDocument();
  });
});
