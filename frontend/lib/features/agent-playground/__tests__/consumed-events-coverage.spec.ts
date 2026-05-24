/**
 * consumed-events-coverage.spec.ts
 *
 * Guard: every event-type suffix that derive.ts and todo-ledger.ts CONSUME must
 * appear in the known-suffix allowlist below.  The goal is to catch a handler
 * that uses a suffix that was never registered / never emitted by the backend
 * (e.g., a typo, a stale old name, a rename that wasn't propagated).
 *
 * How to read the failure:
 *   "consumed set is NOT a subset of known suffixes: { 'foo:bar' }"
 *   → derive.ts or todo-ledger.ts has a case/if-branch for 'foo:bar' but the
 *     backend never emits it (or it was renamed).  Fix: either update the
 *     handler to the real suffix, or add the new suffix to KNOWN_SUFFIXES below
 *     with a comment explaining why it is expected.
 *
 * Maintenance:
 *   - When backend adds a new event, add the suffix to KNOWN_SUFFIXES.
 *   - When derive.ts / todo-ledger.ts adds a new handler, add it to
 *     CONSUMED_IN_DERIVE or CONSUMED_IN_TODO_LEDGER accordingly.
 *   - The test asserts CONSUMED ⊆ KNOWN — it does NOT assert every KNOWN
 *     suffix is consumed (that would be too strict; some events are consumed
 *     only in one file or not yet handled on the FE).
 *
 * Source of truth for backend-emitted suffixes:
 *   backend/src/modules/ai-app/agent-playground/playground.config.ts (step ids)
 *   backend/src/modules/ai-harness/ dispatcher / mission-stage-bindings
 */

import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Suffixes CONSUMED by derive.ts (the `t === '...'` branches after namespace strip)
// ---------------------------------------------------------------------------
const CONSUMED_IN_DERIVE: readonly string[] = [
  'mission:started',
  'mission:completed',
  'mission:failed',
  'mission:rejected',
  'mission:cancelled',
  'stage:lifecycle',
  'stage:started', // legacy compat (pre-单轨化 fixtures)
  'stage:completed', // legacy compat
  'dimension:retrying',
  'dimensions:appended',
  'agent:lifecycle',
  'agent:thought',
  'agent:action',
  'agent:observation',
  'agent:reflection',
  'agent:error',
  'cost:tick',
  'verifier:verdict',
  'memory:indexed',
  'report:draft',
  'mission:preflight-warning',
  'dimension:outline:planned',
  'chapter:writing:started',
  'chapter:writing:completed',
  'chapter:review:completed',
  'chapter:revision',
  'chapter:done',
  'dimension:integrating:completed',
  'dimension:integrating:failed',
  'dimension:graded',
];

// ---------------------------------------------------------------------------
// Suffixes CONSUMED by todo-ledger.ts (the `t === '...'` branches)
// ---------------------------------------------------------------------------
const CONSUMED_IN_TODO_LEDGER: readonly string[] = [
  'mission:started',
  'agent:narrative',
  'mission:budget-warning-soft',
  'mission:budget-warning-hard',
  'budget:warning-soft',
  'budget:exhausted',
  'mission:postlude:started',
  'mission:postlude:completed',
  'mission:postlude:failed',
  'stage:stalled',
  'stage:degraded',
  'mission:execution-aborted',
  'stage:lifecycle',
  'mission:evolved',
  'dimensions:appended',
  'leader:goals-set',
  'leader:decision',
  'leader:foreword',
  'leader:signed',
  'dimension:retrying',
  'dimension:retry-failed',
  'mission:degraded',
  'dimension:research:started',
  'dimension:research:completed',
  'researcher:completed',
];

// ---------------------------------------------------------------------------
// KNOWN suffixes: the full set of event suffixes the backend is known to emit
// for agent-playground missions.  Consumed set must be a subset of this.
// Source: backend dispatcher, playground.config.ts, mission-runtime-shell,
//         stage-lifecycle emitter, orchestrator hooks.
// ---------------------------------------------------------------------------
const KNOWN_SUFFIXES: ReadonlySet<string> = new Set([
  // Mission lifecycle
  'mission:started',
  'mission:completed',
  'mission:failed',
  'mission:rejected',
  'mission:cancelled',
  'mission:degraded',
  'mission:execution-aborted',
  'mission:preflight-warning',
  'mission:evolved',
  'mission:rerun-completed',
  'mission:rerun-failed',
  'rerun:cascade-aborted',

  // Budget
  'mission:budget-warning-soft',
  'mission:budget-warning-hard',
  'budget:warning-soft',
  'budget:exhausted',

  // Postlude (S12 fire-and-forget)
  'mission:postlude:started',
  'mission:postlude:completed',
  'mission:postlude:failed',

  // Stage (单轨化: stage:lifecycle is the canonical emit)
  'stage:lifecycle',
  'stage:started', // legacy: pre-单轨化 missions still have this in DB
  'stage:completed', // legacy
  'stage:stalled',
  'stage:degraded',
  'stage:metrics', // still emitted by backend (DB compat), not consumed FE

  // Agent
  'agent:lifecycle',
  'agent:thought',
  'agent:action',
  'agent:observation',
  'agent:reflection',
  'agent:error',
  'agent:narrative',

  // Cost
  'cost:tick',

  // Verifier
  'verifier:verdict',

  // Memory
  'memory:indexed',

  // Report
  'report:draft',

  // Dimensions
  'dimensions:appended',
  'dimension:retrying',
  'dimension:retry-failed',
  'dimension:research:started',
  'dimension:research:completed',
  'dimension:graded',
  'dimension:outline:planned',
  'dimension:integrating:completed',
  'dimension:integrating:failed',

  // Chapters
  'chapter:writing:started',
  'chapter:writing:completed',
  'chapter:review:completed',
  'chapter:revision',
  'chapter:done',

  // Researcher
  'researcher:completed',

  // Leader
  'leader:goals-set',
  'leader:decision',
  'leader:foreword',
  'leader:signed',
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('consumed-events-coverage', () => {
  it('all suffixes consumed by derive.ts are in the known-suffix list', () => {
    const unknown = CONSUMED_IN_DERIVE.filter((s) => !KNOWN_SUFFIXES.has(s));
    expect(
      unknown,
      `derive.ts consumes suffix(es) NOT in KNOWN_SUFFIXES: ${JSON.stringify(unknown)}\n` +
        'Fix: either update the handler to the real suffix, or add to KNOWN_SUFFIXES.'
    ).toHaveLength(0);
  });

  it('all suffixes consumed by todo-ledger.ts are in the known-suffix list', () => {
    const unknown = CONSUMED_IN_TODO_LEDGER.filter(
      (s) => !KNOWN_SUFFIXES.has(s)
    );
    expect(
      unknown,
      `todo-ledger.ts consumes suffix(es) NOT in KNOWN_SUFFIXES: ${JSON.stringify(unknown)}\n` +
        'Fix: either update the handler to the real suffix, or add to KNOWN_SUFFIXES.'
    ).toHaveLength(0);
  });

  it('combined consumed set is a subset of known suffixes (no orphan handlers)', () => {
    const combined = new Set([
      ...CONSUMED_IN_DERIVE,
      ...CONSUMED_IN_TODO_LEDGER,
    ]);
    const orphans = [...combined].filter((s) => !KNOWN_SUFFIXES.has(s));
    expect(
      orphans,
      `consumed set is NOT a subset of known suffixes: ${JSON.stringify(orphans)}`
    ).toHaveLength(0);
  });

  it('consumed sets are internally consistent (no duplicates that differ only in casing)', () => {
    const allConsumed = [...CONSUMED_IN_DERIVE, ...CONSUMED_IN_TODO_LEDGER];
    const lower = allConsumed.map((s) => s.toLowerCase());
    const hasCaseDrift = lower.some((s, i) => allConsumed[i] !== s);
    expect(hasCaseDrift).toBe(false);
  });
});
