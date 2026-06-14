import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QuickReader } from '../QuickReader';
import { makeArtifact } from './fixtures';
import type { ReportArtifact } from '@/lib/features/agent-playground/report-artifact.types';

// Mock ReactMarkdown to avoid remark/unified issues in jsdom
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="react-markdown">{children}</div>
  ),
}));
vi.mock('remark-gfm', () => ({ default: () => {} }));

// Mock table components
vi.mock('@/components/ui/table', () => ({
  Table: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <table className={className}>{children}</table>,
  THead: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <thead className={className}>{children}</thead>,
  TBody: ({ children }: { children: React.ReactNode }) => (
    <tbody>{children}</tbody>
  ),
  Tr: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <tr className={className}>{children}</tr>,
  Th: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <th className={className}>{children}</th>,
  Td: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <td className={className}>{children}</td>,
}));

describe('QuickReader', () => {
  it('renders topic header', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('AI 市场分析')).toBeInTheDocument();
    expect(screen.getByText('快速阅读')).toBeInTheDocument();
  });

  it('renders reading time info', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText(/约 5 分钟读完/)).toBeInTheDocument();
  });

  it('renders quality score', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText(/质量 85\/100/)).toBeInTheDocument();
  });

  it('shows amber quality color for score 60-79', () => {
    const artifact = makeArtifact();
    artifact.quality.overall = 65;
    render(<QuickReader artifact={artifact} />);
    const span = screen.getByText(/质量 65\/100/);
    expect(span.className).toContain('text-amber-600');
  });

  it('shows red quality color for score < 60', () => {
    const artifact = makeArtifact();
    artifact.quality.overall = 40;
    render(<QuickReader artifact={artifact} />);
    const span = screen.getByText(/质量 40\/100/);
    expect(span.className).toContain('text-red-600');
  });

  it('shows emerald quality color for score >= 80', () => {
    const artifact = makeArtifact();
    artifact.quality.overall = 85;
    render(<QuickReader artifact={artifact} />);
    const span = screen.getByText(/质量 85\/100/);
    expect(span.className).toContain('text-emerald-600');
  });

  it('renders "阅读全文" button when onSwitchToFull provided', () => {
    const onSwitch = vi.fn();
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} onSwitchToFull={onSwitch} />);
    const btn = screen.getByText('阅读全文');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });

  it('does not render "阅读全文" button when onSwitchToFull not provided', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('阅读全文')).not.toBeInTheDocument();
  });

  it('renders whatYouWillLearn items', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('AI 市场规模')).toBeInTheDocument();
    expect(screen.getByText('竞争格局分析')).toBeInTheDocument();
  });

  it('does not render whatYouWillLearn section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.whatYouWillLearn = [];
    render(<QuickReader artifact={artifact} />);
    // No bullet items
    expect(screen.queryByText('AI 市场规模')).not.toBeInTheDocument();
  });

  it('renders executive summary markdown', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('执行摘要')).toBeInTheDocument();
    expect(screen.getByTestId('react-markdown')).toBeInTheDocument();
  });

  it('does not render executive summary when markdown is empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.executiveSummary.markdown = '';
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('执行摘要')).not.toBeInTheDocument();
  });

  it('renders keyFindingsByDimension section', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('维度核心发现')).toBeInTheDocument();
    expect(screen.getByText('市场规模')).toBeInTheDocument();
    expect(screen.getByText('AI 市场规模达万亿')).toBeInTheDocument();
  });

  it('renders finding body when present', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(
      screen.getByText('详细说明市场规模数据及增长预测。')
    ).toBeInTheDocument();
  });

  it('shows significance-based border colors', () => {
    const artifact = makeArtifact();
    const { container } = render(<QuickReader artifact={artifact} />);
    // high significance → red
    const highEl = container.querySelector('.border-red-300');
    expect(highEl).toBeInTheDocument();
    // medium significance → amber
    const medEl = container.querySelector('.border-amber-300');
    expect(medEl).toBeInTheDocument();
  });

  it('renders topTrends section', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('关键趋势')).toBeInTheDocument();
    expect(screen.getByText('AI 市场持续高速增长')).toBeInTheDocument();
  });

  it('shows trend direction label', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    // increasing → ↑
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('shows → for trend with no direction', () => {
    const artifact = makeArtifact();
    artifact.quickView.topTrends = [
      { title: 'No direction trend', description: '无方向', timeframe: '2026' },
    ];
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('renders trend timeframe', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText(/· 2026/)).toBeInTheDocument();
  });

  it('does not render trends section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.topTrends = [];
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('关键趋势')).not.toBeInTheDocument();
  });

  it('renders riskMatrix section', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('风险评估')).toBeInTheDocument();
    expect(screen.getByText('监管风险')).toBeInTheDocument();
    expect(screen.getByText('技术风险')).toBeInTheDocument();
  });

  it('shows probability color badges - high=red', () => {
    const artifact = makeArtifact();
    const { container } = render(<QuickReader artifact={artifact} />);
    // 高 probability → bg-red-100
    const redBadges = container.querySelectorAll('.bg-red-100');
    expect(redBadges.length).toBeGreaterThan(0);
  });

  it('shows probability color badges - medium=amber', () => {
    const artifact = makeArtifact();
    const { container } = render(<QuickReader artifact={artifact} />);
    const amberBadges = container.querySelectorAll('.bg-amber-100');
    expect(amberBadges.length).toBeGreaterThan(0);
  });

  it('does not render riskMatrix when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.riskMatrix = [];
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('风险评估')).not.toBeInTheDocument();
  });

  it('renders foresight section when present', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('未来推演')).toBeInTheDocument();
    expect(screen.getByText('AI 将主导下一轮科技革命')).toBeInTheDocument();
  });

  it('shows robustness badge when present', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('前瞻韧性 72/100')).toBeInTheDocument();
  });

  it('shows robustness with amber color when 50-69', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.robustness = 55;
    render(<QuickReader artifact={artifact} />);
    const badge = screen.getByText('前瞻韧性 55/100');
    expect(badge.className).toContain('text-amber-700');
  });

  it('shows robustness with rose color when < 50', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.robustness = 40;
    render(<QuickReader artifact={artifact} />);
    const badge = screen.getByText('前瞻韧性 40/100');
    expect(badge.className).toContain('text-rose-700');
  });

  it('shows baseCase probability bar', () => {
    const artifact = makeArtifact();
    const { container } = render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('基准判断')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    // probability bar
    const indigo = container.querySelector('.bg-indigo-500');
    expect(indigo).toBeInTheDocument();
  });

  it('renders baseRate text', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(
      screen.getByText(/历史基准率：历史科技革命基准率约 60%/)
    ).toBeInTheDocument();
  });

  it('shows confidence and horizon labels', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('置信度高')).toBeInTheDocument();
    expect(screen.getByText('18 个月-3 年')).toBeInTheDocument();
  });

  it('renders scenarios section', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('乐观')).toBeInTheDocument();
    expect(screen.getByText('基准')).toBeInTheDocument();
    expect(screen.getByText('悲观')).toBeInTheDocument();
  });

  it('renders predeterminedElements', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('几乎确定')).toBeInTheDocument();
    expect(screen.getByText('大模型能力持续提升')).toBeInTheDocument();
  });

  it('renders criticalUncertainties', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('关键不确定性')).toBeInTheDocument();
    expect(screen.getByText('监管政策走向')).toBeInTheDocument();
  });

  it('renders leadingIndicators', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('值得跟踪的早期信号')).toBeInTheDocument();
    expect(screen.getByText('GPU 出货量')).toBeInTheDocument();
  });

  it('renders couldBeWrongIf', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('判断可能错在哪')).toBeInTheDocument();
    expect(screen.getByText('监管超预期收紧')).toBeInTheDocument();
  });

  it('does not render foresight section when absent', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight = undefined;
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('未来推演')).not.toBeInTheDocument();
  });

  it('does not render foresight when baseCase is empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.baseCase = [];
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('未来推演')).not.toBeInTheDocument();
  });

  it('renders recommendationsByAudience for enterprise', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('战略建议')).toBeInTheDocument();
    expect(screen.getByText('对企业决策者')).toBeInTheDocument();
    expect(screen.getByText('加大 AI 投入')).toBeInTheDocument();
    expect(screen.getByText('建立 AI 护城河')).toBeInTheDocument();
  });

  it('renders recommendationsByAudience for investors', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('对投资者')).toBeInTheDocument();
    expect(screen.getByText('关注头部企业')).toBeInTheDocument();
    expect(screen.getByText('布局 AI 基础设施')).toBeInTheDocument();
  });

  it('does not render recommendations when absent', () => {
    const artifact = makeArtifact();
    artifact.quickView.recommendationsByAudience = undefined;
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('战略建议')).not.toBeInTheDocument();
  });

  it('does not render enterprise section when absent', () => {
    const artifact = makeArtifact();
    artifact.quickView.recommendationsByAudience = {
      forInvestors: { shortTerm: ['买入'], midTerm: [] },
    };
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('对企业决策者')).not.toBeInTheDocument();
    expect(screen.getByText('对投资者')).toBeInTheDocument();
  });

  it('renders keyCitations section', () => {
    const artifact = makeArtifact();
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('重点引用')).toBeInTheDocument();
    expect(screen.getByText('市场研究报告')).toBeInTheDocument();
  });

  it('does not render keyCitations section when empty after lookup', () => {
    const artifact = makeArtifact();
    artifact.quickView.keyCitations = [999]; // no citation with index 999
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('重点引用')).not.toBeInTheDocument();
  });

  it('renders critic violations in quick view', () => {
    const artifact = makeArtifact();
    artifact.quality.hardGateViolations = [
      { dimension: 'l4-critic', severity: 'error', message: '严重问题' },
    ];
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText(/Critic 复审标记 1 项/)).toBeInTheDocument();
  });

  it('shows truncation notice when violations > 3', () => {
    const artifact = makeArtifact();
    artifact.quality.hardGateViolations = Array.from({ length: 4 }, (_, i) => ({
      dimension: 'l4-critic',
      severity: 'error' as const,
      message: `问题 ${i + 1}`,
    }));
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText(/还有 1 项见/)).toBeInTheDocument();
  });

  it('uses legacy topHighlights fallback when keyFindingsByDimension is empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.keyFindingsByDimension = [];
    artifact.quickView.topHighlights = [
      {
        type: 'finding',
        title: 'Legacy Finding Title',
        oneLineSummary: '遗留发现摘要',
        sourceDimensionId: 's1',
        citations: [1],
      },
    ];
    // Add a section with sourceDimensionId to match
    artifact.sections[0].sourceDimensionId = 's1';
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('维度核心发现')).toBeInTheDocument();
    expect(screen.getByText('Legacy Finding Title')).toBeInTheDocument();
  });

  it('filters out non-finding/trend types in legacy fallback', () => {
    const artifact = makeArtifact();
    artifact.quickView.keyFindingsByDimension = [];
    artifact.quickView.topHighlights = [
      {
        type: 'risk', // should be filtered
        title: 'Risk Title',
        oneLineSummary: '风险摘要',
        sourceDimensionId: 's1',
        citations: [],
      },
    ];
    render(<QuickReader artifact={artifact} />);
    // Should show the section header but no items
    // Actually if map is empty the section won't render
    expect(screen.queryByText('维度核心发现')).not.toBeInTheDocument();
  });

  it('cleanText removes citation brackets and bold markers', () => {
    const artifact = makeArtifact();
    artifact.quickView.whatYouWillLearn = ['**重要内容**[1][2]（约 500字）'];
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('重要内容')).toBeInTheDocument();
  });

  it('renders description field in trend when title is absent', () => {
    const artifact = makeArtifact();
    artifact.quickView.topTrends = [
      { title: '', description: '纯描述内容', direction: 'stable' },
    ];
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('纯描述内容')).toBeInTheDocument();
    expect(screen.getByText('→')).toBeInTheDocument();
  });

  it('renders scenario without known kind using base fallback', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.scenarios = [
      {
        kind: 'unknown-kind' as 'bull',
        narrative: '未知情景',
        trigger: '未知触发',
        probability: 0.4,
      },
    ];
    render(<QuickReader artifact={artifact} />);
    // Falls back to SCENARIO_META.base
    expect(screen.getByText('未知情景')).toBeInTheDocument();
  });

  it('does not render predeterminedElements section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.predeterminedElements = [];
    artifact.quickView.foresight!.criticalUncertainties = [];
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('几乎确定')).not.toBeInTheDocument();
    expect(screen.queryByText('关键不确定性')).not.toBeInTheDocument();
  });

  it('does not render leadingIndicators section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.leadingIndicators = [];
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('值得跟踪的早期信号')).not.toBeInTheDocument();
  });

  it('does not render couldBeWrongIf section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.couldBeWrongIf = [];
    render(<QuickReader artifact={artifact} />);
    expect(screen.queryByText('判断可能错在哪')).not.toBeInTheDocument();
  });

  it('does not render midTerm section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.recommendationsByAudience = {
      forEnterprise: { shortTerm: ['短期建议'], midTerm: [] },
    };
    render(<QuickReader artifact={artifact} />);
    expect(screen.getByText('短期 (6-12月)')).toBeInTheDocument();
    expect(screen.queryByText('中期 (1-3年)')).not.toBeInTheDocument();
  });

  it('does not render scenarios section when empty', () => {
    const artifact = makeArtifact();
    artifact.quickView.foresight!.scenarios = [];
    render(<QuickReader artifact={artifact} />);
    // Still shows baseCase but no scenario grid
    expect(screen.queryByText('乐观')).not.toBeInTheDocument();
  });
});
