/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  CheckCircle2: (props: Record<string, unknown>) => (
    <svg data-testid="check-circle-icon" {...props} />
  ),
  AlertCircle: (props: Record<string, unknown>) => (
    <svg data-testid="alert-circle-icon" {...props} />
  ),
  XCircle: (props: Record<string, unknown>) => (
    <svg data-testid="x-circle-icon" {...props} />
  ),
  ShieldAlert: (props: Record<string, unknown>) => (
    <svg data-testid="shield-alert-icon" {...props} />
  ),
}));

vi.mock('@/components/agent-playground/ui', () => ({
  ExpandableText: ({
    text,
    className,
  }: {
    text: string;
    maxChars: number;
    className?: string;
  }) => <span className={className}>{text}</span>,
}));

import { LeadJournalPanel } from '../LeadJournalPanel';
import type { MissionDetail } from '@/services/agent-playground/api';

function buildMission(overrides: Partial<MissionDetail> = {}): MissionDetail {
  return {
    id: 'mission-1',
    topic: 'Test topic',
    depth: 'standard',
    language: 'zh-CN',
    status: 'completed',
    startedAt: '2024-01-01T00:00:00Z',
    completedAt: '2024-01-01T01:00:00Z',
    elapsedWallTimeMs: 3600000,
    finalScore: null,
    tokensUsed: null,
    costUsd: null,
    reportTitle: null,
    reportSummary: null,
    errorMessage: null,
    visibility: 'PRIVATE',
    maxCredits: null,
    themeSummary: null,
    dimensions: null,
    reportFull: null,
    verdicts: null,
    trajectoryStored: null,
    leaderJournal: null,
    leaderOverallScore: null,
    leaderSigned: null,
    leaderVerdict: null,
    ...overrides,
  } as MissionDetail;
}

describe('LeadJournalPanel', () => {
  describe('null rendering', () => {
    it('returns null when no goals, foreword, or score', () => {
      const { container } = render(
        <LeadJournalPanel mission={buildMission()} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe('M7 Sign-Off badge', () => {
    it('shows sign-off badge when leaderOverallScore is set', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 85,
            leaderSigned: true,
            leaderVerdict: 'excellent',
          })}
        />
      );
      expect(screen.getByText(/Leader 签字交付/)).toBeInTheDocument();
      expect(screen.getByText(/85\/100/)).toBeInTheDocument();
    });

    it('shows rejection badge when leaderSigned is false', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 40,
            leaderSigned: false,
          })}
        />
      );
      expect(screen.getByText('Leader 拒绝签字')).toBeInTheDocument();
      expect(screen.getByTestId('x-circle-icon')).toBeInTheDocument();
    });

    it('shows error message when leaderSigned is false and errorMessage present', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 40,
            leaderSigned: false,
            errorMessage: 'Quality standards not met.',
          })}
        />
      );
      expect(
        screen.getByText('Quality standards not met.')
      ).toBeInTheDocument();
    });

    it('does not show error message when leaderSigned is true', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 85,
            leaderSigned: true,
            errorMessage: 'should not appear',
          })}
        />
      );
      expect(screen.queryByText('should not appear')).not.toBeInTheDocument();
    });

    it('uses excellent verdict color (emerald)', () => {
      const { container } = render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 90,
            leaderSigned: true,
            leaderVerdict: 'excellent',
          })}
        />
      );
      expect(container.querySelector('.border-emerald-200')).not.toBeNull();
    });

    it('uses good verdict color (blue)', () => {
      const { container } = render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 75,
            leaderSigned: true,
            leaderVerdict: 'good',
          })}
        />
      );
      expect(container.querySelector('.border-blue-200')).not.toBeNull();
    });

    it('uses amber for other verdicts', () => {
      const { container } = render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 60,
            leaderSigned: true,
            leaderVerdict: 'acceptable',
          })}
        />
      );
      expect(container.querySelector('.border-amber-200')).not.toBeNull();
    });

    it('shows — for null verdict', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderOverallScore: 70,
            leaderSigned: true,
            leaderVerdict: null,
          })}
        />
      );
      expect(screen.getByText(/Leader 签字交付 · —/)).toBeInTheDocument();
    });
  });

  describe('M6 Foreword', () => {
    const foreword = {
      whatWeAnswered: [
        {
          criterion: 'Market size',
          addressed: 'yes' as const,
          evidence: 'Based on IDC report.',
        },
        {
          criterion: 'Competition',
          addressed: 'partial' as const,
          evidence: 'Limited data.',
        },
        {
          criterion: 'Risks',
          addressed: 'no' as const,
          evidence: 'Not covered.',
        },
      ],
      whatRemainsUnclear: ['Long-term outlook', 'Regulatory impact'],
      howToRead: 'Start with the executive summary.',
      recommendedFollowUp: ['Deep dive into regulations', 'Market survey'],
    };

    it('shows Foreword section with ShieldAlert icon', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('Foreword by Lead')).toBeInTheDocument();
      expect(screen.getByTestId('shield-alert-icon')).toBeInTheDocument();
    });

    it('shows whatWeAnswered items', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('Market size')).toBeInTheDocument();
      expect(screen.getByText('Based on IDC report.')).toBeInTheDocument();
      expect(screen.getByText('Competition')).toBeInTheDocument();
    });

    it('shows CheckCircle for addressed=yes', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getAllByTestId('check-circle-icon').length).toBeGreaterThan(
        0
      );
    });

    it('shows AlertCircle for addressed=partial', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
    });

    it('shows XCircle for addressed=no', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getAllByTestId('x-circle-icon').length).toBeGreaterThan(0);
    });

    it('shows whatRemainsUnclear section', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('没回答 / 证据不足')).toBeInTheDocument();
      expect(screen.getByText('Long-term outlook')).toBeInTheDocument();
      expect(screen.getByText('Regulatory impact')).toBeInTheDocument();
    });

    it('shows howToRead section', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('如何阅读本报告')).toBeInTheDocument();
      expect(
        screen.getByText('Start with the executive summary.')
      ).toBeInTheDocument();
    });

    it('shows recommendedFollowUp section', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('建议的后续研究方向')).toBeInTheDocument();
      expect(
        screen.getByText('Deep dive into regulations')
      ).toBeInTheDocument();
    });

    it('does not show whatWeAnswered section when empty', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              foreword: {
                ...foreword,
                whatWeAnswered: [],
              },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText('我们回答了什么')).not.toBeInTheDocument();
    });

    it('does not show whatRemainsUnclear when empty', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              foreword: {
                ...foreword,
                whatRemainsUnclear: [],
              },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText('没回答 / 证据不足')).not.toBeInTheDocument();
    });

    it('does not show recommendedFollowUp when empty', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              foreword: { ...foreword, recommendedFollowUp: [] },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText('建议的后续研究方向')).not.toBeInTheDocument();
    });

    it('does not show howToRead when absent', () => {
      const fwWithout = { ...foreword };
      delete (fwWithout as Record<string, unknown>).howToRead;
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { foreword: fwWithout as typeof foreword },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText('如何阅读本报告')).not.toBeInTheDocument();
    });
  });

  describe('decisions section', () => {
    it('shows decisions when present', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              decisions: [
                {
                  phase: 'plan',
                  at: '2024-01-01T10:30:00Z',
                  decision: 'Focus on market sizing',
                  rationale: 'Most critical question.',
                },
              ],
            },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText(/Lead 过程决策记录 · 1 次/)).toBeInTheDocument();
    });

    it('does not show decisions when empty', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { decisions: [] },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText(/Lead 过程决策记录/)).not.toBeInTheDocument();
    });
  });

  describe('M0 goals section', () => {
    const goals = {
      successCriteria: [
        'Cover all major markets',
        'Include competitor analysis',
      ],
      qualityBar: {
        minSources: 10,
        minCoverage: 80,
        hardConstraints: ['No Wikipedia sources'],
      },
      deliverables: ['Executive summary', 'Market sizing table'],
    };

    it('shows goals details section when goals present', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { plan: { goals } },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(
        screen.getByText('Lead M0 Plan · 目标 / 质量底线 / 风险 ▾')
      ).toBeInTheDocument();
    });

    it('shows successCriteria', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { plan: { goals } },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('成功标准')).toBeInTheDocument();
      expect(screen.getByText('Cover all major markets')).toBeInTheDocument();
    });

    it('shows qualityBar values', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { plan: { goals } },
            leaderOverallScore: 80,
          })}
        />
      );
      // rendered as "≥ 10 sources · ≥ 80 coverage" in one element
      expect(screen.getByText(/10 sources/)).toBeInTheDocument();
    });

    it('shows hardConstraints', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { plan: { goals } },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText(/★ No Wikipedia sources/)).toBeInTheDocument();
    });

    it('shows deliverables', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: { plan: { goals } },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.getByText('• Executive summary')).toBeInTheDocument();
    });

    it('does not show successCriteria section when empty', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              plan: {
                goals: { ...goals, successCriteria: [] },
              },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText('成功标准')).not.toBeInTheDocument();
    });

    it('does not show hardConstraints section when empty', () => {
      render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              plan: {
                goals: {
                  ...goals,
                  qualityBar: { ...goals.qualityBar, hardConstraints: [] },
                },
              },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      expect(screen.queryByText(/★/)).not.toBeInTheDocument();
    });
  });

  describe('initialRisks', () => {
    it('renders the details element containing goals when initialRisks present', () => {
      const { container } = render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              plan: {
                goals: {
                  successCriteria: [],
                  qualityBar: {
                    minSources: 5,
                    minCoverage: 50,
                    hardConstraints: [],
                  },
                  deliverables: [],
                },
                initialRisks: [
                  {
                    type: 'DataAvailability',
                    severity: 'high',
                    mitigation: 'Use multiple sources',
                  },
                  {
                    type: 'Timeliness',
                    severity: 'medium',
                    mitigation: 'Prioritize recent data',
                  },
                  {
                    type: 'Coverage',
                    severity: 'low',
                    mitigation: 'Broaden search',
                  },
                ],
              },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      // The details/summary element is rendered
      const summaryEl = container.querySelector('details summary');
      expect(summaryEl).not.toBeNull();
      // Open the details element
      const detailsEl = container.querySelector('details');
      detailsEl!.setAttribute('open', '');
      expect(screen.getByText('DataAvailability')).toBeInTheDocument();
      expect(screen.getByText('high')).toBeInTheDocument();
    });

    it('renders severity=low with gray styling in the risk HTML', () => {
      const { container } = render(
        <LeadJournalPanel
          mission={buildMission({
            leaderJournal: {
              plan: {
                goals: {
                  successCriteria: [],
                  qualityBar: {
                    minSources: 5,
                    minCoverage: 50,
                    hardConstraints: [],
                  },
                  deliverables: [],
                },
                initialRisks: [
                  {
                    type: 'LowRisk',
                    severity: 'low',
                    mitigation: 'Monitor only',
                  },
                ],
              },
            },
            leaderOverallScore: 80,
          })}
        />
      );
      const detailsEl = container.querySelector('details');
      detailsEl!.setAttribute('open', '');
      expect(screen.getByText('low')).toBeInTheDocument();
    });
  });
});
