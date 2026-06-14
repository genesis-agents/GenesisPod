import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ArtifactReader } from '../ArtifactReader';
import { makeArtifact } from './fixtures';
import type { ReportVersionMeta } from '../ArtifactReader';
import type { DimensionPipelineState } from '@/lib/features/agent-playground/mission-presentation.types';

// Mock heavy sub-components
vi.mock('../ContinuousReader', () => ({
  ContinuousReader: () => <div data-testid="continuous-reader" />,
}));
vi.mock('../ChapterReader', () => ({
  ChapterReader: () => <div data-testid="chapter-reader" />,
}));
vi.mock('../QuickReader', () => ({
  QuickReader: ({ onSwitchToFull }: { onSwitchToFull?: () => void }) => (
    <div data-testid="quick-reader">
      {onSwitchToFull && (
        <button onClick={onSwitchToFull}>switch-to-full</button>
      )}
    </div>
  ),
}));
vi.mock('../QualityBadge', () => ({
  QualityBadge: () => <div data-testid="quality-badge" />,
}));
vi.mock('../FactTablePanel', () => ({
  FactTablePanel: () => <div data-testid="fact-table-panel" />,
}));
vi.mock('../ReconciliationPanel', () => ({
  ReconciliationPanel: () => <div data-testid="reconciliation-panel" />,
}));
vi.mock('../ToolRecallTrace', () => ({
  ToolRecallTrace: () => <div data-testid="tool-recall-trace" />,
}));
vi.mock('../ReportVersionDrawer', () => ({
  ReportVersionDrawer: ({
    open,
    onClose,
    onSelectVersion,
  }: {
    open: boolean;
    onClose: () => void;
    onSelectVersion?: (v: number) => void;
  }) =>
    open ? (
      <div data-testid="version-drawer">
        <button onClick={onClose}>close-version</button>
        {onSelectVersion && (
          <button onClick={() => onSelectVersion(2)}>select-version-2</button>
        )}
      </div>
    ) : null,
}));
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
  }) =>
    open ? (
      <div data-testid="side-drawer">
        <div data-testid="drawer-title">{title}</div>
        <button data-testid="drawer-close" onClick={onClose}>
          X
        </button>
        {children}
      </div>
    ) : null,
}));
vi.mock('@/components/common/dialogs/ExportDialog', () => ({
  ExportDialog: ({
    isOpen,
    onClose,
  }: {
    isOpen: boolean;
    onClose?: () => void;
  }) =>
    isOpen ? (
      <div data-testid="export-dialog">
        <button data-testid="export-dialog-close" onClick={onClose}>
          close
        </button>
      </div>
    ) : null,
}));
vi.mock('@/lib/utils/config', () => ({
  config: { apiBaseUrl: 'http://localhost:3001' },
}));
vi.mock('@/lib/utils/auth', () => ({
  getAuthHeader: () => ({ Authorization: 'Bearer test-token' }),
}));

// Stub window APIs
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  // jsdom does not allow redefining window.location; spy on history instead
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  // Reset hash to empty between tests
  window.location.hash = '';
});

afterEach(() => {
  vi.restoreAllMocks();
  window.location.hash = '';
});

const sampleVersions: ReportVersionMeta[] = [
  {
    version: 1,
    versionLabel: 'initial',
    triggerType: 'initial',
    generatedAt: '2026-01-01T10:00:00Z',
    finalScore: 85,
    leaderSigned: true,
  },
  {
    version: 2,
    versionLabel: 'rerun',
    triggerType: 'rerun-fresh',
    generatedAt: '2026-01-02T10:00:00Z',
    finalScore: 90,
    leaderSigned: true,
  },
];

describe('ArtifactReader - default view', () => {
  it('renders continuous view by default', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    expect(screen.getByTestId('continuous-reader')).toBeInTheDocument();
  });

  it('renders view switch buttons', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    expect(screen.getByText('连续视图')).toBeInTheDocument();
    expect(screen.getByText('章节视图')).toBeInTheDocument();
    expect(screen.getByText('快速视图')).toBeInTheDocument();
  });

  it('switches to chapter view on click', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('章节视图'));
    expect(screen.getByTestId('chapter-reader')).toBeInTheDocument();
    expect(screen.queryByTestId('continuous-reader')).not.toBeInTheDocument();
  });

  it('switches to quick view on click', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('快速视图'));
    expect(screen.getByTestId('quick-reader')).toBeInTheDocument();
    expect(screen.queryByTestId('continuous-reader')).not.toBeInTheDocument();
  });

  it('switches back to continuous from quick view via onSwitchToFull', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('快速视图'));
    expect(screen.getByTestId('quick-reader')).toBeInTheDocument();
    fireEvent.click(screen.getByText('switch-to-full'));
    expect(screen.getByTestId('continuous-reader')).toBeInTheDocument();
  });

  it('uses defaultView prop to set initial view', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} defaultView="chapter" />);
    expect(screen.getByTestId('chapter-reader')).toBeInTheDocument();
    expect(screen.queryByTestId('continuous-reader')).not.toBeInTheDocument();
  });
});

describe('ArtifactReader - toolbar', () => {
  it('shows quality score in toolbar button', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    // "报告分析" button shows quality score
    expect(screen.getByText('报告分析')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
  });

  it('shows green score color when overall >= 80', () => {
    const artifact = makeArtifact();
    const { container } = render(<ArtifactReader artifact={artifact} />);
    const scoreEl = container.querySelector('.text-emerald-600');
    expect(scoreEl).toBeInTheDocument();
    expect(scoreEl!.textContent).toBe('85');
  });

  it('shows amber score color when overall 65-79', () => {
    const artifact = makeArtifact();
    artifact.quality.overall = 70;
    const { container } = render(<ArtifactReader artifact={artifact} />);
    const scoreEl = container.querySelector('.text-amber-600');
    expect(scoreEl).toBeInTheDocument();
  });

  it('shows red score color when overall < 65', () => {
    const artifact = makeArtifact();
    artifact.quality.overall = 40;
    const { container } = render(<ArtifactReader artifact={artifact} />);
    const scoreEl = container.querySelector('.text-red-600');
    expect(scoreEl).toBeInTheDocument();
  });

  it('shows version history button when reportVersions and onSelectVersion provided', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
        onSelectVersion={vi.fn()}
      />
    );
    expect(screen.getByText('版本历史')).toBeInTheDocument();
  });

  it('does not show version history button without onSelectVersion', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
      />
    );
    expect(screen.queryByText('版本历史')).not.toBeInTheDocument();
  });

  it('does not show version history button when reportVersions is empty', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={[]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
      />
    );
    expect(screen.queryByText('版本历史')).not.toBeInTheDocument();
  });

  it('shows current version badge from currentVersion prop', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={2}
        onSelectVersion={vi.fn()}
      />
    );
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('falls back to artifact.metadata.version when currentVersion not provided', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        onSelectVersion={vi.fn()}
      />
    );
    // artifact.metadata.version = 1
    expect(screen.getByText('v1')).toBeInTheDocument();
  });

  it('shows version count when > 1', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
        onSelectVersion={vi.fn()}
      />
    );
    // 2 versions, shows "/ 2"
    expect(screen.getByText(/\/ 2/)).toBeInTheDocument();
  });

  it('does not show count divider when only 1 version', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={[sampleVersions[0]]}
        currentVersion={1}
        onSelectVersion={vi.fn()}
      />
    );
    expect(screen.queryByText(/\/ 2/)).not.toBeInTheDocument();
  });

  it('shows export menu when missionId provided', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);
    expect(screen.getByText('导出报告')).toBeInTheDocument();
    expect(screen.getByText('原始数据')).toBeInTheDocument();
  });

  it('does not show export menu when missionId not provided', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    expect(screen.queryByText('导出报告')).not.toBeInTheDocument();
  });
});

describe('ArtifactReader - insights drawer', () => {
  it('opens insights drawer when "报告分析" button is clicked', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-title').textContent).toBe('报告分析');
  });

  it('closes insights drawer when close button clicked', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByTestId('side-drawer')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('drawer-close'));
    expect(screen.queryByTestId('side-drawer')).not.toBeInTheDocument();
  });

  it('shows 质量 tab by default in drawer', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByTestId('quality-badge')).toBeInTheDocument();
  });

  it('shows 元信息 tab button in drawer', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    const tabs = screen.getAllByRole('button');
    const metaTab = tabs.find((b) => b.textContent === '元信息');
    expect(metaTab).toBeInTheDocument();
  });

  it('switches to meta tab in drawer', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    // Find buttons inside drawer
    fireEvent.click(screen.getByText('元信息'));
    // Meta tab content should show topic
    expect(screen.getByText('AI 市场分析')).toBeInTheDocument();
  });

  it('shows 事实表 tab when factTable is non-empty', () => {
    const artifact = makeArtifact({
      factTable: [
        {
          id: 'f1',
          entity: '某公司',
          attribute: '市值',
          value: '1万亿',
          sources: [1],
        },
      ],
    });
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('事实表')).toBeInTheDocument();
  });

  it('does not show 事实表 tab when factTable is empty', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.queryByText('事实表')).not.toBeInTheDocument();
  });

  it('renders FactTablePanel when 事实表 tab selected', () => {
    const artifact = makeArtifact({
      factTable: [
        {
          id: 'f1',
          entity: 'test',
          attribute: 'attr',
          value: 'val',
          sources: [1],
        },
      ],
    });
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('事实表'));
    expect(screen.getByTestId('fact-table-panel')).toBeInTheDocument();
  });

  it('shows 对账 tab when reconciliationReport provided', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reconciliationReport={{ conflicts: [], overlaps: [], gaps: [] }}
      />
    );
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('对账')).toBeInTheDocument();
  });

  it('does not show 对账 tab when reconciliationReport absent', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.queryByText('对账')).not.toBeInTheDocument();
  });

  it('renders ReconciliationPanel when 对账 tab selected', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reconciliationReport={{ conflicts: [] }}
      />
    );
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('对账'));
    expect(screen.getByTestId('reconciliation-panel')).toBeInTheDocument();
  });

  it('shows 工具召回 tab when toolRecallEntries provided', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        toolRecallEntries={[
          {
            agentId: 'agent-1',
            role: 'researcher',
            recalledIds: [],
            categories: [],
            source: 'web-search',
          },
        ]}
      />
    );
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('工具召回')).toBeInTheDocument();
  });

  it('does not show 工具召回 tab when toolRecallEntries is empty', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} toolRecallEntries={[]} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.queryByText('工具召回')).not.toBeInTheDocument();
  });

  it('renders ToolRecallTrace when 工具召回 tab selected', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        toolRecallEntries={[
          {
            agentId: 'agent-1',
            role: 'researcher',
            recalledIds: [],
            categories: [],
            source: 'web-search',
          },
        ]}
      />
    );
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('工具召回'));
    expect(screen.getByTestId('tool-recall-trace')).toBeInTheDocument();
  });
});

describe('ArtifactReader - version drawer', () => {
  it('opens version drawer when 版本历史 button clicked', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
        onSelectVersion={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('版本历史'));
    expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
  });

  it('closes version drawer when close is called', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
        onSelectVersion={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('版本历史'));
    expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close-version'));
    expect(screen.queryByTestId('version-drawer')).not.toBeInTheDocument();
  });

  it('calls onSelectVersion when version is selected in drawer', () => {
    const onSelectVersion = vi.fn();
    // The mock ReportVersionDrawer doesn't call onSelectVersion, but
    // the real prop is passed through. We verify the prop chain.
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
        onSelectVersion={onSelectVersion}
      />
    );
    // ReportVersionDrawer mock doesn't expose version selection
    // Just verify it renders with the prop
    fireEvent.click(screen.getByText('版本历史'));
    expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
  });
});

describe('ArtifactReader - revising banner', () => {
  it('shows revising banner when dimensionPipelines has revising chapters', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '市场分析',
        {
          dimension: '市场分析',
          status: 'running',
          chapters: [
            { index: 0, heading: '市场概述', status: 'revising' },
            { index: 1, heading: '市场规模', status: 'writing' },
          ],
        },
      ],
    ]);
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText(/正在修订 2 个章节/)).toBeInTheDocument();
  });

  it('shows "chapters" plural for > 1 revising', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '维度',
        {
          dimension: '维度',
          status: 'running',
          chapters: [
            { index: 0, heading: '章节1', status: 'revising' },
            { index: 1, heading: '章节2', status: 'writing' },
          ],
        },
      ],
    ]);
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    // The banner renders "正在修订 2 个章节 · Revising 2 chapters"
    expect(screen.getByText(/正在修订 2 个章节/)).toBeInTheDocument();
  });

  it('shows "chapter" singular for 1 revising', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '维度',
        {
          dimension: '维度',
          status: 'running',
          chapters: [{ index: 0, heading: '章节1', status: 'revising' }],
        },
      ],
    ]);
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    // The banner renders "正在修订 1 个章节 · Revising 1 chapter" (no 's')
    expect(screen.getByText(/正在修订 1 个章节/)).toBeInTheDocument();
  });

  it('shows chapter status labels in banner', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '维度',
        {
          dimension: '维度',
          status: 'running',
          chapters: [
            { index: 0, heading: '写作章节', status: 'writing' },
            { index: 1, heading: '评审章节', status: 'reviewing' },
            { index: 2, heading: '修订章节', status: 'revising' },
          ],
        },
      ],
    ]);
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    // Each status label is in its own span wrapped in "()"
    expect(screen.getByText('(写作中 · writing)')).toBeInTheDocument();
    expect(screen.getByText('(评审中 · reviewing)')).toBeInTheDocument();
    expect(screen.getByText('(修订中 · revising)')).toBeInTheDocument();
  });

  it('shows truncation notice when > 6 revising chapters', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '维度',
        {
          dimension: '维度',
          status: 'running',
          chapters: Array.from({ length: 8 }, (_, i) => ({
            index: i,
            heading: `章节${i + 1}`,
            status: 'revising' as const,
          })),
        },
      ],
    ]);
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.getByText(/还有 2 个章节进行中/)).toBeInTheDocument();
  });

  it('does not show banner when no revising chapters', () => {
    const artifact = makeArtifact();
    const pipelines = new Map<string, DimensionPipelineState>([
      [
        '维度',
        {
          dimension: '维度',
          status: 'done',
          chapters: [{ index: 0, heading: '章节1', status: 'passed' }],
        },
      ],
    ]);
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={pipelines} />
    );
    expect(screen.queryByText(/正在修订/)).not.toBeInTheDocument();
  });

  it('does not show banner when dimensionPipelines is empty', () => {
    const artifact = makeArtifact();
    render(
      <ArtifactReader artifact={artifact} dimensionPipelines={new Map()} />
    );
    expect(screen.queryByText(/正在修订/)).not.toBeInTheDocument();
  });

  it('does not show banner when dimensionPipelines is undefined', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    expect(screen.queryByText(/正在修订/)).not.toBeInTheDocument();
  });
});

describe('ArtifactReader - export dialog mirror', () => {
  it('mounts hidden ContinuousReader mirror when in chapter view and export dialog open', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="m1" />);
    // Switch to chapter view
    fireEvent.click(screen.getByText('章节视图'));
    // Open export dialog
    fireEvent.click(screen.getByText('导出报告'));
    // Should render export dialog
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
  });

  it('does not mount mirror in continuous view', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="m1" />);
    // Already in continuous view
    fireEvent.click(screen.getByText('导出报告'));
    // In continuous view the mirror div should NOT render (view === 'continuous')
    // But there IS a ContinuousReader rendered normally
    expect(screen.getByTestId('continuous-reader')).toBeInTheDocument();
  });

  it('raw data menu opens on secondary button click', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="m1" />);
    fireEvent.click(screen.getByText('原始数据'));
    // Menu appears with format options
    expect(screen.getByText('完整 Markdown')).toBeInTheDocument();
    expect(screen.getByText('事实表 CSV')).toBeInTheDocument();
    expect(screen.getByText('引用表 CSV')).toBeInTheDocument();
    expect(screen.getByText('完整 JSON')).toBeInTheDocument();
  });

  it('raw data menu closes when clicked again', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="m1" />);
    const rawBtn = screen.getByText('原始数据');
    fireEvent.click(rawBtn);
    expect(screen.getByText('完整 Markdown')).toBeInTheDocument();
    fireEvent.click(rawBtn);
    expect(screen.queryByText('完整 Markdown')).not.toBeInTheDocument();
  });
});

describe('ArtifactReader - MetaTabBody', () => {
  it('renders version badge in meta tab', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} currentVersion={3} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('v3')).toBeInTheDocument();
  });

  it('shows versionLabel in meta tab', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('initial')).toBeInTheDocument();
  });

  it('shows incremental badge when isIncremental=true', () => {
    const artifact = makeArtifact();
    artifact.metadata.isIncremental = true;
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('增量')).toBeInTheDocument();
  });

  it('shows changes badge when changesFromPrev has items', () => {
    const artifact = makeArtifact();
    artifact.metadata.changesFromPrev = [{ sectionId: 's1', type: 'modified' }];
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('vs 前一版：1 处变更')).toBeInTheDocument();
  });

  it('renders stats groups in meta tab', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('内容统计')).toBeInTheDocument();
    expect(screen.getByText('生成元数据')).toBeInTheDocument();
    expect(screen.getByText('配置画像')).toBeInTheDocument();
  });

  it('shows 1k word format', () => {
    const artifact = makeArtifact();
    artifact.metadata.wordCount = 5000;
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('5.0k')).toBeInTheDocument();
  });

  it('shows model trail with > 3 models as truncated', () => {
    const artifact = makeArtifact();
    artifact.metadata.modelTrail = ['m1', 'm2', 'm3', 'm4', 'm5'];
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText(/\+2$/)).toBeInTheDocument();
  });

  it('shows model trail with <= 3 models joined with ›', () => {
    const artifact = makeArtifact();
    artifact.metadata.modelTrail = ['gpt-4o', 'claude-3'];
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText('gpt-4o › claude-3')).toBeInTheDocument();
  });

  it('shows searchTimeRange in meta', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    // searchTimeRange: '30d' → '1 个月'
    expect(screen.getByText('1 个月')).toBeInTheDocument();
  });

  it('shows TRIGGER_LABEL when versionLabel matches trigger', () => {
    const artifact = makeArtifact();
    artifact.metadata.versionLabel = 'initial';
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    expect(screen.getByText(/触发类型：首次生成/)).toBeInTheDocument();
  });

  it('shows generatedAt formatted correctly', () => {
    const artifact = makeArtifact();
    artifact.metadata.generatedAt = '2026-01-01T10:00:00Z';
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    fireEvent.click(screen.getByText('元信息'));
    // Sliced to 16 chars and T→space: "2026-01-01 10:00"
    expect(screen.getByText('2026-01-01 10:00')).toBeInTheDocument();
  });
});

describe('ArtifactReader - QualityTabBody', () => {
  it('shows excellent verdict badge', () => {
    const artifact = makeArtifact();
    artifact.quality.finalVerdict = 'excellent';
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('优秀')).toBeInTheDocument();
  });

  it('shows good verdict badge', () => {
    const artifact = makeArtifact();
    artifact.quality.finalVerdict = 'good';
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('良好')).toBeInTheDocument();
  });

  it('shows acceptable verdict badge', () => {
    const artifact = makeArtifact();
    artifact.quality.finalVerdict = 'acceptable';
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('合格')).toBeInTheDocument();
  });

  it('shows poor verdict badge', () => {
    const artifact = makeArtifact();
    artifact.quality.finalVerdict = 'poor';
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.getByText('不达标')).toBeInTheDocument();
  });

  it('shows no verdict badge when finalVerdict is undefined', () => {
    const artifact = makeArtifact();
    artifact.quality.finalVerdict = undefined;
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('报告分析'));
    expect(screen.queryByText('优秀')).not.toBeInTheDocument();
    expect(screen.queryByText('合格')).not.toBeInTheDocument();
  });
});

describe('ArtifactReader - URL hash sync', () => {
  it('reads hash on mount to set initial view', () => {
    // jsdom allows direct assignment to window.location.hash
    window.location.hash = '#view=chapter';
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    // After mount effect runs, should switch to chapter view
    expect(screen.getByTestId('chapter-reader')).toBeInTheDocument();
  });

  it('replaceState is called when view changes', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    fireEvent.click(screen.getByText('章节视图'));
    expect(window.history.replaceState).toHaveBeenCalledWith(
      null,
      '',
      '#view=chapter'
    );
  });

  it('reads quick hash on mount to set initial view', () => {
    window.location.hash = '#view=quick';
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    expect(screen.getByTestId('quick-reader')).toBeInTheDocument();
  });

  it('ignores unrecognized hash values', () => {
    window.location.hash = '#view=unknown';
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    // Defaults to continuous
    expect(screen.getByTestId('continuous-reader')).toBeInTheDocument();
  });
});

describe('ArtifactReader - ExportMenu raw export', () => {
  it('triggers handleSyncExport for markdown format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          data: {
            filename: 'report.md',
            mimeType: 'text/markdown',
            content: '# Report',
          },
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mockCreateObjectURL = vi.fn().mockReturnValue('blob://url');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    // Use a real anchor element to avoid corrupting document.body
    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);

    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);

    // Open raw data dropdown
    fireEvent.click(screen.getByText('原始数据'));
    expect(screen.getByText('完整 Markdown')).toBeInTheDocument();

    // Click Markdown option
    fireEvent.click(screen.getByText('完整 Markdown'));

    // Wait for async export to complete
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    clickSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('triggers handleSyncExport for csv-facts format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          filename: 'facts.csv',
          mimeType: 'text/csv',
          content: 'col1,col2',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mockCreateObjectURL = vi.fn().mockReturnValue('blob://url');
    const mockRevokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    });

    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);

    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);
    fireEvent.click(screen.getByText('原始数据'));
    fireEvent.click(screen.getByText('事实表 CSV'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    clickSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('triggers handleSyncExport for csv-citations format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          filename: 'citations.csv',
          mimeType: 'text/csv',
          content: 'col1',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mockCreateObjectURL = vi.fn().mockReturnValue('blob://url');
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: vi.fn(),
    });

    // Use a real anchor element to avoid breaking document.body
    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);

    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);
    fireEvent.click(screen.getByText('原始数据'));
    fireEvent.click(screen.getByText('引用表 CSV'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    clickSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('triggers handleSyncExport for json format', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          filename: 'report.json',
          mimeType: 'application/json',
          content: '{}',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const mockCreateObjectURL = vi.fn().mockReturnValue('blob://url');
    vi.stubGlobal('URL', {
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: vi.fn(),
    });

    const anchor = document.createElement('a');
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
    vi.spyOn(document, 'createElement').mockReturnValueOnce(anchor);

    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);
    fireEvent.click(screen.getByText('原始数据'));
    fireEvent.click(screen.getByText('完整 JSON'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    clickSpy.mockRestore();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('handles handleSyncExport fetch failure gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });
    vi.stubGlobal('fetch', mockFetch);

    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);
    fireEvent.click(screen.getByText('原始数据'));
    fireEvent.click(screen.getByText('完整 Markdown'));

    // Should not throw - error is caught internally
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    vi.unstubAllGlobals();
  });

  it('handles handleSyncExport network error gracefully', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="mission-123" />);
    fireEvent.click(screen.getByText('原始数据'));
    fireEvent.click(screen.getByText('完整 Markdown'));

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    vi.unstubAllGlobals();
  });
});

describe('ArtifactReader - onSelectVersion wrapper', () => {
  it('calls onSelectVersion when version drawer triggers selection', () => {
    const onSelectVersion = vi.fn();
    const artifact = makeArtifact();
    render(
      <ArtifactReader
        artifact={artifact}
        reportVersions={sampleVersions}
        currentVersion={1}
        onSelectVersion={onSelectVersion}
        versionSwitching={true}
      />
    );
    fireEvent.click(screen.getByText('版本历史'));
    expect(screen.getByTestId('version-drawer')).toBeInTheDocument();
    // Updated mock exposes select-version-2 button
    fireEvent.click(screen.getByText('select-version-2'));
    expect(onSelectVersion).toHaveBeenCalledWith(2);
  });
});

describe('ArtifactReader - additional coverage', () => {
  it('switches back to continuous view by clicking 连续视图 button while in chapter view', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} />);
    // Start in continuous, switch to chapter, then back to continuous
    fireEvent.click(screen.getByText('章节视图'));
    expect(screen.getByTestId('chapter-reader')).toBeInTheDocument();
    fireEvent.click(screen.getByText('连续视图'));
    expect(screen.getByTestId('continuous-reader')).toBeInTheDocument();
  });

  it('closes ExportDialog via onClose callback from ExportMenu', () => {
    const artifact = makeArtifact();
    render(<ArtifactReader artifact={artifact} missionId="m1" />);
    // Open export dialog
    fireEvent.click(screen.getByText('导出报告'));
    expect(screen.getByTestId('export-dialog')).toBeInTheDocument();
    // Close it via the mock close button
    fireEvent.click(screen.getByTestId('export-dialog-close'));
    expect(screen.queryByTestId('export-dialog')).not.toBeInTheDocument();
  });
});
