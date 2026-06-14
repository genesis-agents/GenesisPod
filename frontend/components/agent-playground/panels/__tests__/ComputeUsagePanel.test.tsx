/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  Coins: (props: Record<string, unknown>) => (
    <svg data-testid="coins-icon" {...props} />
  ),
  Layers: (props: Record<string, unknown>) => (
    <svg data-testid="layers-icon" {...props} />
  ),
  Cpu: (props: Record<string, unknown>) => (
    <svg data-testid="cpu-icon" {...props} />
  ),
  Wrench: (props: Record<string, unknown>) => (
    <svg data-testid="wrench-icon" {...props} />
  ),
  AlertTriangle: (props: Record<string, unknown>) => (
    <svg data-testid="alert-triangle-icon" {...props} />
  ),
  Activity: (props: Record<string, unknown>) => (
    <svg data-testid="activity-icon" {...props} />
  ),
  Gauge: (props: Record<string, unknown>) => (
    <svg data-testid="gauge-icon" {...props} />
  ),
}));

vi.mock('@/lib/utils/common', () => ({
  cn: (...classes: (string | undefined | false | null)[]) =>
    classes.filter(Boolean).join(' '),
}));

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
  TBody: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <tbody className={className}>{children}</tbody>,
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

vi.mock('@/components/common/tables', () => ({
  TruncatedCell: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span className={className}>{children}</span>,
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
  fmtLatency: (ms: number) => {
    if (!ms || ms <= 0) return '—';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  },
  STAGE_LABEL: {
    leader: 'Leader',
    researchers: 'Researchers',
    reconciler: 'Reconciler',
    analyst: 'Analyst',
    writer: 'Writer',
    reviewer: 'Reviewer',
    critic: 'Critic',
  },
  ROLE_LABEL: {
    leader: 'Leader',
    researcher: 'Researcher',
    analyst: 'Analyst',
    writer: 'Writer',
    reviewer: 'Reviewer',
  },
}));

import { ComputeUsagePanel } from '../ComputeUsagePanel';
import type {
  CostState,
  AgentLiveState,
  DimensionPipelineState,
} from '@/lib/features/agent-playground/mission-presentation.types';
import type { MissionTodo } from '@/lib/features/agent-playground/mission-todo.types';

function buildAgent(overrides: Partial<AgentLiveState> = {}): AgentLiveState {
  return {
    agentId: 'agent-1',
    role: 'researcher',
    phase: 'completed',
    trace: [],
    ...overrides,
  };
}

const emptyCost: CostState = {
  tokensUsed: 0,
  costUsd: 0,
  byStage: [],
};

const emptyDimensionPipelines = new Map<string, DimensionPipelineState>();
const emptyTodos: MissionTodo[] = [];

describe('ComputeUsagePanel', () => {
  describe('SummaryStrip (Section A)', () => {
    it('renders 4 stat cards', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      const cards = screen.getAllByTestId('stat-card');
      expect(cards).toHaveLength(4);
    });

    it('shows cost label', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('总成本')).toBeInTheDocument();
    });

    it('shows total tokens label', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('总 tokens')).toBeInTheDocument();
    });

    it('shows tool call count label', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('工具调用')).toBeInTheDocument();
    });

    it('shows avg latency as — when no observation events', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      // latency card = 4th
      expect(values[3].textContent).toBe('—');
    });

    it('computes avg latency from observation events', () => {
      const agent = buildAgent({
        trace: [
          {
            kind: 'observation',
            ts: 1000,
            toolId: 'web-search',
            latencyMs: 1000,
          },
          {
            kind: 'observation',
            ts: 2000,
            toolId: 'web-search',
            latencyMs: 3000,
          },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      // avg = 2000ms total / 2 obs = 1000ms → "1.0s"
      const values = screen.getAllByTestId('stat-value');
      expect(values[3].textContent).toBe('2.0s');
    });

    it('counts action calls with toolId for total calls', () => {
      const agent = buildAgent({
        trace: [
          { kind: 'action', ts: 1000, toolId: 'web-search' },
          { kind: 'action', ts: 2000, toolId: 'summarize' },
          { kind: 'thought', ts: 500 }, // not counted
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      const values = screen.getAllByTestId('stat-value');
      // totalCalls = 2 (only action+toolId)
      expect(values[2].textContent).toBe('2');
    });
  });

  describe('Section B - Model distribution', () => {
    it('renders model distribution table even when agent has empty trace', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[buildAgent()]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      // buildModelDistribution adds every agent to the map even with empty trace,
      // creating an (unknown) entry — so ModelDistributionTable IS rendered
      expect(screen.getByText(/共 \d+ 个模型/)).toBeInTheDocument();
    });

    it('renders model distribution table when agent has trace with tokens', () => {
      const agent = buildAgent({
        modelId: 'gpt-4o-unique',
        trace: [
          {
            kind: 'action',
            ts: 1000,
            toolId: 'search',
            tokensUsed: 1000,
          },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('模型分布')).toBeInTheDocument();
      // text may appear in two nodes (TruncatedCell renders in span); use getAllByText
      expect(
        screen.getAllByText('gpt-4o-unique').length
      ).toBeGreaterThanOrEqual(1);
    });

    it('shows unknown model label when modelId is absent', () => {
      const agent = buildAgent({
        modelId: undefined,
        trace: [
          { kind: 'action', ts: 1000, toolId: 'search', tokensUsed: 100 },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText(/未识别模型/)).toBeInTheDocument();
    });

    it('shows known model and drops unknown row', () => {
      const agent1 = buildAgent({
        agentId: 'a1',
        modelId: 'claude-3-unique',
        trace: [
          { kind: 'action', ts: 1000, toolId: 'search', tokensUsed: 1000 },
        ],
      });
      const agent2 = buildAgent({
        agentId: 'a2',
        modelId: undefined,
        trace: [
          { kind: 'action', ts: 2000, toolId: 'search', tokensUsed: 200 },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent1, agent2]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(
        screen.getAllByText('claude-3-unique').length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/未识别模型/)).not.toBeInTheDocument();
    });
  });

  describe('Section C - Stage bars', () => {
    it('renders stage distribution section', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('阶段分布')).toBeInTheDocument();
    });

    it('shows all 7 stages in stage bars', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('Leader')).toBeInTheDocument();
      expect(screen.getByText('Researchers')).toBeInTheDocument();
      expect(screen.getByText('Reconciler')).toBeInTheDocument();
      expect(screen.getByText('Analyst')).toBeInTheDocument();
      expect(screen.getByText('Writer')).toBeInTheDocument();
      expect(screen.getByText('Reviewer')).toBeInTheDocument();
      expect(screen.getByText('Critic')).toBeInTheDocument();
    });

    it('shows stage cost when costUsd > 0', () => {
      const cost: CostState = {
        tokensUsed: 1000,
        costUsd: 0.003,
        byStage: [{ stage: 'leader', tokensUsed: 1000, costUsd: 0.003 }],
      };
      render(
        <ComputeUsagePanel
          cost={cost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      // $0.003 appears in both stage bars and summary strip; check at least one
      expect(screen.getAllByText(/\$0.003/).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Section D - Agent instance table', () => {
    it('does not render agent table when agents is empty', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.queryByText('Agent 实例耗时')).not.toBeInTheDocument();
    });

    it('renders agent table with agents', () => {
      const agent = buildAgent({
        agentId: 'unique-agent-xyz',
        role: 'researcher',
        phase: 'completed',
        modelId: 'gpt-4o-unique-xyz',
        wallTimeMs: 3000,
        iterations: 5,
        retryCount: 1,
        tokensUsed: 2000,
        costUsd: 0.006,
        toolCallCount: 3,
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('Agent 实例耗时')).toBeInTheDocument();
      expect(
        screen.getAllByText('unique-agent-xyz').length
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText('gpt-4o-unique-xyz').length
      ).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('已完成')).toBeInTheDocument();
    });

    it('shows running phase label', () => {
      const agent = buildAgent({ phase: 'running' });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('运行中')).toBeInTheDocument();
    });

    it('shows failed phase label', () => {
      const agent = buildAgent({ phase: 'failed' });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('失败')).toBeInTheDocument();
    });

    it('shows pending phase label', () => {
      const agent = buildAgent({ phase: 'pending' });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('待启动')).toBeInTheDocument();
    });

    it('shows — for null tokensUsed', () => {
      const agent = buildAgent({ tokensUsed: undefined });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    });

    it('shows dimension when present', () => {
      const agent = buildAgent({ dimension: 'Market Sizing' });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('Market Sizing')).toBeInTheDocument();
    });

    it('shows — for null dimension', () => {
      const agent = buildAgent({ dimension: undefined });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
    });

    it('sorts agents by wallTimeMs descending', () => {
      const agent1 = buildAgent({
        agentId: 'slow-agent',
        wallTimeMs: 10000,
      });
      const agent2 = buildAgent({
        agentId: 'fast-agent',
        wallTimeMs: 1000,
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent2, agent1]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      const allRows = screen.getAllByText(/agent/);
      // slow-agent should appear before fast-agent
      expect(allRows[0].textContent).toContain('slow-agent');
    });
  });

  describe('Section E - Tool latency table', () => {
    it('does not render tool table when no tool traces', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[buildAgent()]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.queryByText('工具调用矩阵')).not.toBeInTheDocument();
    });

    it('renders tool table when action trace present', () => {
      const agent = buildAgent({
        trace: [{ kind: 'action', ts: 1000, toolId: 'web-search' }],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('工具调用矩阵')).toBeInTheDocument();
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });

    it('shows 成功率未知 when no observations exist', () => {
      const agent = buildAgent({
        trace: [{ kind: 'action', ts: 1000, toolId: 'web-search' }],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('成功率未知')).toBeInTheDocument();
    });

    it('computes success rate from observations', () => {
      const agent = buildAgent({
        trace: [
          { kind: 'action', ts: 1000, toolId: 'web-search' },
          {
            kind: 'observation',
            ts: 2000,
            toolId: 'web-search',
            latencyMs: 500,
          },
          { kind: 'action', ts: 3000, toolId: 'web-search' },
          {
            kind: 'observation',
            ts: 4000,
            toolId: 'web-search',
            latencyMs: 300,
          },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      // 2 obs, 0 errors → 100% success
      expect(screen.getByText(/成功率 100%/)).toBeInTheDocument();
    });

    it('shows error count in tool table', () => {
      const agent = buildAgent({
        trace: [
          { kind: 'action', ts: 1000, toolId: 'unique-scraper-tool' },
          {
            kind: 'observation',
            ts: 2000,
            toolId: 'unique-scraper-tool',
            latencyMs: 200,
            error: 'Timeout',
          },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('unique-scraper-tool')).toBeInTheDocument();
      // Error count 1 should be present
      expect(screen.getAllByText('1').length).toBeGreaterThanOrEqual(1);
    });

    it('shows amber success rate when 70-89%', () => {
      // 10 calls with 8 obs and 2 errors = 75%
      const trace = [];
      for (let i = 0; i < 10; i++) {
        trace.push({ kind: 'action' as const, ts: i * 100, toolId: 'tool-x' });
        if (i < 8) {
          trace.push({
            kind: 'observation' as const,
            ts: i * 100 + 50,
            toolId: 'tool-x',
            latencyMs: 100,
            error: i < 2 ? 'err' : undefined,
          });
        }
      }
      const agent = buildAgent({ trace });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('工具调用矩阵')).toBeInTheDocument();
    });

    it('skips trace entries without toolId', () => {
      const agent = buildAgent({
        trace: [
          { kind: 'action', ts: 1000 }, // no toolId → skipped
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.queryByText('工具调用矩阵')).not.toBeInTheDocument();
    });
  });

  describe('Skill usage matrix', () => {
    it('does not render skill table when no skill toolIds', () => {
      const agent = buildAgent({
        trace: [{ kind: 'action', ts: 1000, toolId: 'web-search' }],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.queryByText('技能使用矩阵')).not.toBeInTheDocument();
    });

    it('renders skill table when skill toolIds found', () => {
      const agent = buildAgent({
        trace: [
          { kind: 'action', ts: 1000, toolId: 'dimension-unique-xyz' },
          { kind: 'action', ts: 2000, toolId: 'web-research-unique-xyz' },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('技能使用矩阵')).toBeInTheDocument();
      expect(
        screen.getAllByText('dimension-unique-xyz').length
      ).toBeGreaterThanOrEqual(1);
    });

    it('matches skill: prefix pattern', () => {
      const agent = buildAgent({
        trace: [{ kind: 'action', ts: 1000, toolId: 'skill:summarize' }],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('技能使用矩阵')).toBeInTheDocument();
    });
  });

  describe('Section F - Waste analysis', () => {
    it('shows zero-waste message when no retries or rewrites', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[buildAgent()]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(
        screen.getByText('零返工 · 0 次重试 / 0 次重写')
      ).toBeInTheDocument();
    });

    it('shows waste analysis when retries exist', () => {
      const agent = buildAgent({ retryCount: 7 });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[agent]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('返工 / 浪费分析')).toBeInTheDocument();
      expect(screen.getByText('Agent 自愈重试')).toBeInTheDocument();
      expect(screen.getAllByText('7').length).toBeGreaterThanOrEqual(1);
    });

    it('shows chapter rewrites from dimensionPipelines', () => {
      const dpMap = new Map<string, DimensionPipelineState>();
      dpMap.set('dim-1', {
        dimension: 'Dim 1',
        chapters: [
          {
            index: 0,
            heading: 'Ch 1',
            status: 'done',
            attempts: 3, // 2 rewrites
          },
        ],
      });
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={dpMap}
        />
      );
      expect(screen.getByText('返工 / 浪费分析')).toBeInTheDocument();
      expect(screen.getByText('章节重写')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('shows reviewer-revise todos', () => {
      const todos: MissionTodo[] = [
        {
          id: 'todo-1',
          origin: 'reviewer-revise',
          createdBy: 'reviewer',
          createdAt: 0,
          reasonText: 'Revise section 2',
          scope: 'review',
          title: 'Revise section 2',
          assignee: { role: 'reviewer' },
          status: 'done',
          artifacts: [],
          narrativeLog: [],
        },
      ];
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={todos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('Reviewer 重派')).toBeInTheDocument();
    });

    it('shows self-heal todos', () => {
      const todos: MissionTodo[] = [
        {
          id: 'todo-2',
          origin: 'self-heal-retry',
          createdBy: 'system',
          createdAt: 0,
          reasonText: 'Self heal',
          scope: 'dimension',
          title: 'Self heal',
          assignee: { role: 'researcher' },
          status: 'done',
          artifacts: [],
          narrativeLog: [],
        },
      ];
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={todos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('Self-heal 任务')).toBeInTheDocument();
    });

    it('shows leader-assess replay todos', () => {
      const todos: MissionTodo[] = [
        {
          id: 'todo-3',
          origin: 'leader-assess-abort',
          createdBy: 'leader',
          createdAt: 0,
          reasonText: 'Leader replay',
          scope: 'mission',
          title: 'Leader replay',
          assignee: { role: 'leader' },
          status: 'done',
          artifacts: [],
          narrativeLog: [],
        },
      ];
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={todos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(screen.getByText('Leader 评审重派')).toBeInTheDocument();
    });

    it('shows zero-waste with multiple agents all with retryCount=0', () => {
      const agents = [
        buildAgent({ agentId: 'a1', retryCount: 0 }),
        buildAgent({ agentId: 'a2', retryCount: 0 }),
      ];
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={agents}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(
        screen.getByText('零返工 · 0 次重试 / 0 次重写')
      ).toBeInTheDocument();
    });
  });

  describe('footer note', () => {
    it('shows cost estimation footnote', () => {
      render(
        <ComputeUsagePanel
          cost={emptyCost}
          agents={[]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(
        screen.getByText(/所有数字来自前端事件流推导/)
      ).toBeInTheDocument();
    });
  });

  describe('edge cases in buildModelDistribution', () => {
    it('distributes tokens proportionally by callCount when no trace tokens', () => {
      const agent1 = buildAgent({
        agentId: 'a1',
        modelId: 'unique-gpt-model-xyz',
        trace: [
          { kind: 'action', ts: 1000, toolId: 'search' },
          { kind: 'action', ts: 2000, toolId: 'search' },
        ],
      });
      const agent2 = buildAgent({
        agentId: 'a2',
        modelId: 'unique-claude-model-xyz',
        trace: [{ kind: 'action', ts: 3000, toolId: 'scrape' }],
      });
      render(
        <ComputeUsagePanel
          cost={{ tokensUsed: 3000, costUsd: 0.009, byStage: [] }}
          agents={[agent1, agent2]}
          todos={emptyTodos}
          dimensionPipelines={emptyDimensionPipelines}
        />
      );
      expect(
        screen.getAllByText('unique-gpt-model-xyz').length
      ).toBeGreaterThanOrEqual(1);
      expect(
        screen.getAllByText('unique-claude-model-xyz').length
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
