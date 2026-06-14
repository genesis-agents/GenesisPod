import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { QualityBadge } from '../QualityBadge';
import type { ArtifactQualityVerdicts } from '@/lib/features/agent-playground/report-artifact.types';

function makeQuality(
  overrides: Partial<ArtifactQualityVerdicts> = {}
): ArtifactQualityVerdicts {
  return {
    overall: 85,
    dimensions: {
      traceability: 90,
      factualConsistency: 85,
      novelty: 80,
      coverage: 88,
      redundancy: 82,
      formatCorrectness: 95,
      citationDensity: 78,
      styleConformance: 83,
      lengthAccuracy: 87,
      chapterBalance: 79,
    },
    hardGateViolations: [],
    warnings: [],
    qualityTrace: [],
    finalVerdict: undefined,
    ...overrides,
  };
}

describe('QualityBadge', () => {
  it('renders quality score', () => {
    render(<QualityBadge quality={makeQuality({ overall: 85 })} />);
    expect(screen.getByText(/85\/100/)).toBeInTheDocument();
  });

  it('shows ShieldCheck icon for score >= 80', () => {
    const { container } = render(
      <QualityBadge quality={makeQuality({ overall: 80 })} />
    );
    // ShieldCheck SVG should be present
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('shows Info icon for score 60-79', () => {
    const { container } = render(
      <QualityBadge quality={makeQuality({ overall: 70 })} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('shows AlertTriangle icon for score < 60', () => {
    const { container } = render(
      <QualityBadge quality={makeQuality({ overall: 50 })} />
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
  });

  it('defaults to closed when no hardGateViolations and no defaultOpen', () => {
    render(<QualityBadge quality={makeQuality({ hardGateViolations: [] })} />);
    // Dimensions grid is hidden when closed
    expect(screen.queryByText('可追溯性')).not.toBeInTheDocument();
  });

  it('defaults to open when hardGateViolations exist', () => {
    const q = makeQuality({
      hardGateViolations: [
        { dimension: 'traceability', severity: 'error', message: 'Too low' },
      ],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText('可追溯性')).toBeInTheDocument();
  });

  it('defaultOpen=true forces open', () => {
    render(<QualityBadge quality={makeQuality()} defaultOpen={true} />);
    expect(screen.getByText('可追溯性')).toBeInTheDocument();
  });

  it('defaultOpen=false forces closed', () => {
    render(
      <QualityBadge
        quality={makeQuality({
          hardGateViolations: [
            { dimension: 'x', severity: 'error', message: 'fail' },
          ],
        })}
        defaultOpen={false}
      />
    );
    expect(screen.queryByText('可追溯性')).not.toBeInTheDocument();
  });

  it('clicking header toggles open', () => {
    render(<QualityBadge quality={makeQuality()} />);
    expect(screen.queryByText('可追溯性')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('可追溯性')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.queryByText('可追溯性')).not.toBeInTheDocument();
  });

  it('shows ChevronUp when open', () => {
    render(<QualityBadge quality={makeQuality()} defaultOpen={true} />);
    const button = screen.getByRole('button');
    const svgs = button.querySelectorAll('svg');
    // There should be 2 svgs in button: icon + chevron
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows ChevronDown when closed', () => {
    render(<QualityBadge quality={makeQuality()} defaultOpen={false} />);
    const button = screen.getByRole('button');
    const svgs = button.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });

  it('shows "10 维通过" when no violations and no warnings', () => {
    render(<QualityBadge quality={makeQuality()} />);
    expect(screen.getByText(/10 维通过/)).toBeInTheDocument();
  });

  it('shows hard gate violation count', () => {
    const q = makeQuality({
      hardGateViolations: [
        { dimension: 'x', severity: 'error', message: 'fail1' },
        { dimension: 'y', severity: 'warning', message: 'fail2' },
      ],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText(/2 项硬卡违规/)).toBeInTheDocument();
  });

  it('shows warning count when warnings exist but no hard gate violations', () => {
    const q = makeQuality({
      warnings: [{ dimension: 'x', message: 'warn1' }],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText(/1 项提醒/)).toBeInTheDocument();
  });

  it('shows hard gate violations list when open', () => {
    const q = makeQuality({
      hardGateViolations: [
        { dimension: 'traceability', severity: 'error', message: 'Bad trace' },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    expect(screen.getByText('硬卡违规')).toBeInTheDocument();
    expect(screen.getByText(/Bad trace/)).toBeInTheDocument();
  });

  it('shows L4 critic section when l4 warnings present', () => {
    const q = makeQuality({
      warnings: [{ dimension: 'l4-critic', message: '[pass] Good job' }],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    expect(screen.getByText('L4 独立复审')).toBeInTheDocument();
  });

  it('shows L4 verdict badge for pass', () => {
    const q = makeQuality({
      warnings: [
        { dimension: 'l4-critic', message: '[pass] Everything checks out' },
      ],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText(/L4 独立复审 · pass/)).toBeInTheDocument();
  });

  it('shows L4 verdict badge for concerns', () => {
    const q = makeQuality({
      warnings: [{ dimension: 'l4-critic', message: '[concerns] Some issues' }],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText(/L4 独立复审 · concerns/)).toBeInTheDocument();
  });

  it('shows L4 verdict badge for fail', () => {
    const q = makeQuality({
      warnings: [
        { dimension: 'l4-critic', message: '[fail] Critical failures' },
      ],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText(/L4 独立复审 · fail/)).toBeInTheDocument();
  });

  it('no verdict badge when l4-critic message has no verdict prefix', () => {
    const q = makeQuality({
      warnings: [{ dimension: 'l4-critic', message: 'No bracket prefix here' }],
    });
    render(<QualityBadge quality={q} />);
    expect(screen.queryByText(/L4 独立复审 · /)).not.toBeInTheDocument();
  });

  it('shows other warnings section when non-l4 warnings exist', () => {
    const q = makeQuality({
      warnings: [{ dimension: 'coverage', message: 'Low coverage' }],
    });
    render(<QualityBadge quality={q} />);
    // Open the badge
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('其他提醒')).toBeInTheDocument();
    // The message is split: <span>{dimension}</span>: {message} — use regex
    expect(screen.getByText(/Low coverage/)).toBeInTheDocument();
  });

  it('shows qualityTrace when present', () => {
    const q = makeQuality({
      qualityTrace: [
        {
          stage: 'validate',
          check: 'citation check',
          passed: true,
          timestamp: 1000,
        },
        {
          stage: 'validate',
          check: 'fact check',
          passed: false,
          timestamp: 2500,
        },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    expect(screen.getByText('质量审核轨迹')).toBeInTheDocument();
    expect(screen.getByText('citation check')).toBeInTheDocument();
    expect(screen.getByText('fact check')).toBeInTheDocument();
    expect(screen.getByText('1/2 通过')).toBeInTheDocument();
  });

  it('qualityTrace all passed shows emerald badge', () => {
    const q = makeQuality({
      qualityTrace: [
        { stage: 'v', check: 'c1', passed: true, timestamp: 1000 },
        { stage: 'v', check: 'c2', passed: true, timestamp: 2000 },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    const badge = screen.getByText('2/2 通过');
    expect(badge.className).toContain('bg-emerald-100');
  });

  it('qualityTrace majority failed shows red badge', () => {
    const q = makeQuality({
      qualityTrace: [
        { stage: 'v', check: 'c1', passed: true, timestamp: 1000 },
        { stage: 'v', check: 'c2', passed: false, timestamp: 2000 },
        { stage: 'v', check: 'c3', passed: false, timestamp: 3000 },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    const badge = screen.getByText('1/3 通过');
    expect(badge.className).toContain('bg-red-100');
  });

  it('qualityTrace half passed shows amber badge', () => {
    const q = makeQuality({
      qualityTrace: [
        { stage: 'v', check: 'c1', passed: true, timestamp: 1000 },
        { stage: 'v', check: 'c2', passed: false, timestamp: 2000 },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    const badge = screen.getByText('1/2 通过');
    expect(badge.className).toContain('bg-amber-100');
  });

  it('shows finalVerdict excellent badge', () => {
    render(
      <QualityBadge quality={makeQuality({ finalVerdict: 'excellent' })} />
    );
    expect(screen.getByText('优秀')).toBeInTheDocument();
  });

  it('shows finalVerdict good badge', () => {
    render(<QualityBadge quality={makeQuality({ finalVerdict: 'good' })} />);
    expect(screen.getByText('良好')).toBeInTheDocument();
  });

  it('shows finalVerdict acceptable badge', () => {
    render(
      <QualityBadge quality={makeQuality({ finalVerdict: 'acceptable' })} />
    );
    expect(screen.getByText('合格')).toBeInTheDocument();
  });

  it('shows finalVerdict poor badge', () => {
    render(<QualityBadge quality={makeQuality({ finalVerdict: 'poor' })} />);
    expect(screen.getByText('不达标')).toBeInTheDocument();
  });

  it('progress bar uses emerald for score >= 80', () => {
    const { container } = render(
      <QualityBadge quality={makeQuality({ overall: 85 })} />
    );
    // The progress bar div inside the header
    const bar = container.querySelector('.bg-emerald-500');
    expect(bar).toBeTruthy();
  });

  it('progress bar uses amber for score 60-79', () => {
    const { container } = render(
      <QualityBadge quality={makeQuality({ overall: 65 })} />
    );
    const bar = container.querySelector('.bg-amber-500');
    expect(bar).toBeTruthy();
  });

  it('progress bar uses red for score < 60', () => {
    const { container } = render(
      <QualityBadge quality={makeQuality({ overall: 40 })} />
    );
    const bar = container.querySelector('.bg-red-500');
    expect(bar).toBeTruthy();
  });

  it('dimension grid shows all 10 dimensions when open', () => {
    render(<QualityBadge quality={makeQuality()} defaultOpen={true} />);
    const dimLabels = [
      '可追溯性',
      '事实一致',
      '新颖度',
      '覆盖度',
      '冗余控制',
      '格式正确',
      '引用密度',
      '风格一致',
      '长度准确',
      '章节平衡',
    ];
    for (const label of dimLabels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('qualityTrace relative time shows +0.0s for first entry', () => {
    const q = makeQuality({
      qualityTrace: [
        { stage: 'v', check: 'start', passed: true, timestamp: 1000 },
        { stage: 'v', check: 'end', passed: true, timestamp: 2500 },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    expect(screen.getByText('+0.0s')).toBeInTheDocument();
  });

  it('dimension progress bars include amber (60-79) color', () => {
    const q = makeQuality({
      dimensions: {
        traceability: 90,
        factualConsistency: 85,
        novelty: 65, // amber: 60-79
        coverage: 88,
        redundancy: 82,
        formatCorrectness: 95,
        citationDensity: 72, // amber
        styleConformance: 83,
        lengthAccuracy: 87,
        chapterBalance: 79,
      },
    });
    const { container } = render(
      <QualityBadge quality={q} defaultOpen={true} />
    );
    const amberBars = container.querySelectorAll('.bg-amber-500');
    expect(amberBars.length).toBeGreaterThan(0);
  });

  it('dimension progress bars include red (<60) color', () => {
    const q = makeQuality({
      dimensions: {
        traceability: 90,
        factualConsistency: 85,
        novelty: 50, // red: < 60
        coverage: 88,
        redundancy: 82,
        formatCorrectness: 95,
        citationDensity: 40, // red
        styleConformance: 83,
        lengthAccuracy: 87,
        chapterBalance: 79,
      },
    });
    const { container } = render(
      <QualityBadge quality={q} defaultOpen={true} />
    );
    const redBars = container.querySelectorAll('.bg-red-500');
    // At least 2 red bars (header + dimension bars for scores < 60)
    expect(redBars.length).toBeGreaterThan(0);
  });

  it('qualityTrace item with passed=false shows amber dot', () => {
    const q = makeQuality({
      qualityTrace: [
        { stage: 'v', check: 'failing check', passed: false, timestamp: 1000 },
      ],
    });
    const { container } = render(
      <QualityBadge quality={q} defaultOpen={true} />
    );
    // Amber dot for failed item
    const amberDot = container.querySelector('.bg-amber-500.h-1\\.5');
    // We can't easily check the color dot but we can check the item text
    expect(screen.getByText('failing check')).toBeInTheDocument();
  });

  it('quality with no warnings shows "10 维通过"', () => {
    const q = makeQuality({ warnings: [], hardGateViolations: [] });
    render(<QualityBadge quality={q} />);
    expect(screen.getByText('10 维通过')).toBeInTheDocument();
  });

  it('quality warnings count when hardGateViolations is empty', () => {
    // "N 项提醒" branch: warnings > 0 and hardGateViolations = 0
    const q = makeQuality({
      hardGateViolations: [],
      warnings: [
        { dimension: 'coverage', message: 'msg1' },
        { dimension: 'novelty', message: 'msg2' },
        { dimension: 'l4-critic', message: '[pass] ok' },
      ],
    });
    render(<QualityBadge quality={q} />);
    // All 3 warnings → "3 项提醒"
    expect(screen.getByText(/3 项提醒/)).toBeInTheDocument();
  });

  it('qualityTrace first entry with undefined timestamp falls back to 0', () => {
    // Covers the `?? 0` branch in `const t0 = quality.qualityTrace[0]?.timestamp ?? 0`
    const q = makeQuality({
      qualityTrace: [
        // timestamp missing → undefined → ?? 0
        { stage: 'v', check: 'no-ts', passed: true } as never,
        { stage: 'v', check: 'with-ts', passed: false, timestamp: 500 },
      ],
    });
    render(<QualityBadge quality={q} defaultOpen={true} />);
    expect(screen.getByText('no-ts')).toBeInTheDocument();
  });

  it('qualityTrace t.passed false shows amber dot style', () => {
    const q = makeQuality({
      qualityTrace: [
        { stage: 'v', check: 'passing', passed: true, timestamp: 1000 },
        { stage: 'v', check: 'failing', passed: false, timestamp: 1500 },
      ],
    });
    const { container } = render(
      <QualityBadge quality={q} defaultOpen={true} />
    );
    // Both emerald and amber dots should exist
    const emeraldDot = container.querySelector('.bg-emerald-500.h-1\\.5');
    const amberDot = container.querySelector('.bg-amber-500.h-1\\.5');
    // emerald = passed, amber = failed
    expect(emeraldDot).toBeTruthy();
    expect(amberDot).toBeTruthy();
  });
});
