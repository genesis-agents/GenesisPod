/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  Gavel: (props: Record<string, unknown>) => (
    <svg data-testid="gavel-icon" {...props} />
  ),
  ShieldCheck: (props: Record<string, unknown>) => (
    <svg data-testid="shield-check-icon" {...props} />
  ),
  ShieldAlert: (props: Record<string, unknown>) => (
    <svg data-testid="shield-alert-icon" {...props} />
  ),
  ShieldX: (props: Record<string, unknown>) => (
    <svg data-testid="shield-x-icon" {...props} />
  ),
}));

vi.mock('@/lib/utils/common', () => ({
  cn: (...classes: (string | undefined | false | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/agent-playground/ui', () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  ExpandableText: ({
    text,
    className,
  }: {
    text: string;
    maxChars: number;
    className?: string;
  }) => <span className={className}>{text}</span>,
}));

vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title?: string;
    description?: string;
    icon?: React.ReactNode;
    size?: string;
  }) => (
    <div data-testid="empty-state">
      {title && <p>{title}</p>}
      {description && <p>{description}</p>}
    </div>
  ),
}));

vi.mock('@/lib/features/agent-playground/formatters', () => ({
  scoreColor: (s: number) =>
    s >= 80 ? 'text-emerald-600' : s >= 60 ? 'text-amber-600' : 'text-red-600',
  scoreBgColor: (s: number) =>
    s >= 80 ? 'bg-emerald-400' : s >= 60 ? 'bg-amber-400' : 'bg-red-400',
}));

import { VerifyConsensusPanel } from '../VerifyConsensusPanel';
import type { VerifierVerdict } from '@/lib/features/agent-playground/mission-presentation.types';

describe('VerifyConsensusPanel', () => {
  describe('header', () => {
    it('renders the panel title', () => {
      render(<VerifyConsensusPanel verdicts={[]} />);
      expect(screen.getByText('质量评审共识')).toBeInTheDocument();
    });
  });

  describe('empty verdicts', () => {
    it('shows EmptyState when no verdicts', () => {
      render(<VerifyConsensusPanel verdicts={[]} />);
      expect(screen.getByTestId('empty-state')).toBeInTheDocument();
      expect(screen.getByText('等待评审')).toBeInTheDocument();
    });

    it('does not show average score when no verdicts', () => {
      render(<VerifyConsensusPanel verdicts={[]} />);
      expect(screen.queryByText(/均分/)).not.toBeInTheDocument();
    });

    it('does not show Reflexion note when latestAttempt is 0', () => {
      render(<VerifyConsensusPanel verdicts={[]} />);
      expect(screen.queryByText(/已触发 Reflexion/)).not.toBeInTheDocument();
    });
  });

  describe('with verdicts', () => {
    const verdicts: VerifierVerdict[] = [
      { verifierId: 'self', score: 82, critique: 'Good work.', attempt: 1 },
      {
        verifierId: 'external',
        score: 75,
        critique: 'Some issues.',
        attempt: 1,
      },
      { verifierId: 'critical', score: 68, attempt: 1 },
    ];

    it('renders verifier labels', () => {
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.getByText('Self')).toBeInTheDocument();
      expect(screen.getByText('External')).toBeInTheDocument();
      expect(screen.getByText('Critical')).toBeInTheDocument();
    });

    it('renders individual scores', () => {
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.getByText('82')).toBeInTheDocument();
      expect(screen.getByText('75')).toBeInTheDocument();
      expect(screen.getByText('68')).toBeInTheDocument();
    });

    it('computes and shows average score', () => {
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      // avg = Math.round((82+75+68)/3 * 10) / 10 = Math.round(225/3 * 10) / 10 = Math.round(750)/10 = 75
      expect(screen.getByText('均分 75')).toBeInTheDocument();
    });

    it('renders critique text when present', () => {
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.getByText('Good work.')).toBeInTheDocument();
      expect(screen.getByText('Some issues.')).toBeInTheDocument();
    });

    it('does not show critique when absent', () => {
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      // critical verdict has no critique — only 2 critiques rendered
      const critiques = screen.getAllByText(/Good work\.|Some issues\./).length;
      expect(critiques).toBe(2);
    });

    it('renders score bar for each verdict', () => {
      const { container } = render(
        <VerifyConsensusPanel verdicts={verdicts} />
      );
      const bars = container.querySelectorAll('[style]');
      // Each verdict has a ScoreBar with a style width
      expect(bars.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('with modelId', () => {
    it('renders modelId when provided', () => {
      const verdicts: VerifierVerdict[] = [
        {
          verifierId: 'self',
          score: 80,
          modelId: 'gpt-4o',
          attempt: 1,
        },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
    });

    it('does not render modelId when absent', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'self', score: 80, attempt: 1 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      // no model ID text present from this verdict
      expect(screen.queryByText(/gpt-/)).not.toBeInTheDocument();
    });
  });

  describe('unknown verifier', () => {
    it('renders unknown verifierId as its own label', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'mystery-judge', score: 70, attempt: 1 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.getByText('mystery-judge')).toBeInTheDocument();
    });
  });

  describe('Reflexion note', () => {
    it('shows Reflexion note when latestAttempt > 1', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'self', score: 75, attempt: 2 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.getByText(/已触发 Reflexion/)).toBeInTheDocument();
      expect(screen.getByText(/第 2 轮/)).toBeInTheDocument();
    });

    it('does not show Reflexion note when latestAttempt = 1', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'self', score: 75, attempt: 1 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      expect(screen.queryByText(/已触发 Reflexion/)).not.toBeInTheDocument();
    });

    it('picks the max attempt among verdicts', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'self', score: 60, attempt: 1 },
        { verifierId: 'self', score: 80, attempt: 3 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      // latestAttempt = 3 → show attempt 3 verdicts only
      expect(screen.getByText(/第 3 轮/)).toBeInTheDocument();
    });
  });

  describe('multiple attempts — only latest shown', () => {
    it('shows only attempt 2 verdicts when both attempt 1 and 2 present', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'self', score: 50, attempt: 1 },
        { verifierId: 'self', score: 85, attempt: 2 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      // avg = 85 (only attempt 2 self verdict)
      expect(screen.getByText('均分 85')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.queryByText('50')).not.toBeInTheDocument();
    });
  });

  describe('score bar width clamping', () => {
    it('clamps bar width to 100% for score 100', () => {
      const { container } = render(
        <VerifyConsensusPanel
          verdicts={[{ verifierId: 'self', score: 100, attempt: 1 }]}
        />
      );
      const bar = container.querySelector('[style]');
      expect((bar as HTMLElement).style.width).toBe('100%');
    });

    it('clamps bar width to 0% for score 0', () => {
      const { container } = render(
        <VerifyConsensusPanel
          verdicts={[{ verifierId: 'self', score: 0, attempt: 1 }]}
        />
      );
      const bar = container.querySelector('[style]');
      expect((bar as HTMLElement).style.width).toBe('0%');
    });
  });

  describe('average score rounding', () => {
    it('rounds average to 1 decimal', () => {
      const verdicts: VerifierVerdict[] = [
        { verifierId: 'self', score: 80, attempt: 1 },
        { verifierId: 'external', score: 70, attempt: 1 },
        { verifierId: 'critical', score: 65, attempt: 1 },
      ];
      render(<VerifyConsensusPanel verdicts={verdicts} />);
      // avg = (80+70+65)/3 = 71.666... → round(71.666*10)/10 = round(716.6)/10 = 71.7
      expect(screen.getByText('均分 71.7')).toBeInTheDocument();
    });
  });
});
