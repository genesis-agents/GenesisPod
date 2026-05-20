import { describe, expect, it } from 'vitest';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';
import { deriveView } from '@/lib/features/agent-playground/derive';

function makeEvent(
  type: string,
  payload: Record<string, unknown>,
  timestamp: number
): PlaygroundEvent {
  return { type, payload, timestamp };
}

describe('deriveView cost totals', () => {
  it('sums delta-only cost ticks into total tokens and cost', () => {
    const view = deriveView([
      makeEvent(
        'agent-playground.cost:tick',
        { stage: 'researchers', deltaTokens: 120, deltaCostUsd: 0.00036 },
        1
      ),
      makeEvent(
        'agent-playground.cost:tick',
        { stage: 'researchers', deltaTokens: 80, deltaCostUsd: 0.00024 },
        2
      ),
    ]);

    expect(view.cost.tokensUsed).toBe(200);
    expect(view.cost.costUsd).toBeCloseTo(0.0006);
    expect(view.cost.byStage).toHaveLength(1);
    expect(view.cost.byStage[0]?.stage).toBe('researchers');
    expect(view.cost.byStage[0]?.tokensUsed).toBe(200);
    expect(view.cost.byStage[0]?.costUsd).toBeCloseTo(0.0006);
  });

  it('keeps larger cumulative totals when both cumulative and delta values exist', () => {
    const view = deriveView([
      makeEvent(
        'agent-playground.cost:tick',
        {
          stage: 'leader',
          deltaTokens: 50,
          deltaCostUsd: 0.00015,
          tokensUsed: 50,
          costUsd: 0.00015,
        },
        1
      ),
      makeEvent(
        'agent-playground.cost:tick',
        {
          stage: 'researchers',
          deltaTokens: 100,
          deltaCostUsd: 0.0003,
          tokensUsed: 180,
          costUsd: 0.00054,
        },
        2
      ),
    ]);

    expect(view.cost.tokensUsed).toBe(180);
    expect(view.cost.costUsd).toBeCloseTo(0.00054);
  });
});
