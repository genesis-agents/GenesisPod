/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock lucide icons
vi.mock('lucide-react', () => ({
  Coins: (props: Record<string, unknown>) => (
    <svg data-testid="coins-icon" {...props} />
  ),
  Trophy: (props: Record<string, unknown>) => (
    <svg data-testid="trophy-icon" {...props} />
  ),
  Timer: (props: Record<string, unknown>) => (
    <svg data-testid="timer-icon" {...props} />
  ),
  Database: (props: Record<string, unknown>) => (
    <svg data-testid="database-icon" {...props} />
  ),
  TrendingUp: (props: Record<string, unknown>) => (
    <svg data-testid="trending-up" {...props} />
  ),
  TrendingDown: (props: Record<string, unknown>) => (
    <svg data-testid="trending-down" {...props} />
  ),
  Minus: (props: Record<string, unknown>) => (
    <svg data-testid="minus-icon" {...props} />
  ),
}));

vi.mock('@/lib/utils/common', () => ({
  cn: (...classes: (string | undefined | false | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

vi.mock('@/components/ui/cards', () => ({
  StatCard: ({
    label,
    value,
    hint,
  }: {
    label: string;
    value: string;
    hint: string;
  }) => (
    <div data-testid="stat-card">
      <span data-testid="stat-label">{label}</span>
      <span data-testid="stat-value">{value}</span>
      <span data-testid="stat-hint">{hint}</span>
    </div>
  ),
}));

vi.mock('@/lib/features/agent-playground/formatters', () => ({
  fmtUsd: (n: number) => (n === 0 ? '$0' : `$${n.toFixed(3)}`),
  fmtTokens: (n: number) =>
    n < 1000 ? String(n) : `${(n / 1000).toFixed(1)}k`,
  fmtWallTime: (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  },
}));

import { CapabilityMeters } from '../CapabilityMeters';
import type { MissionDetailView } from '@/services/agent-playground/api';
import type {
  CostState,
  MemoryIndexState,
} from '@/lib/features/agent-playground/mission-presentation.types';

function buildView(
  overrides: Partial<MissionDetailView['mission']> = {}
): MissionDetailView {
  return {
    mission: {
      id: 'mission-1',
      status: 'running',
      resumable: false,
      canCancel: true,
      rerunnableStages: [],
      finalScore: undefined,
      ...overrides,
    },
    stages: [],
    agents: [],
    verdicts: [],
    memoryIndex: null,
    cost: undefined,
    references: [],
    timelineVersion: 1,
    snapshotVersion: 1,
  } as unknown as MissionDetailView;
}

const baseCost: CostState = {
  tokensUsed: 5000,
  costUsd: 0.015,
  byStage: [],
};

describe('CapabilityMeters', () => {
  describe('stat cards rendered', () => {
    it('renders 4 stat cards', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={5000}
          cost={baseCost}
          memory={null}
        />
      );
      const cards = screen.getAllByTestId('stat-card');
      expect(cards).toHaveLength(4);
    });

    it('shows cost values from cost prop (not view.cost)', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={5000}
          cost={{ tokensUsed: 10000, costUsd: 0.03, byStage: [] }}
          memory={null}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      // first card is cost
      expect(values[0].textContent).toContain('$');
    });

    it('shows 消耗 label', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const labels = screen.getAllByTestId('stat-label');
      expect(labels[0].textContent).toBe('消耗');
    });

    it('shows 质量评分 label', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const labels = screen.getAllByTestId('stat-label');
      expect(labels[1].textContent).toBe('质量评分');
    });

    it('shows — for score when finalScore is null', () => {
      render(
        <CapabilityMeters
          view={buildView({ finalScore: undefined })}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      expect(values[1].textContent).toBe('—');
    });

    it('shows score value when finalScore is set', () => {
      render(
        <CapabilityMeters
          view={buildView({ finalScore: 85 })}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      expect(values[1].textContent).toBe('85');
    });
  });

  describe('qualitySub computation', () => {
    it('shows "N 个评审" when verdicts present', () => {
      const view = buildView({ finalScore: 80 });
      view.verdicts = [
        { verifierId: 'self', score: 80, attempt: 1 },
        { verifierId: 'external', score: 75, attempt: 1 },
      ];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('2 个评审');
    });

    it('shows "评审完成" when no verdicts but score is set', () => {
      const view = buildView({ finalScore: 80 });
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('评审完成');
    });

    it('shows "未评审" when terminal mission with no score and no verdicts', () => {
      const view = buildView({
        finalScore: undefined,
        // completedAt present via cast
      });
      (view.mission as Record<string, unknown>).completedAt = '2024-01-01';
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('未评审');
    });

    it('shows "待评审" when non-terminal mission with no verdicts and no score', () => {
      const view = buildView({ finalScore: undefined });
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('待评审');
    });

    it('treats finishedAt as terminal', () => {
      const view = buildView({ finalScore: undefined });
      (view.mission as Record<string, unknown>).finishedAt = '2024-01-02';
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('未评审');
    });

    it('treats failedAt as terminal', () => {
      const view = buildView({ finalScore: undefined });
      (view.mission as Record<string, unknown>).failedAt = '2024-01-02';
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('未评审');
    });

    it('treats cancelledAt as terminal', () => {
      const view = buildView({ finalScore: undefined });
      (view.mission as Record<string, unknown>).cancelledAt = '2024-01-02';
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[1].textContent).toBe('未评审');
    });
  });

  describe('wall time card (third)', () => {
    it('shows "已完成" when status is completed', () => {
      const view = buildView({ status: 'completed' });
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={10000}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[2].textContent).toBe('已完成');
    });

    it('shows "已结束" when finishedAt is set and not completed', () => {
      const view = buildView({ status: 'failed' });
      view.mission.finishedAt = '2024-01-01T00:00:00Z';
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={10000}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[2].textContent).toBe('已结束');
    });

    it('shows "进行中" when startedAt is set', () => {
      const view = buildView({ status: 'running' });
      view.mission.startedAt = '2024-01-01T00:00:00Z';
      view.mission.finishedAt = undefined;
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={10000}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[2].textContent).toBe('进行中');
    });

    it('shows "未启动" when no startedAt or finishedAt', () => {
      const view = buildView({ status: 'running' });
      view.mission.startedAt = undefined;
      view.mission.finishedAt = undefined;
      view.verdicts = [];
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[2].textContent).toBe('未启动');
    });
  });

  describe('memory card (fourth)', () => {
    it('shows — for memory value when memory is null', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      expect(values[3].textContent).toBe('—');
    });

    it('shows chunk count when memory is provided', () => {
      const memory: MemoryIndexState = { chunks: 42 };
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={baseCost}
          memory={memory}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      expect(values[3].textContent).toBe('42');
    });

    it('shows "chunks 已索引" hint when memory present', () => {
      const memory: MemoryIndexState = { chunks: 5 };
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={baseCost}
          memory={memory}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[3].textContent).toBe('chunks 已索引');
    });

    it('shows "待索引" hint when memory is null', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[3].textContent).toBe('待索引');
    });

    it('prefers memory prop over view.memoryIndex', () => {
      const view = buildView();
      view.memoryIndex = { chunks: 100 };
      const memory: MemoryIndexState = { chunks: 7 };
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={memory}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      expect(values[3].textContent).toBe('7');
    });

    it('falls back to view.memoryIndex when memory prop is null', () => {
      const view = buildView();
      view.memoryIndex = { chunks: 33 };
      render(
        <CapabilityMeters
          view={view}
          wallTimeMs={0}
          cost={baseCost}
          memory={null}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      expect(values[3].textContent).toBe('33');
    });
  });

  describe('zero cost', () => {
    it('handles zero tokens and zero costUsd', () => {
      render(
        <CapabilityMeters
          view={buildView()}
          wallTimeMs={0}
          cost={{ tokensUsed: 0, costUsd: 0, byStage: [] }}
          memory={null}
        />
      );
      const hints = screen.getAllByTestId('stat-hint');
      expect(hints[0].textContent).toContain('0 tokens');
    });
  });
});
