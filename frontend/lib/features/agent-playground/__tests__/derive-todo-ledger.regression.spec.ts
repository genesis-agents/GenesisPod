/**
 * derive-todo-ledger.regression.spec.ts
 *
 * Regression suite for deriveTodoLedger() using real production event fixtures.
 *
 * Background (2026-05-06 incident):
 *   Backend emit payload for `mission:evolved` had `recommendations` as
 *   object[] (not string[]).  Frontend called `.slice()` on individual items
 *   assuming string, causing a TypeError at runtime.  typecheck + unit tests
 *   were green because fixture data was synthetic and always string[].
 *
 * These specs replay the actual prod event stream through deriveTodoLedger()
 *   and assert structural invariants — catching contract drift that passes TS
 *   but breaks at runtime.
 *
 * Fixtures: frontend/lib/agent-playground/__tests__/__fixtures__/{status}-{shortId}.json
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { deriveView } from '@/lib/features/agent-playground/derive';
import { deriveTodoLedger } from '@/lib/features/agent-playground/todo-ledger';
import type { PlaygroundEvent } from '@/hooks/features/useAgentPlaygroundStream';
import type { MissionTodo } from '@/lib/features/agent-playground/todo-ledger';

// ---------------------------------------------------------------------------
// Fixture loading
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, '__fixtures__');

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
// Valid status values for MissionTodoStatus
// ---------------------------------------------------------------------------

const VALID_TODO_STATUSES = new Set([
  'pending',
  'in_progress',
  'blocked',
  'done',
  'failed',
  'cancelled',
]);

const VALID_TODO_ORIGINS = new Set([
  'leader-plan',
  'leader-assess-retry',
  'leader-assess-replace',
  'leader-assess-extend',
  'leader-assess-abort',
  'leader-chat-create',
  'self-heal-retry',
  'reviewer-revise',
  'critic-blindspot',
  'reconciler-gap',
  'system-stage',
  'chapter-pipeline',
]);

const VALID_TODO_SCOPES = new Set([
  'mission',
  'dimension',
  'chapter',
  'review',
  'system',
]);

// ---------------------------------------------------------------------------
// Helper: run the full pipeline (deriveView → deriveTodoLedger)
// ---------------------------------------------------------------------------

function runPipeline(events: PlaygroundEvent[]): MissionTodo[] {
  const view = deriveView(events);
  return deriveTodoLedger({
    events,
    mission: view.mission,
    agents: view.agents,
    verdicts: view.verdicts,
    dimensionPipelines: view.dimensionPipelines,
  });
}

// ---------------------------------------------------------------------------
// Helper: assert structural invariants for a MissionTodo[]
// ---------------------------------------------------------------------------

function assertTodoListInvariants(name: string, todos: MissionTodo[]) {
  expect(Array.isArray(todos), `${name}: todos is array`).toBe(true);

  for (const todo of todos) {
    // Required string fields
    expect(typeof todo.id, `${name}[${todo.id}]: id is string`).toBe('string');
    expect(todo.id.length, `${name}[${todo.id}]: id non-empty`).toBeGreaterThan(
      0
    );

    // Status is a valid enum value
    expect(
      VALID_TODO_STATUSES.has(todo.status),
      `${name}[${todo.id}]: status "${todo.status}" is valid`
    ).toBe(true);

    // Origin is a valid enum value
    expect(
      VALID_TODO_ORIGINS.has(todo.origin),
      `${name}[${todo.id}]: origin "${todo.origin}" is valid`
    ).toBe(true);

    // Scope is a valid enum value
    expect(
      VALID_TODO_SCOPES.has(todo.scope),
      `${name}[${todo.id}]: scope "${todo.scope}" is valid`
    ).toBe(true);

    // Arrays are arrays (key contract that breaks if backend sends objects)
    expect(
      Array.isArray(todo.narrativeLog),
      `${name}[${todo.id}]: narrativeLog is array`
    ).toBe(true);
    expect(
      Array.isArray(todo.artifacts),
      `${name}[${todo.id}]: artifacts is array`
    ).toBe(true);

    // narrativeLog items have ts (number) and text (string)
    for (const item of todo.narrativeLog) {
      expect(
        typeof item.ts,
        `${name}[${todo.id}]: narrativeLog item.ts is number`
      ).toBe('number');
      expect(
        typeof item.text,
        `${name}[${todo.id}]: narrativeLog item.text is string`
      ).toBe('string');
    }

    // artifact items have kind and label as strings
    for (const artifact of todo.artifacts) {
      expect(
        typeof artifact.kind,
        `${name}[${todo.id}]: artifact.kind is string`
      ).toBe('string');
      expect(
        typeof artifact.label,
        `${name}[${todo.id}]: artifact.label is string`
      ).toBe('string');
    }

    // assignee has a role string
    expect(
      typeof todo.assignee.role,
      `${name}[${todo.id}]: assignee.role is string`
    ).toBe('string');

    // Timestamps, if set, are numbers
    if (todo.startedAt != null) {
      expect(
        typeof todo.startedAt,
        `${name}[${todo.id}]: startedAt is number`
      ).toBe('number');
    }
    if (todo.endedAt != null) {
      expect(
        typeof todo.endedAt,
        `${name}[${todo.id}]: endedAt is number`
      ).toBe('number');
    }
    if (todo.createdAt != null) {
      expect(
        typeof todo.createdAt,
        `${name}[${todo.id}]: createdAt is number`
      ).toBe('number');
    }
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('deriveTodoLedger regression — prod fixtures', () => {
  if (fixtures.length === 0) {
    it.skip('no fixture files found', () => {});
    return;
  }

  it.each(fixtures.map((f) => [f.name, f] as [string, FixtureFile]))(
    'should not throw and return structurally valid todos for fixture: %s',
    (_name, fixture) => {
      const todos = runPipeline(fixture.events);
      assertTodoListInvariants(fixture.name, todos);
    }
  );

  // Status-specific checks
  it('completed fixture produces at least one "done" system stage todo', () => {
    const completed = fixtures.find((f) => f.status === 'completed');
    if (!completed) {
      console.warn('No completed fixture — skipping');
      return;
    }
    const todos = runPipeline(completed.events);
    const doneTodos = todos.filter((t) => t.status === 'done');
    expect(
      doneTodos.length,
      'completed mission should have done stage todos'
    ).toBeGreaterThan(0);
  });

  it('completed fixture structural invariants hold even if no leader-plan dim todos', () => {
    // Note: missions using old stage:completed format (pre-single-track pipeline)
    // do NOT produce leader-plan dimension todos from deriveTodoLedger because
    // the ledger only reads them from stage:lifecycle(stepId=s2-leader-plan).
    // This assertion validates the pipeline does not crash and returns valid todos.
    const completed = fixtures.find((f) => f.status === 'completed');
    if (!completed) {
      console.warn('No completed fixture — skipping');
      return;
    }
    const todos = runPipeline(completed.events);
    expect(Array.isArray(todos)).toBe(true);
    assertTodoListInvariants('completed', todos);

    // Any leader-plan dim todos that DO exist must have dimensionRef
    const dimTodos = todos.filter((t) => t.origin === 'leader-plan');
    for (const dt of dimTodos) {
      expect(
        typeof dt.dimensionRef,
        `dimension todo "${dt.title}" should have dimensionRef`
      ).toBe('string');
    }
  });

  it('cancelled fixture produces at least one todo', () => {
    const cancelled = fixtures.find((f) => f.status === 'cancelled');
    if (!cancelled) {
      console.warn('No cancelled fixture — skipping');
      return;
    }
    const todos = runPipeline(cancelled.events);
    expect(todos.length).toBeGreaterThan(0);
  });

  it('quality-failed fixture produces todos without throwing', () => {
    const qf = fixtures.find((f) => f.status === 'quality-failed');
    if (!qf) {
      console.warn('No quality-failed fixture — skipping');
      return;
    }
    const todos = runPipeline(qf.events);
    expect(Array.isArray(todos)).toBe(true);
    assertTodoListInvariants('quality-failed', todos);
  });

  // ---------------------------------------------------------------------------
  // Contract-drift guard: the EXACT bug from 2026-05-06
  // backend mission:evolved recommendations was object[] not string[].
  // The old code called rec.slice() on each item — this blows up on objects.
  // The fixed code (in todo-ledger.ts) defensively coerces to string via JSON.
  // This test replicates the exact payload shape that caused the crash.
  // ---------------------------------------------------------------------------

  it('does not throw when mission:evolved has recommendations as object[] (2026-05-06 bug)', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: { input: { topic: 'Test', depth: 'quick', language: 'en' } },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.mission:evolved',
        payload: {
          // This is the exact shape that caused the 2026-05-06 crash:
          // recommendations is object[] instead of string[]
          recommendations: [
            {
              category: 'coverage',
              suggestion: 'Add more sources',
              priority: 'high',
            },
            {
              category: 'depth',
              suggestion: 'Increase analysis depth',
              priority: 'medium',
            },
          ],
          qualityHitRate: 0.75,
          retryTotal: 2,
          leaderSigned: false,
        },
        timestamp: 2000,
      },
    ];

    // Must not throw
    expect(() => runPipeline(events)).not.toThrow();

    const todos = runPipeline(events);
    const s12 = todos.find((t) => t.id === 'system:s12-self-evolution');

    if (s12) {
      // narrativeLog items must be strings (coerced from objects)
      for (const item of s12.narrativeLog) {
        expect(typeof item.text).toBe('string');
        expect(item.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('does not throw when dimensions:appended has items as object[] with non-string fields', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: { input: { topic: 'Test', depth: 'quick', language: 'en' } },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.dimensions:appended',
        payload: {
          // items could have numeric id or missing rationale in edge cases
          items: [
            {
              id: 'dim-appended-1',
              name: 'Extra Dimension',
              rationale: 'Added dynamically',
            },
          ],
        },
        timestamp: 2000,
      },
    ];

    expect(() => runPipeline(events)).not.toThrow();
    const todos = runPipeline(events);
    const appended = todos.filter((t) => t.origin === 'leader-chat-create');
    expect(appended.length).toBe(1);
  });

  it('handles empty events gracefully', () => {
    const todos = runPipeline([]);
    expect(Array.isArray(todos)).toBe(true);
    // With no mission:started, no presets are inserted
    expect(todos.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // ★ 2026-05-06 #86 regression: 自我进化"已放弃"
  // mission:completed 触发时 cancel 所有 pending todos，但 s12-self-evolution
  // 是 fire-and-forget postlude（mission:completed 之后才 emit
  // mission:postlude:started），不能被误标 cancelled 否则 line 624 if(pending) 失效。
  // ---------------------------------------------------------------------------
  it('#86: mission:completed does NOT cancel pending s12-self-evolution', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: { input: { topic: 'Test', depth: 'quick', language: 'en' } },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.mission:completed',
        payload: { reportFull: { title: 'x' } },
        timestamp: 2000,
      },
    ];
    const todos = runPipeline(events);
    const s12 = todos.find((t) => t.id === 'system:s12-self-evolution');
    if (s12) {
      // mission:completed 时 s12 应保持 pending（未被白名单逻辑误 cancel）
      expect(s12.status).toBe('pending');
    }
  });

  it('#86: mission:postlude:started after mission:completed transitions s12 to in_progress', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: { input: { topic: 'Test', depth: 'quick', language: 'en' } },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.mission:completed',
        payload: { reportFull: { title: 'x' } },
        timestamp: 2000,
      },
      {
        type: 'agent-playground.mission:postlude:started',
        payload: {},
        timestamp: 3000,
      },
    ];
    const todos = runPipeline(events);
    const s12 = todos.find((t) => t.id === 'system:s12-self-evolution');
    expect(s12).toBeDefined();
    // 关键：必须切到 in_progress（而不是被前面 mission:completed 的 cancel 误标 cancelled）
    expect(s12!.status).toBe('in_progress');
  });

  it('#86: mission:postlude:completed transitions s12 to done', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: { input: { topic: 'Test', depth: 'quick', language: 'en' } },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.mission:completed',
        payload: { reportFull: { title: 'x' } },
        timestamp: 2000,
      },
      {
        type: 'agent-playground.mission:postlude:started',
        payload: {},
        timestamp: 3000,
      },
      {
        type: 'agent-playground.mission:postlude:completed',
        payload: { qualityHitRate: 0.8 },
        timestamp: 4000,
      },
    ];
    const todos = runPipeline(events);
    const s12 = todos.find((t) => t.id === 'system:s12-self-evolution');
    expect(s12!.status).toBe('done');
  });

  // ---------------------------------------------------------------------------
  // ★ 2026-05-06 chapter todo regression specs
  // chapter:writing:started creates a child todo under the dim todo,
  // chapter:done finalizes it to 'done', and mission:completed cancels
  // any still-pending chapter todos.
  // ---------------------------------------------------------------------------

  it('chapter:writing:started creates chapter todo with parentId = dim todo id', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: {
          input: { topic: 'Test', depth: 'thorough', language: 'en' },
        },
        timestamp: 1000,
      },
      // S2: leader plan emits dimensions (stage + stepId both required; id field used for todo key)
      {
        type: 'agent-playground.stage:lifecycle',
        payload: {
          stage: 's2-leader-plan',
          stepId: 's2-leader-plan',
          status: 'completed',
          output: {
            dimensions: [
              { id: 'dim-a', name: 'Dim A', rationale: 'test rationale' },
            ],
            themeSummary: 'Test theme',
          },
        },
        timestamp: 2000,
      },
      {
        type: 'agent-playground.chapter:writing:started',
        payload: {
          dimension: 'Dim A',
          chapterIndex: 0,
          heading: '第一章',
          attempt: 1,
        },
        timestamp: 3000,
      },
    ];

    const todos = runPipeline(events);

    const chapterTodo = todos.find((t) => t.id === 'chapter:Dim A:0');
    expect(chapterTodo).toBeDefined();
    expect(chapterTodo!.scope).toBe('chapter');
    expect(chapterTodo!.origin).toBe('chapter-pipeline');
    expect(chapterTodo!.status).toBe('in_progress');
    expect(chapterTodo!.title).toBe('第一章');
    expect(chapterTodo!.assignee.role).toBe('writer');

    // parentId should point to the dim todo (keyed by dimension id)
    const dimTodo = todos.find(
      (t) => t.scope === 'dimension' && t.dimensionRef === 'Dim A'
    );
    expect(dimTodo).toBeDefined();
    expect(chapterTodo!.parentId).toBe(dimTodo!.id);
  });

  it('chapter:done transitions chapter todo to done; in_progress chapter finalized on mission:completed', () => {
    const events: PlaygroundEvent[] = [
      {
        type: 'agent-playground.mission:started',
        payload: {
          input: { topic: 'Test', depth: 'thorough', language: 'en' },
        },
        timestamp: 1000,
      },
      {
        type: 'agent-playground.stage:lifecycle',
        payload: {
          stage: 's2-leader-plan',
          stepId: 's2-leader-plan',
          status: 'completed',
          output: {
            dimensions: [{ id: 'dim-b', name: 'Dim B', rationale: 'test' }],
            themeSummary: 'Theme B',
          },
        },
        timestamp: 2000,
      },
      // chapter 0 starts and finishes
      {
        type: 'agent-playground.chapter:writing:started',
        payload: {
          dimension: 'Dim B',
          chapterIndex: 0,
          heading: '章节 0',
          attempt: 1,
        },
        timestamp: 3000,
      },
      {
        type: 'agent-playground.chapter:done',
        payload: {
          dimension: 'Dim B',
          chapterIndex: 0,
          qualified: true,
          wordCount: 500,
        },
        timestamp: 4000,
      },
      // chapter 1 starts but never receives chapter:done — mission completes first
      {
        type: 'agent-playground.chapter:writing:started',
        payload: {
          dimension: 'Dim B',
          chapterIndex: 1,
          heading: '章节 1',
          attempt: 1,
        },
        timestamp: 5000,
      },
      {
        type: 'agent-playground.mission:completed',
        payload: { reportFull: { title: 'x' } },
        timestamp: 6000,
      },
    ];

    const todos = runPipeline(events);

    const ch0 = todos.find((t) => t.id === 'chapter:Dim B:0');
    expect(ch0).toBeDefined();
    expect(ch0!.status).toBe('done');
    expect(ch0!.artifacts.some((a) => a.label === '字数')).toBe(true);

    // chapter 1 was in_progress when mission completed → auto-finalized to 'done'
    const ch1 = todos.find((t) => t.id === 'chapter:Dim B:1');
    expect(ch1).toBeDefined();
    expect(ch1!.status).toBe('done');
  });
});
