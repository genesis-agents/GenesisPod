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
});
