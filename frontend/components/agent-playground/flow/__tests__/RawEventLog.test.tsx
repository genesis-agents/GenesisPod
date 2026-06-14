import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RawEventLog } from '../RawEventLog';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';

// Stub scrollIntoView which jsdom doesn't implement
Element.prototype.scrollIntoView = vi.fn();

// Stub ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock ClientDate to avoid date rendering complexity
vi.mock('@/components/common/ClientDate', () => ({
  ClientDate: ({ date }: { date: number | string }) => (
    <span data-testid="client-date">{String(date)}</span>
  ),
}));

// Mock ExpandableText
vi.mock('@/components/agent-playground/ui', () => ({
  Card: ({
    children,
    className,
    bordered,
  }: {
    children: React.ReactNode;
    className?: string;
    bordered?: boolean;
  }) => (
    <div data-testid="card" className={className} data-bordered={bordered}>
      {children}
    </div>
  ),
  ExpandableText: ({
    text,
    maxChars,
    className,
  }: {
    text: string;
    maxChars: number;
    className?: string;
  }) => (
    <span className={className} data-maxchars={maxChars}>
      {text}
    </span>
  ),
}));

// Mock EmptyState
vi.mock('@/components/ui/states/EmptyState', () => ({
  EmptyState: ({
    title,
    description,
  }: {
    title: string;
    description?: string;
  }) => (
    <div data-testid="empty-state">
      <p>{title}</p>
      {description && <p>{description}</p>}
    </div>
  ),
}));

function makeEvent(
  type: string,
  payload: Record<string, unknown> = {},
  timestamp = 1000
): PlaygroundEvent {
  return { type, payload, timestamp, agentId: 'agent-1' } as PlaygroundEvent;
}

describe('RawEventLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders empty state when no events', () => {
    render(<RawEventLog events={[]} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('暂无事件')).toBeInTheDocument();
  });

  it('shows event count in header', () => {
    const events = [
      makeEvent('playground.mission:started', { input: { topic: 'Test' } }),
      makeEvent('playground.mission:completed', {
        reviewScore: 90,
        tokensUsed: 100,
        wallTimeMs: 5000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('· 共 2 条')).toBeInTheDocument();
  });

  it('renders auto-scroll checkbox checked by default', () => {
    render(<RawEventLog events={[makeEvent('playground.mission:started')]} />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('can toggle auto-scroll off', () => {
    render(<RawEventLog events={[makeEvent('playground.mission:started')]} />);
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
  });

  it('renders mission:started event', () => {
    const events = [
      makeEvent('playground.mission:started', {
        input: { topic: 'AI trends', depth: 'deep', language: 'zh-CN' },
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Mission started')).toBeInTheDocument();
    expect(screen.getByText('AI trends')).toBeInTheDocument();
  });

  it('renders mission:completed event', () => {
    const events = [
      makeEvent('playground.mission:completed', {
        reviewScore: 85,
        tokensUsed: 2000,
        wallTimeMs: 10000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Mission completed')).toBeInTheDocument();
  });

  it('renders mission:failed event', () => {
    const events = [
      makeEvent('playground.mission:failed', { message: 'Out of budget' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Mission failed')).toBeInTheDocument();
    expect(screen.getByText('Out of budget')).toBeInTheDocument();
  });

  it('renders mission:rejected event', () => {
    const events = [
      makeEvent('playground.mission:rejected', {
        userMessage: 'Content not allowed',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Mission rejected')).toBeInTheDocument();
    expect(screen.getByText('Content not allowed')).toBeInTheDocument();
  });

  it('renders mission:rejected with reason fallback', () => {
    const events = [
      makeEvent('playground.mission:rejected', { reason: 'policy violation' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('policy violation')).toBeInTheDocument();
  });

  it('renders stage:started event', () => {
    const events = [
      makeEvent('playground.stage:started', {
        stage: 'leader',
        dimensions: [],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Stage started · leader')).toBeInTheDocument();
  });

  it('renders stage:started with researchers and dimensions', () => {
    const events = [
      makeEvent('playground.stage:started', {
        stage: 'researchers',
        dimensions: ['dim1', 'dim2', 'dim3'],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('3 dimensions to research')).toBeInTheDocument();
  });

  it('renders stage:started with attempt', () => {
    const events = [
      makeEvent('playground.stage:started', { stage: 'writer', attempt: 2 }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('attempt #2')).toBeInTheDocument();
  });

  it('renders stage:completed for leader with dimensions', () => {
    const events = [
      makeEvent('playground.stage:completed', {
        stage: 'leader',
        dimensions: ['a', 'b'],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Stage completed · leader')).toBeInTheDocument();
    expect(screen.getByText('produced 2 dimensions')).toBeInTheDocument();
  });

  it('renders stage:completed for reviewer with score', () => {
    const events = [
      makeEvent('playground.stage:completed', {
        stage: 'reviewer',
        score: 88,
        decision: 'accept',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('consensus score 88 · accept')).toBeInTheDocument();
  });

  it('renders stage:completed with insightsCount', () => {
    const events = [
      makeEvent('playground.stage:completed', {
        stage: 'analyst',
        insightsCount: 7,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('7 insights')).toBeInTheDocument();
  });

  it('renders agent:lifecycle started event', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        agentId: 'researcher#1',
        phase: 'started',
        role: 'researcher',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('researcher#1 started')).toBeInTheDocument();
  });

  it('renders agent:lifecycle completed with wallMs', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        agentId: 'leader',
        phase: 'completed',
        role: 'leader',
        wallTimeMs: 3500,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('leader completed')).toBeInTheDocument();
    expect(screen.getByText('3.5s')).toBeInTheDocument();
  });

  it('renders agent:lifecycle failed', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        agentId: 'analyst',
        phase: 'failed',
        role: 'analyst',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('analyst failed')).toBeInTheDocument();
  });

  it('renders agent:thought event', () => {
    const events = [
      makeEvent('playground.agent:thought', {
        agentId: 'leader',
        text: 'I am thinking...',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('leader thinking')).toBeInTheDocument();
    expect(screen.getByText('I am thinking...')).toBeInTheDocument();
  });

  it('renders agent:action event with toolId', () => {
    const events = [
      makeEvent('playground.agent:action', {
        agentId: 'researcher',
        toolId: 'web-search',
        input: { query: 'AI' },
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('researcher → web-search')).toBeInTheDocument();
  });

  it('renders agent:action with skillId fallback', () => {
    const events = [
      makeEvent('playground.agent:action', {
        agentId: 'analyst',
        skillId: 'critical-review',
        input: null,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('analyst → critical-review')).toBeInTheDocument();
  });

  it('renders agent:observation without error', () => {
    const events = [
      makeEvent('playground.agent:observation', {
        agentId: 'researcher',
        toolId: 'web-search',
        output: 'results',
        latencyMs: 400,
        tokensUsed: 50,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('researcher ← web-search')).toBeInTheDocument();
    expect(screen.getByText('400ms · +50tk')).toBeInTheDocument();
  });

  it('renders agent:observation with error', () => {
    const events = [
      makeEvent('playground.agent:observation', {
        agentId: 'researcher',
        toolId: 'web-search',
        error: 'timeout',
        latencyMs: 100,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('timeout')).toBeInTheDocument();
  });

  it('renders agent:reflection event', () => {
    const events = [
      makeEvent('playground.agent:reflection', {
        agentId: 'analyst',
        text: 'Reflection text',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('analyst reflection')).toBeInTheDocument();
    expect(screen.getByText('Reflection text')).toBeInTheDocument();
  });

  it('renders agent:reflection with verdict fallback', () => {
    const events = [
      makeEvent('playground.agent:reflection', {
        agentId: 'analyst',
        verdict: 'pass',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('pass')).toBeInTheDocument();
  });

  it('renders agent:error event', () => {
    const events = [
      makeEvent('playground.agent:error', {
        agentId: 'writer',
        message: 'Out of tokens',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('writer error')).toBeInTheDocument();
    expect(screen.getByText('Out of tokens')).toBeInTheDocument();
  });

  it('renders researcher:completed event', () => {
    const events = [
      makeEvent('playground.researcher:completed', {
        dimension: 'Tech Trends',
        findingsCount: 12,
        state: 'completed',
        wallTimeMs: 8000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Researcher · Tech Trends')).toBeInTheDocument();
    expect(screen.getByText(/completed.*12 findings/)).toBeInTheDocument();
  });

  it('renders researcher:completed with partial state', () => {
    const events = [
      makeEvent('playground.researcher:completed', {
        dimension: 'Market',
        state: 'partial',
        wallTimeMs: 2000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Researcher · Market')).toBeInTheDocument();
  });

  it('renders verifier:verdict event with score', () => {
    const events = [
      makeEvent('playground.verifier:verdict', {
        verifierId: 'judge-1',
        score: 90,
        critique: 'Good work',
        attempt: 1,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Judge · judge-1 → 90 / 100')).toBeInTheDocument();
    expect(screen.getByText('attempt #1')).toBeInTheDocument();
  });

  it('renders verifier:verdict with low score (< 60)', () => {
    const events = [
      makeEvent('playground.verifier:verdict', {
        verifierId: 'judge-2',
        score: 50,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Judge · judge-2 → 50 / 100')).toBeInTheDocument();
  });

  it('renders cost:tick event', () => {
    const events = [
      makeEvent('playground.cost:tick', {
        stage: 'researcher',
        deltaTokens: 500,
        tokensUsed: 2000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Cost · researcher')).toBeInTheDocument();
    expect(screen.getByText('+500 tokens (total 2000)')).toBeInTheDocument();
  });

  it('renders budget:exhausted event', () => {
    const events = [makeEvent('playground.budget:exhausted', { remaining: 0 })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Budget exhausted')).toBeInTheDocument();
  });

  it('renders memory:indexed event', () => {
    const events = [
      makeEvent('playground.memory:indexed', {
        chunks: 5,
        tags: ['tech', 'ai'],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Memory indexed · 5 chunks')).toBeInTheDocument();
    expect(screen.getByText('tech · ai')).toBeInTheDocument();
  });

  it('renders memory:indexed with non-string tags', () => {
    const events = [
      makeEvent('playground.memory:indexed', {
        chunks: 2,
        tags: [1, null, 'ai'],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Memory indexed · 2 chunks')).toBeInTheDocument();
  });

  it('renders memory:indexed with no tags', () => {
    const events = [makeEvent('playground.memory:indexed', { chunks: 3 })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Memory indexed · 3 chunks')).toBeInTheDocument();
  });

  it('renders report:draft event', () => {
    const events = [
      makeEvent('playground.report:draft', {
        attempt: 1,
        report: { title: 'Draft Report' },
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Report draft · attempt 1')).toBeInTheDocument();
    expect(screen.getByText('Draft Report')).toBeInTheDocument();
  });

  it('renders default/unknown event type', () => {
    const events = [
      makeEvent('playground.unknown:event', { someField: 'value' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('unknown:event')).toBeInTheDocument();
  });

  it('renders event without playground prefix', () => {
    const events = [
      makeEvent('mission:started', { input: { topic: 'No prefix' } }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Mission started')).toBeInTheDocument();
  });

  it('toggles raw JSON view on button click', () => {
    const events = [
      makeEvent('playground.mission:started', { input: { topic: 'AI' } }),
    ];
    render(<RawEventLog events={events} />);
    // Before clicking, no raw JSON
    expect(screen.queryByRole('pre' as 'article')).toBeNull();
    // Find the code toggle button
    const toggleBtn = document.querySelector(
      'button[title="Toggle raw JSON"]'
    ) as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn);
    // JSON should now be visible
    const pre = document.querySelector('pre');
    expect(pre).toBeTruthy();
  });

  it('renders agent:lifecycle without role icon', () => {
    const events = [
      makeEvent('playground.agent:lifecycle', {
        agentId: 'bot',
        phase: 'started',
        role: '',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('bot started')).toBeInTheDocument();
  });

  it('handles agent:observation with only latency (no tokens)', () => {
    const events = [
      makeEvent('playground.agent:observation', {
        agentId: 'r',
        toolId: 'search',
        latencyMs: 200,
        tokensUsed: 0,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('200ms')).toBeInTheDocument();
  });

  it('renders verifier:verdict without attempt', () => {
    const events = [
      makeEvent('playground.verifier:verdict', {
        verifierId: 'j',
        score: 70,
        critique: 'Average',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Judge · j → 70 / 100')).toBeInTheDocument();
  });

  it('renders mission:started with no topic', () => {
    const events = [makeEvent('playground.mission:started', { input: {} })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('(no topic)')).toBeInTheDocument();
  });

  it('renders agent:error with no message', () => {
    const events = [makeEvent('playground.agent:error', { agentId: 'a' })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('(no message)')).toBeInTheDocument();
  });

  it('handles previewObject for null payload', () => {
    const events = [makeEvent('playground.some:event', {})];
    render(<RawEventLog events={events} />);
    // Should not throw; renders with empty subtitle or placeholder
    expect(screen.getByText('some:event')).toBeInTheDocument();
  });

  it('renders agent:action with array input (covers previewObject array branch)', () => {
    const events = [
      makeEvent('playground.agent:action', {
        agentId: 'r1',
        toolId: 'batch-search',
        input: [
          { title: 'Result A', url: 'https://a.com' },
          { title: 'Result B', url: 'https://b.com' },
        ],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/batch-search/)).toBeInTheDocument();
  });

  it('renders agent:action with empty array input', () => {
    const events = [
      makeEvent('playground.agent:action', {
        agentId: 'r1',
        toolId: 'empty-tool',
        input: [],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/empty-tool/)).toBeInTheDocument();
  });

  it('renders agent:observation with array output containing items with name fallback', () => {
    const events = [
      makeEvent('playground.agent:observation', {
        agentId: 'r1',
        toolId: 'name-search',
        output: [
          { name: 'Item 1' },
          { url: 'https://b.com' },
          { title: 'Item 3' },
        ],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/name-search/)).toBeInTheDocument();
  });

  it('renders agent:observation with array output of primitives', () => {
    const events = [
      makeEvent('playground.agent:observation', {
        agentId: 'r1',
        toolId: 'counter-tool',
        output: [1, 2, 3],
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/counter-tool/)).toBeInTheDocument();
  });

  it('renders agent:action with numeric input (covers previewObject String branch)', () => {
    const events = [
      makeEvent('playground.agent:action', {
        agentId: 'r1',
        toolId: 'numeric-tool',
        input: 42,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/numeric-tool/)).toBeInTheDocument();
  });

  // ── Branch coverage: RawEventLog lines 306-313, 335-344 ──────────────────

  it("renders cost:tick with missing tokensUsed (covers ?? '?' branch)", () => {
    // total is undefined → subtitle should show "total ?"
    const events = [
      makeEvent('playground.cost:tick', { stage: 'writer', deltaTokens: 100 }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('+100 tokens (total ?)')).toBeInTheDocument();
  });

  it('renders cost:tick with null deltaTokens (covers ?? 0 branch for delta)', () => {
    // deltaTokens is undefined → delta defaults to 0
    const events = [
      makeEvent('playground.cost:tick', { stage: 'analyst', tokensUsed: 500 }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('+0 tokens (total 500)')).toBeInTheDocument();
  });

  it('renders memory:indexed with undefined chunks (covers chunks ?? 0 branch)', () => {
    // chunks is undefined → title shows "Memory indexed · 0 chunks"
    const events = [makeEvent('playground.memory:indexed', { tags: ['x'] })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Memory indexed · 0 chunks')).toBeInTheDocument();
  });

  it('renders memory:indexed with non-array tags (covers else branch → [])', () => {
    // tags is a string (not an array) → normalize to []
    const events = [
      makeEvent('playground.memory:indexed', { chunks: 4, tags: 'single-tag' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Memory indexed · 4 chunks')).toBeInTheDocument();
    // subtitle should be empty since tags coerced to []
    expect(screen.queryByText('single-tag')).toBeNull();
  });

  it("renders report:draft with missing attempt (covers ?? '?' branch)", () => {
    // attempt is undefined → title shows "Report draft · attempt ?"
    const events = [
      makeEvent('playground.report:draft', { report: { title: 'My Draft' } }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Report draft · attempt ?')).toBeInTheDocument();
    expect(screen.getByText('My Draft')).toBeInTheDocument();
  });

  it('renders report:draft without report title (covers undefined subtitle branch)', () => {
    // report.title is undefined → subtitle is undefined (not rendered)
    const events = [
      makeEvent('playground.report:draft', { attempt: 2, report: {} }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Report draft · attempt 2')).toBeInTheDocument();
  });

  it('renders report:draft with no report at all (covers optional chaining branch)', () => {
    // report is undefined → subtitle is undefined
    const events = [makeEvent('playground.report:draft', { attempt: 3 })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Report draft · attempt 3')).toBeInTheDocument();
  });

  // ── Branch coverage: RawEventLog lines 238, 256, 264, 276 ────────────────

  it("renders agent:observation with missing agentId (covers ?? 'agent' branch at line 238)", () => {
    // agentId is undefined → falls back to 'agent'
    const events = [
      makeEvent('playground.agent:observation', {
        toolId: 'search-tool',
        latencyMs: 100,
      }),
    ];
    render(<RawEventLog events={events} />);
    // title should contain 'agent ← search-tool'
    expect(screen.getByText('agent ← search-tool')).toBeInTheDocument();
  });

  it("renders agent:reflection with missing agentId (covers ?? 'agent' branch at line 256)", () => {
    // agentId is undefined → falls back to 'agent' in title
    const events = [
      makeEvent('playground.agent:reflection', { verdict: 'acceptable' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('agent reflection')).toBeInTheDocument();
  });

  it('renders agent:reflection with verdict when no text (covers ?? p.verdict branch at line 257)', () => {
    // text is undefined → falls back to verdict for subtitle
    const events = [
      makeEvent('playground.agent:reflection', {
        agentId: 'r1',
        verdict: 'approved',
        text: undefined,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('r1 reflection')).toBeInTheDocument();
  });

  it("renders agent:error with missing agentId (covers ?? 'agent' branch at line 264)", () => {
    // agentId is undefined → falls back to 'agent'
    const events = [
      makeEvent('playground.agent:error', { message: 'Something failed' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('agent error')).toBeInTheDocument();
  });

  it('renders researcher:completed with missing findingsCount (covers ?? 0 branch at line 276)', () => {
    // findingsCount is undefined → defaults to 0
    const events = [
      makeEvent('playground.researcher:completed', {
        dimension: 'AI Agents',
        state: 'completed',
        wallTimeMs: 5000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Researcher · AI Agents')).toBeInTheDocument();
    expect(screen.getByText(/0 findings/)).toBeInTheDocument();
  });

  it('renders researcher:completed with missing wallTimeMs (covers ?? 0 for wallTimeMs at line 276)', () => {
    // wallTimeMs is undefined → Math.floor(0/1000) = 0
    const events = [
      makeEvent('playground.researcher:completed', {
        dimension: 'Market',
        findingsCount: 3,
        state: 'partial',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Researcher · Market')).toBeInTheDocument();
    expect(screen.getByText(/3 findings/)).toBeInTheDocument();
  });

  // ── Branch coverage: RawEventLog lines 180, 209-219, 224 ─────────────────

  it("renders agent:lifecycle with missing agentId (covers ?? '?' branch at line 180)", () => {
    // agentId is undefined → falls back to '?'
    const events = [
      makeEvent('playground.agent:lifecycle', {
        phase: 'started',
        role: 'researcher',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('? started')).toBeInTheDocument();
  });

  it("renders agent:thought with missing agentId (covers ?? 'agent' branch at line 209)", () => {
    // agentId is undefined → falls back to 'agent'
    const events = [
      makeEvent('playground.agent:thought', { text: 'thinking here' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('agent thinking')).toBeInTheDocument();
  });

  it("renders agent:thought with missing text (covers ?? '(empty)' branch at line 210)", () => {
    // text is undefined → subtitle falls back to '(empty)'
    const events = [makeEvent('playground.agent:thought', { agentId: 'r1' })];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('r1 thinking')).toBeInTheDocument();
  });

  it('renders agent:action with missing toolId and skillId (covers ?? chain at line 214)', () => {
    // toolId and skillId are undefined → falls to p.kind
    const events = [
      makeEvent('playground.agent:action', {
        agentId: 'r1',
        kind: 'some-kind',
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('r1 → some-kind')).toBeInTheDocument();
  });

  it("renders agent:action with missing agentId (covers ?? 'agent' branch at line 219)", () => {
    // agentId is undefined → falls back to 'agent'
    const events = [
      makeEvent('playground.agent:action', { toolId: 'my-tool' }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('agent → my-tool')).toBeInTheDocument();
  });

  it("renders agent:observation with missing toolId (covers ?? '?' branch at line 224)", () => {
    // toolId is undefined → falls back to p.kind ?? '?'
    const events = [
      makeEvent('playground.agent:observation', { agentId: 'r1' }),
    ];
    render(<RawEventLog events={events} />);
    // tool = '?' since toolId, kind are undefined
    expect(screen.getByText('r1 ← ?')).toBeInTheDocument();
  });

  // ── Branch coverage: RawEventLog lines 93, 118-134, 168 ──────────────────

  it('renders event with null payload (covers ?? {} branch at line 93)', () => {
    // payload is null → falls back to {}
    const event: PlaygroundEvent = {
      type: 'playground.budget:exhausted',
      payload: null as unknown as Record<string, unknown>,
      timestamp: 1,
    };
    render(<RawEventLog events={[event]} />);
    expect(screen.getByText('Budget exhausted')).toBeInTheDocument();
  });

  it("renders mission:completed with missing reviewScore (covers ?? '?' branch at line 118)", () => {
    // reviewScore is undefined → shows '?'
    const events = [
      makeEvent('playground.mission:completed', {
        tokensUsed: 500,
        wallTimeMs: 3000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/Score \?/)).toBeInTheDocument();
  });

  it('renders mission:completed with missing tokensUsed (covers ?? 0 branch at line 119)', () => {
    // tokensUsed is undefined → 0
    const events = [
      makeEvent('playground.mission:completed', {
        reviewScore: 85,
        wallTimeMs: 2000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/Score 85 · 0 tokens/)).toBeInTheDocument();
  });

  it('renders mission:completed with missing wallTimeMs (covers ?? 0 for wallTimeMs at line 125)', () => {
    // wallTimeMs is undefined → 0s
    const events = [
      makeEvent('playground.mission:completed', {
        reviewScore: 90,
        tokensUsed: 1000,
      }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/Score 90 · 1000 tokens · 0s/)).toBeInTheDocument();
  });

  it("renders mission:failed with missing message (covers ?? '(no message)' branch at line 134)", () => {
    // message is undefined → '(no message)'
    const events = [makeEvent('playground.mission:failed', {})];
    render(<RawEventLog events={events} />);
    expect(screen.getByText('Mission failed')).toBeInTheDocument();
    expect(screen.getByText('(no message)')).toBeInTheDocument();
  });

  it("renders stage:completed reviewer with missing decision (covers ?? '?' branch at line 168)", () => {
    // stage=reviewer, score=80, decision=undefined → '?'
    const events = [
      makeEvent('playground.stage:completed', { stage: 'reviewer', score: 80 }),
    ];
    render(<RawEventLog events={events} />);
    expect(screen.getByText(/consensus score 80 · \?/)).toBeInTheDocument();
  });
});
