/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  ChevronDown: (props: Record<string, unknown>) => (
    <svg data-testid="chevron-down" {...props} />
  ),
  ChevronRight: (props: Record<string, unknown>) => (
    <svg data-testid="chevron-right" {...props} />
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

import { StageProcessPanel } from '../StageProcessPanel';
import type { StageProcessTrace } from '@/lib/features/agent-playground/mission-presentation.types';

const emptyTrace: StageProcessTrace = {};

describe('StageProcessPanel', () => {
  describe('null rendering', () => {
    it('returns null when all fields are empty/absent', () => {
      const { container } = render(
        <StageProcessPanel processTrace={emptyTrace} />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders when only totalTokens is present', () => {
      render(<StageProcessPanel processTrace={{ totalTokens: 5000 }} />);
      expect(screen.getByText('阶段过程 · stage process')).toBeInTheDocument();
    });

    it('renders when only totalDurationMs is present', () => {
      render(<StageProcessPanel processTrace={{ totalDurationMs: 3000 }} />);
      expect(screen.getByText('阶段过程 · stage process')).toBeInTheDocument();
    });

    it('renders when only stepCount is present', () => {
      render(<StageProcessPanel processTrace={{ stepCount: 5 }} />);
      expect(screen.getByText('阶段过程 · stage process')).toBeInTheDocument();
    });

    it('renders when only outputPeek is present', () => {
      render(
        <StageProcessPanel processTrace={{ outputPeek: { key: 'value' } }} />
      );
      expect(screen.getByText('阶段过程 · stage process')).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('shows stageLabel when provided', () => {
      render(
        <StageProcessPanel
          processTrace={{ totalTokens: 1000 }}
          stageLabel="Writer Stage"
        />
      );
      expect(screen.getByText('Writer Stage')).toBeInTheDocument();
    });

    it('does not show stageLabel when absent', () => {
      render(<StageProcessPanel processTrace={{ totalTokens: 1000 }} />);
      // No stageLabel span rendered
      expect(screen.queryByText('Writer Stage')).not.toBeInTheDocument();
    });
  });

  describe('stat chips', () => {
    it('shows stepCount chip', () => {
      render(<StageProcessPanel processTrace={{ stepCount: 7 }} />);
      expect(screen.getByText('步数')).toBeInTheDocument();
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('shows totalTokens chip with formatting', () => {
      render(<StageProcessPanel processTrace={{ totalTokens: 5000 }} />);
      expect(screen.getByText('Tokens')).toBeInTheDocument();
      expect(screen.getByText('5.0k')).toBeInTheDocument();
    });

    it('shows totalTokens=0 as — in chip', () => {
      render(<StageProcessPanel processTrace={{ totalTokens: 0 }} />);
      // fmtTokens(0) returns '—'
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('shows totalDurationMs chip', () => {
      render(<StageProcessPanel processTrace={{ totalDurationMs: 2500 }} />);
      expect(screen.getByText('耗时')).toBeInTheDocument();
      expect(screen.getByText('2.5 s')).toBeInTheDocument();
    });

    it('shows duration in minutes when > 60s', () => {
      render(<StageProcessPanel processTrace={{ totalDurationMs: 90000 }} />);
      expect(screen.getByText('1.5 min')).toBeInTheDocument();
    });

    it('shows ms for small durations', () => {
      render(<StageProcessPanel processTrace={{ totalDurationMs: 500 }} />);
      expect(screen.getByText('500 ms')).toBeInTheDocument();
    });

    it('shows — when duration is 0', () => {
      render(<StageProcessPanel processTrace={{ totalDurationMs: 0 }} />);
      expect(screen.getByText('—')).toBeInTheDocument();
    });

    it('does not show chip row when all 3 chips absent', () => {
      render(
        <StageProcessPanel
          processTrace={{ inputs: [{ label: 'x', value: 'y' }] }}
        />
      );
      expect(screen.queryByText('步数')).not.toBeInTheDocument();
      expect(screen.queryByText('Tokens')).not.toBeInTheDocument();
      expect(screen.queryByText('耗时')).not.toBeInTheDocument();
    });
  });

  describe('inputs section', () => {
    it('shows inputs section when inputs present', () => {
      render(
        <StageProcessPanel
          processTrace={{
            inputs: [
              { label: 'Topic', value: 'AI Research' },
              { label: 'Depth', value: 'deep' },
            ],
          }}
        />
      );
      expect(screen.getByText('输入')).toBeInTheDocument();
      expect(screen.getByText('Topic')).toBeInTheDocument();
      expect(screen.getByText('AI Research')).toBeInTheDocument();
      expect(screen.getByText('Depth')).toBeInTheDocument();
      expect(screen.getByText('deep')).toBeInTheDocument();
    });

    it('shows numeric value as string', () => {
      render(
        <StageProcessPanel
          processTrace={{ inputs: [{ label: 'Count', value: 42 }] }}
        />
      );
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('does not show inputs section when inputs is empty', () => {
      render(
        <StageProcessPanel processTrace={{ inputs: [], totalTokens: 100 }} />
      );
      expect(screen.queryByText('输入')).not.toBeInTheDocument();
    });
  });

  describe('LLM calls section', () => {
    it('shows LLM calls table when present', () => {
      render(
        <StageProcessPanel
          processTrace={{
            llmCalls: [
              {
                modelId: 'gpt-4o',
                tokensIn: 1000,
                tokensOut: 500,
                durationMs: 2000,
                costUsd: 0.005,
              },
            ],
          }}
        />
      );
      expect(screen.getByText('LLM 调用')).toBeInTheDocument();
      expect(screen.getByText('gpt-4o')).toBeInTheDocument();
      expect(screen.getByText('1.0k')).toBeInTheDocument();
      expect(screen.getByText('500')).toBeInTheDocument();
      expect(screen.getByText('2.0 s')).toBeInTheDocument();
      expect(screen.getByText('$0.0050')).toBeInTheDocument();
    });

    it('shows — for absent modelId', () => {
      render(
        <StageProcessPanel processTrace={{ llmCalls: [{ tokensIn: 100 }] }} />
      );
      const dashes = screen.getAllByText('—');
      expect(dashes.length).toBeGreaterThanOrEqual(1);
    });

    it('shows LLM call cost as $x.xx for >=0.01', () => {
      render(
        <StageProcessPanel processTrace={{ llmCalls: [{ costUsd: 0.05 }] }} />
      );
      expect(screen.getByText('$0.05')).toBeInTheDocument();
    });

    it('shows LLM call cost as $x.xxxx for <0.01 and >=0.001', () => {
      render(
        <StageProcessPanel processTrace={{ llmCalls: [{ costUsd: 0.003 }] }} />
      );
      expect(screen.getByText('$0.0030')).toBeInTheDocument();
    });

    it('does not show LLM calls when absent', () => {
      render(<StageProcessPanel processTrace={{ totalTokens: 100 }} />);
      expect(screen.queryByText('LLM 调用')).not.toBeInTheDocument();
    });

    it('does not show LLM calls when empty', () => {
      render(
        <StageProcessPanel processTrace={{ llmCalls: [], totalTokens: 100 }} />
      );
      expect(screen.queryByText('LLM 调用')).not.toBeInTheDocument();
    });
  });

  describe('outputPeek section', () => {
    it('shows outputPeek section when present', () => {
      render(
        <StageProcessPanel
          processTrace={{ outputPeek: { score: 85, grade: 'A' } }}
        />
      );
      expect(screen.getByText('输出概览')).toBeInTheDocument();
      expect(screen.getByText('score')).toBeInTheDocument();
      expect(screen.getByText('85')).toBeInTheDocument();
      expect(screen.getByText('grade')).toBeInTheDocument();
      expect(screen.getByText('A')).toBeInTheDocument();
    });

    it('does not show outputPeek when empty object', () => {
      render(
        <StageProcessPanel
          processTrace={{ outputPeek: {}, totalTokens: 100 }}
        />
      );
      expect(screen.queryByText('输出概览')).not.toBeInTheDocument();
    });
  });

  describe('ReAct trace section', () => {
    it('shows ReAct toggle button when reactTrace present', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              { kind: 'thought', ts: 1000, text: 'Thinking about this...' },
            ],
          }}
        />
      );
      expect(screen.getByText('ReAct 过程')).toBeInTheDocument();
      expect(screen.getByText('· 1 条')).toBeInTheDocument();
    });

    it('expands ReAct trace when button clicked', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              { kind: 'thought', ts: 1000, text: 'Thinking about this...' },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('Thinking about this...')).toBeInTheDocument();
      expect(screen.getByText('思考')).toBeInTheDocument();
    });

    it('collapses ReAct trace when clicked again', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'thought', ts: 1000, text: 'A thought' }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('A thought')).toBeInTheDocument();
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.queryByText('A thought')).not.toBeInTheDocument();
    });

    it('shows placeholder for empty thought text', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'thought', ts: 1000, text: '' }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('（无推理文本）')).toBeInTheDocument();
    });

    it('shows placeholder for whitespace-only thought', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'thought', ts: 1000, text: '   ' }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('（无推理文本）')).toBeInTheDocument();
    });

    it('shows action with toolId', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'action', ts: 1000, toolId: 'web-search' }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('调用')).toBeInTheDocument();
      expect(screen.getByText('web-search')).toBeInTheDocument();
    });

    it('shows action with text when no toolId', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              { kind: 'action', ts: 1000, text: 'LLM reasoning here...' },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('LLM 推理')).toBeInTheDocument();
      expect(screen.getByText(/LLM reasoning here/)).toBeInTheDocument();
    });

    it('truncates action text > 240 chars', () => {
      const longText = 'A'.repeat(300);
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'action', ts: 1000, text: longText }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText(/A{240}…/)).toBeInTheDocument();
    });

    it('shows "结构化输出" for action with no toolId and no text', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'action', ts: 1000 }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(
        screen.getByText('结构化输出（无 tool_call）')
      ).toBeInTheDocument();
    });

    it('shows observation with toolId', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              {
                kind: 'observation',
                ts: 1000,
                toolId: 'web-search',
                latencyMs: 500,
                tokensUsed: 100,
              },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      // "返回" appears multiple times (table header too); check at least one exists
      expect(screen.getAllByText('返回').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('web-search')).toBeInTheDocument();
      expect(screen.getByText('(500 ms)')).toBeInTheDocument();
      expect(screen.getByText(/100 tk/)).toBeInTheDocument();
    });

    it('shows observation with output when no toolId', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              {
                kind: 'observation',
                ts: 1000,
                output: 'Result data here.',
              },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('LLM 产出')).toBeInTheDocument();
      expect(screen.getByText('Result data here.')).toBeInTheDocument();
    });

    it('shows "完成" placeholder when observation output is empty', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'observation', ts: 1000 }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('完成')).toBeInTheDocument();
    });

    it('shows observation error when present', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              {
                kind: 'observation',
                ts: 1000,
                toolId: 'web-search',
                error: 'Rate limit exceeded',
              },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText(/Rate limit exceeded/)).toBeInTheDocument();
    });

    it('truncates observation output > 240 chars', () => {
      const longOutput = 'B'.repeat(300);
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'observation', ts: 1000, output: longOutput }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText(/B{240}…/)).toBeInTheDocument();
    });

    it('shows reflection with text', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              { kind: 'reflection', ts: 1000, text: 'Need more data.' },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('反思')).toBeInTheDocument();
      expect(screen.getByText('Need more data.')).toBeInTheDocument();
    });

    it('shows placeholder for empty reflection', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'reflection', ts: 1000, text: '' }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('（无总结）')).toBeInTheDocument();
    });

    it('shows error kind with error text', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              { kind: 'error', ts: 1000, error: 'Tool call failed.' },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('错误')).toBeInTheDocument();
      expect(screen.getByText('Tool call failed.')).toBeInTheDocument();
    });

    it('shows placeholder for empty error', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [{ kind: 'error', ts: 1000, error: '' }],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('（错误未详）')).toBeInTheDocument();
    });

    it('does not show ReAct toggle when reactTrace is empty', () => {
      render(
        <StageProcessPanel
          processTrace={{ reactTrace: [], totalTokens: 100 }}
        />
      );
      expect(screen.queryByText('ReAct 过程')).not.toBeInTheDocument();
    });

    it('shows multiple trace entries', () => {
      render(
        <StageProcessPanel
          processTrace={{
            reactTrace: [
              { kind: 'thought', ts: 1000, text: 'Thought 1' },
              { kind: 'action', ts: 2000, toolId: 'search' },
              { kind: 'observation', ts: 3000, toolId: 'search' },
            ],
          }}
        />
      );
      fireEvent.click(screen.getByText('ReAct 过程'));
      expect(screen.getByText('· 3 条')).toBeInTheDocument();
      expect(screen.getByText('Thought 1')).toBeInTheDocument();
    });
  });

  describe('fmtUsd edge cases', () => {
    it('shows $x.xxxx for cost < 0.01', () => {
      render(
        <StageProcessPanel processTrace={{ llmCalls: [{ costUsd: 0.005 }] }} />
      );
      expect(screen.getByText('$0.0050')).toBeInTheDocument();
    });

    it('shows — for null costUsd in LLM call', () => {
      render(
        <StageProcessPanel
          processTrace={{ llmCalls: [{ modelId: 'gpt-4' }] }}
        />
      );
      const cells = screen.getAllByRole('cell');
      // last cell should contain —
      const lastCell = cells[cells.length - 1];
      expect(lastCell.textContent).toBe('—');
    });
  });
});
