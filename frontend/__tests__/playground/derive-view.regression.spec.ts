/**
 * derive-view.regression.spec.ts
 *
 * Regression suite for deriveView() using real production event fixtures.
 * Guards against runtime contract drift between backend emit shapes and
 * frontend assumptions (e.g., treating object[] as string[], incorrect
 * payload field access that passes typecheck but throws at runtime).
 *
 * Fixtures: frontend/__tests__/__fixtures__/playground/{status}-{shortId}.json
 * Each fixture: { mission: {...}, events: [{ type, payload, agentId, traceId, timestamp }] }
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { deriveView } from '@/lib/agent-playground/derive';
import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, '../__fixtures__/playground');

interface FixtureFile {
  name: string;
  status: string;
  events: PlaygroundEvent[];
}

function loadFixtures(): FixtureFile[] {
  if (!fs.existsSync(FIXTURES_DIR)) return [];
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((name) => {
      const raw = JSON.parse(
        fs.readFileSync(path.join(FIXTURES_DIR, name), 'utf8')
      ) as { mission: Record<string, unknown>; events: PlaygroundEvent[] };
      // status is everything before the last 8-char short-id segment
      // e.g. "quality-failed-da6e2af7.json" → "quality-failed"
      // e.g. "completed-29753565.json" → "completed"
      const withoutExt = name.replace(/\.json$/, '');
      const parts = withoutExt.split('-');
      const status = parts.slice(0, -1).join('-') || 'unknown';
      return { name, status, events: raw.events };
    });
}

const fixtures = loadFixtures();

// ---------------------------------------------------------------------------
// Helper assertions
// ---------------------------------------------------------------------------

function assertValidDerivedView(name: string, events: PlaygroundEvent[]) {
  // Must not throw
  const view = deriveView(events);

  // Top-level shape exists
  expect(view, `${name}: view is defined`).toBeDefined();
  expect(view.mission, `${name}: mission is defined`).toBeDefined();
  expect(Array.isArray(view.stages), `${name}: stages is array`).toBe(true);
  expect(Array.isArray(view.agents), `${name}: agents is array`).toBe(true);
  expect(Array.isArray(view.verdicts), `${name}: verdicts is array`).toBe(true);
  expect(Array.isArray(view.reports), `${name}: reports is array`).toBe(true);
  expect(
    view.dimensionPipelines instanceof Map,
    `${name}: dimensionPipelines is Map`
  ).toBe(true);
  expect(view.cost, `${name}: cost is defined`).toBeDefined();
  expect(
    typeof view.cost.tokensUsed,
    `${name}: cost.tokensUsed is number`
  ).toBe('number');
  expect(typeof view.cost.costUsd, `${name}: cost.costUsd is number`).toBe(
    'number'
  );
  expect(
    Array.isArray(view.cost.byStage),
    `${name}: cost.byStage is array`
  ).toBe(true);

  // Agents have required fields
  for (const agent of view.agents) {
    expect(typeof agent.agentId, `${name}: agent.agentId is string`).toBe(
      'string'
    );
    expect(typeof agent.role, `${name}: agent.role is string`).toBe('string');
    expect(
      ['pending', 'running', 'completed', 'failed'],
      `${name}: agent.phase is valid enum`
    ).toContain(agent.phase);
    expect(Array.isArray(agent.trace), `${name}: agent.trace is array`).toBe(
      true
    );
  }

  // Stages have required fields
  const VALID_STAGE_IDS = new Set([
    'leader',
    'researchers',
    'analyst',
    'writer',
    'reviewer',
  ]);
  for (const stage of view.stages) {
    expect(
      VALID_STAGE_IDS.has(stage.id),
      `${name}: stage.id "${stage.id}" is valid`
    ).toBe(true);
    expect(
      ['pending', 'running', 'done', 'failed'],
      `${name}: stage.status is valid enum`
    ).toContain(stage.status);
  }

  // DimensionPipelines — each pipeline has chapters array
  for (const [key, pipeline] of view.dimensionPipelines) {
    expect(
      Array.isArray(pipeline.chapters),
      `${name}: pipeline[${key}].chapters is array`
    ).toBe(true);
    for (const ch of pipeline.chapters) {
      expect(typeof ch.index, `${name}: chapter.index is number`).toBe(
        'number'
      );
      expect(typeof ch.heading, `${name}: chapter.heading is string`).toBe(
        'string'
      );
      expect(typeof ch.attempts, `${name}: chapter.attempts is number`).toBe(
        'number'
      );
    }
  }

  // Verdicts have required numeric score
  for (const verdict of view.verdicts) {
    expect(typeof verdict.score, `${name}: verdict.score is number`).toBe(
      'number'
    );
  }

  return view;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveView regression — prod fixtures', () => {
  if (fixtures.length === 0) {
    it.skip('no fixture files found', () => {});
    return;
  }

  it.each(fixtures.map((f) => [f.name, f] as [string, FixtureFile]))(
    'should not throw and return valid shape for fixture: %s',
    (_name, fixture) => {
      assertValidDerivedView(fixture.name, fixture.events);
    }
  );

  // Status-specific assertions
  it('completed fixture has mission.completedAt set', () => {
    const completed = fixtures.find((f) => f.status === 'completed');
    if (!completed) {
      console.warn('No completed fixture — skipping status-specific assertion');
      return;
    }
    const view = deriveView(completed.events);
    expect(view.mission.completedAt).toBeDefined();
    expect(typeof view.mission.completedAt).toBe('number');
  });

  it('failed fixture has mission.failedAt or cancelledAt set', () => {
    const failed = fixtures.find((f) => f.status === 'failed');
    if (!failed) {
      console.warn('No failed fixture — skipping status-specific assertion');
      return;
    }
    const view = deriveView(failed.events);
    const hasTerminal =
      view.mission.failedAt != null ||
      view.mission.cancelledAt != null ||
      // quality-failed missions may end via completedAt with finalScore set
      view.mission.completedAt != null;
    expect(
      hasTerminal,
      'failed mission should have some terminal timestamp in view'
    ).toBe(true);
  });

  it('cancelled fixture has mission.cancelledAt set', () => {
    const cancelled = fixtures.find((f) => f.status === 'cancelled');
    if (!cancelled) {
      console.warn('No cancelled fixture — skipping status-specific assertion');
      return;
    }
    const view = deriveView(cancelled.events);
    expect(view.mission.cancelledAt).toBeDefined();
  });

  it('quality-failed fixture produces agents and dimension pipelines', () => {
    const qf = fixtures.find((f) => f.status === 'quality-failed');
    if (!qf) {
      console.warn(
        'No quality-failed fixture — skipping status-specific assertion'
      );
      return;
    }
    const view = deriveView(qf.events);
    // quality-failed missions run full pipeline — should have researchers + pipelines
    expect(view.agents.length).toBeGreaterThan(0);
    expect(view.dimensionPipelines.size).toBeGreaterThan(0);
  });

  // Contract-drift guard: the bug that triggered this suite
  // backend emits recommendations as object[] in mission:evolved, not string[].
  // deriveView itself doesn't process mission:evolved (that's todo-ledger),
  // but we verify the broader pipeline survives unknown extra event types.
  it('does not throw on events with object-valued payload fields', () => {
    const syntheticEvent: PlaygroundEvent = {
      type: 'agent-playground.stage:lifecycle',
      payload: {
        stage: 's3-researchers',
        stepId: 's3-researcher-collect',
        status: 'completed',
        output: {
          // results is object[][] not string[][] — this was the contract drift bug
          results: [[{ summary: 'finding', sourceCount: 5 }]],
          failureCount: 0,
        },
      },
      timestamp: Date.now(),
    };
    // Should not throw
    expect(() => deriveView([syntheticEvent])).not.toThrow();
  });

  it('handles empty events array gracefully', () => {
    const view = deriveView([]);
    expect(view.mission).toBeDefined();
    expect(view.agents).toHaveLength(0);
    expect(view.stages).toHaveLength(5); // STAGE_ORDER always populated
  });

  // ---------------------------------------------------------------------------
  // ★ 2026-05-06 #75 regression: "兜底完成 · 整合降级" 误标
  // backend integrator state='degraded' 时 emit dimension:integrating:completed
  // with degraded=true，前端 derive 设 pipeline.integrationDegraded=true。
  // 但 fullMarkdown 由代码确定性拼接（per-dim-pipeline.util.ts:1225），不依赖
  // integrator LLM。后续 quality-judge 给该 dim 92 excellent 时不该再展示
  // "兜底完成"误导用户。修：dim:graded overall>=60 且未 failed → 清 flag。
  // ---------------------------------------------------------------------------
  it('#75: dim:graded overall>=60 clears integrationDegraded set by integrating:completed', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.dimension:integrating:completed',
        payload: { dimension: '推理成本', degraded: true },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.dimension:graded',
        payload: { dimension: '推理成本', overall: 92, grade: 'excellent' },
        timestamp: 2000,
      },
    ];
    const view = deriveView(events);
    const pipeline = view.dimensionPipelines.get('推理成本');
    expect(pipeline).toBeDefined();
    // 关键：grade 通过后 integrationDegraded 必须被清掉
    expect(pipeline!.integrationDegraded).toBeFalsy();
    expect(pipeline!.grade?.overall).toBe(92);
  });

  it('#75: dim:graded overall<60 keeps integrationDegraded (low score 不清 flag)', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.dimension:integrating:completed',
        payload: { dimension: '低分 dim', degraded: true },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.dimension:graded',
        payload: { dimension: '低分 dim', overall: 50, grade: 'poor' },
        timestamp: 2000,
      },
    ];
    const view = deriveView(events);
    const pipeline = view.dimensionPipelines.get('低分 dim');
    // 低分时保留 degraded flag（用户看到"兜底完成"是合理的）
    expect(pipeline!.integrationDegraded).toBe(true);
  });

  it('#75: dim:graded failed=true keeps integrationDegraded even with high overall', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.dimension:integrating:completed',
        payload: { dimension: 'failed dim', degraded: true },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.dimension:graded',
        payload: {
          dimension: 'failed dim',
          overall: 80,
          grade: 'good',
          failed: true,
          phase: 'grade-failed',
        },
        timestamp: 2000,
      },
    ];
    const view = deriveView(events);
    const pipeline = view.dimensionPipelines.get('failed dim');
    // failed=true 时保留 degraded（即使 overall 80，grade 是兜底 sentinel 不可信）
    expect(pipeline!.integrationDegraded).toBe(true);
  });

  it('#75: dim:graded without prior integrating:completed (no degraded set) - 不变', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.dimension:graded',
        payload: { dimension: 'normal', overall: 92, grade: 'excellent' },
        timestamp: 1000,
      },
    ];
    const view = deriveView(events);
    const pipeline = view.dimensionPipelines.get('normal');
    expect(pipeline!.grade?.overall).toBe(92);
    // 没有 prior degraded，flag 应该是 false 或 undefined
    expect(pipeline!.integrationDegraded).toBeFalsy();
  });
});
